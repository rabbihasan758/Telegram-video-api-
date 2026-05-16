const express = require('express');
const fetch = require('node-fetch');
const ytdl = require('ytdl-core');
const instagramGetUrl = require('instagram-get-url');
const fbDownload = require('fb-downloader');
const twitterGetUrl = require('twitter-url-direct');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// ভিডিও ডাউনলোড হ্যান্ডলার
async function getVideoUrl(url, platform) {
  if (platform === 'youtube') {
    const info = await ytdl.getInfo(url);
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestvideo' });
    if (!format) throw new Error('No video format');
    return format.url;
  } else if (platform === 'instagram') {
    const result = await instagramGetUrl(url);
    if (!result.url_list || result.url_list.length === 0) throw new Error('No video found');
    return result.url_list[0];
  } else if (platform === 'facebook') {
    const result = await fbDownload(url);
    return result.hd || result.sd || result.url;
  } else if (platform === 'twitter') {
    const result = await twitterGetUrl(url);
    if (!result.url) throw new Error('No video found');
    return result.url;
  } else {
    throw new Error('Unsupported platform');
  }
}

app.get('/api/download', async (req, res) => {
  const { url, platform } = req.query;
  if (!url || !platform) {
    return res.status(400).json({ error: 'url and platform are required' });
  }

  try {
    // 1. ভিডিও URL বের করি
    const videoUrl = await getVideoUrl(url, platform);

    // 2. টেলিগ্রামে ভিডিও পাঠাই
    const sendRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHANNEL_ID,
          video: videoUrl,
          supports_streaming: true
        })
      }
    );
    const sendData = await sendRes.json();
    if (!sendData.ok) throw new Error(sendData.description);

    const fileId = sendData.result.video.file_id;

    // 3. ফাইলের সরাসরি ডাউনলোড লিংক বানাই
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
