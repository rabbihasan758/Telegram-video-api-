const express = require('express');
const fetch = require('node-fetch');
const ytdl = require('ytdl-core');
const instagramGetUrl = require('instagram-url-direct');
const fbDownload = require('fb-downloader');
const twitterGetUrl = require('twitter-url-direct');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// ---------- ভিডিও URL বের করার নির্ভরযোগ্য ফাংশন ----------
async function getVideoUrl(url, platform) {
  switch (platform) {
    case 'youtube': {
      // প্রথম চেষ্টা ytdl-core
      try {
        const info = await ytdl.getInfo(url);
        const format = ytdl.chooseFormat(info.formats, { quality: 'highestvideo' });
        if (format?.url) return format.url;
      } catch {}
      // দ্বিতীয় চেষ্টা @distube/ytdl-core
      try {
        const distube = require('@distube/ytdl-core');
        const info2 = await distube.getInfo(url);
        const format2 = distube.chooseFormat(info2.formats, { quality: 'highestvideo' });
        if (format2?.url) return format2.url;
      } catch {}
      throw new Error('YouTube video not found');
    }

    case 'instagram': {
      const data = await instagramGetUrl(url);
      if (data?.url_list && data.url_list.length > 0) return data.url_list[0];
      throw new Error('Instagram video not found');
    }

    case 'facebook': {
      const data = await fbDownload(url);
      const vid = data?.hd || data?.sd || data?.url;
      if (vid) return vid;
      throw new Error('Facebook video not found');
    }

    case 'twitter': {
      const data = await twitterGetUrl(url);
      if (data?.url) return data.url;
      throw new Error('Twitter video not found');
    }

    default:
      throw new Error('Unsupported platform');
  }
}

// ---------- API এন্ডপয়েন্ট ----------
app.get('/api/download', async (req, res) => {
  const { url, platform } = req.query;
  if (!url || !platform) {
    return res.status(400).json({ error: 'url and platform required' });
  }

  try {
    // 1. প্ল্যাটফর্ম থেকে সরাসরি ভিডিও URL নিন
    const videoUrl = await getVideoUrl(url, platform);

    // 2. টেলিগ্রাম চ্যানেলে ভিডিও পাঠান
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
    if (!sendData.ok) throw new Error(sendData.description || 'Telegram sendVideo failed');

    const fileId = sendData.result.video.file_id;

    // 3. সরাসরি ডাউনলোড লিংক তৈরি
    const fileRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    const fileData = await fileRes.json();
    if (!fileData.ok) throw new Error('getFile failed');
    const filePath = fileData.result.file_path;
    const directUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    res.json({ success: true, videoUrl: directUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Download failed: ' + err.message });
  }
});

// রুট পাথ – যেন "Cannot GET /" না দেখায়
app.get('/', (req, res) => res.send('Telegram Video API is running. Supports YouTube, Instagram, Facebook, Twitter.'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
