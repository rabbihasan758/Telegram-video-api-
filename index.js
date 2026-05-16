const express = require('express');
const fetch = require('node-fetch');
const play = require('play-dl');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// প্ল্যাটফর্ম চিহ্নিত করা (play-dl-এর জন্য)
function getPlatform(url) {
  if (/tiktok\.com/.test(url)) return 'tiktok';
  if (/instagram\.com/.test(url)) return 'instagram';
  if (/facebook\.com|fb\.watch/.test(url)) return 'facebook';
  if (/twitter\.com|x\.com/.test(url)) return 'twitter';
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  return null;
}

app.get('/api/download', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  const platform = getPlatform(url);
  if (!platform) return res.status(400).json({ error: 'Unsupported platform' });

  try {
    // play-dl দিয়ে ভিডিও স্ট্রিম / URL বের করি
    const streamInfo = await play.stream(url);
    if (!streamInfo?.url) throw new Error('No stream found');
    const videoUrl = streamInfo.url;

    // টেলিগ্রামে ভিডিও পাঠাই
    const sendRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHANNEL_ID,
          video: videoUrl,
          supports_streaming: true,
        }),
      }
    );
    const sendData = await sendRes.json();
    if (!sendData.ok) throw new Error(sendData.description);

    const fileId = sendData.result.video.file_id;

    // সরাসরি ডাউনলোড লিংক জেনারেট
    const fileRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    const fileData = await fileRes.json();
    const filePath = fileData.result.file_path;
    const directUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    res.json({ success: true, videoUrl: directUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Download failed: ' + err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
