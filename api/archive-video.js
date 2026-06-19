const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fetch = require('node-fetch');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  // Vercel parse le body en JSON automatiquement
  const { videoUrl, key } = req.body || {};
  if (!videoUrl || !key) {
    return res.status(400).json({ error: 'videoUrl et key requis' });
  }

  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL + '/' + key;

  try {
    // Verifier si la video existe deja
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return res.status(200).json({ url: publicUrl, cached: true });
    } catch (e) {
      // n existe pas: on l upload
    }

    // Telecharger depuis lefive
    const videoResp = await fetch(videoUrl);
    if (!videoResp.ok) throw new Error('Echec download: ' + videoResp.status);
    const buffer = await videoResp.buffer();

    // Upload vers R2
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: 'video/mp4',
    }));

    return res.status(200).json({ url: publicUrl, cached: false, size: buffer.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
