const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

// ===== CORS HEADER সেট (সব রিকোয়েস্টের জন্য) =====
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// ---------- প্ল্যাটফর্মভিত্তিক ভিডিও URL আনা (আগের মতোই) ----------
async function getVideoUrl(url, platform) {
  const apis = {
    tiktok: [
      { name: 'TikWM', url: `https://tikwm.com/api/?url=${encodeURIComponent(url)}`, field: 'data.play' },
      { name: 'TiklyDown', url: `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`, field: 'video.noWatermark' },
      { name: 'TikMate', url: `https://www.tikmate.app/api/?url=${encodeURIComponent(url)}`, field: 'video.noWatermark' }
    ],
    instagram: [
      { name: 'IGDownloader', url: `https://api.igdownloader.app/api/v1/instagram/download?url=${encodeURIComponent(url)}`, field: 'url[0].url' },
      { name: 'InstaSave', url: `https://instasave.io/api/v1/download?url=${encodeURIComponent(url)}`, field: 'video_url' },
      { name: 'SnapInsta', url: `https://snapinsta.app/api/download?url=${encodeURIComponent(url)}`, field: 'video' }
    ],
    facebook: [
      { name: 'FBDown', url: `https://fbdownloader.app/api/?url=${encodeURIComponent(url)}`, field: 'hd' },
      { name: 'FBVideoAPI', url: `https://fb-video-downloader-api.vercel.app/api/download?url=${encodeURIComponent(url)}`, field: 'video' },
      { name: 'FBDownloader', url: `https://fbdownloader.vercel.app/api/download?url=${encodeURIComponent(url)}`, field: 'video' }
    ],
    twitter: [
      { name: 'TWDown', url: `https://twdown.net/api/download?url=${encodeURIComponent(url)}`, field: 'HD' },
      { name: 'TwitterVid', url: `https://api.twittervideodownloader.com/api/download?url=${encodeURIComponent(url)}`, field: 'video_url' },
      { name: 'TwitterDL', url: `https://twitter-video-downloader-api.vercel.app/api/download?url=${encodeURIComponent(url)}`, field: 'video' }
    ],
    youtube: [
      { name: 'YtDlAPI', url: `https://ytdl-api.vercel.app/api/download?url=${encodeURIComponent(url)}`, field: 'url' },
      { name: 'Y2Mate', url: `https://y2mate-api.vercel.app/api/convert?url=${encodeURIComponent(url)}`, field: 'url' },
      { name: 'YouTubeMP4', url: `https://youtube-mp4.download/api?url=${encodeURIComponent(url)}`, field: 'url' }
    ]
  };

  if (!apis[platform]) throw new Error('Unsupported platform');

  for (const api of apis[platform]) {
    try {
      const res = await fetch(api.url);
      const json = await res.json();
      let videoUrl = api.field.split('.').reduce((o, k) => o?.[k], json);
      if (!videoUrl) videoUrl = json?.url || json?.video || json?.video_url;
      if (videoUrl && typeof videoUrl === 'string' && videoUrl.startsWith('http')) {
        return videoUrl;
      }
    } catch (e) {}
  }
  throw new Error(`${platform} video not found`);
}

// ---------- API এন্ডপয়েন্ট ----------
app.get('/api/download', async (req, res) => {
  const { url, platform } = req.query;
  if (!url || !platform) {
    return res.status(400).json({ error: 'url and platform required' });
  }

  try {
    const videoUrl = await getVideoUrl(url, platform);

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

app.get('/', (req, res) => res.send('Telegram Video API is running (all platforms).'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
