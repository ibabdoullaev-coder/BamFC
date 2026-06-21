const { S3Client, PutObjectCommand, HeadObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } = require('@aws-sdk/client-s3');
const fetch = require('node-fetch');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Streams a remote URL directly into R2 via multipart upload.
// Avoids client-side CORS and 4.5 MB Vercel body limit.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { action, videoUrl, key, uploadId, partNumber, parts, rangeStart, rangeEnd } = req.body || {};
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL + '/' + key;

  try {
    if (action === 'check') {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return res.status(200).json({ exists: true, url: publicUrl });
      } catch (e) {
        return res.status(200).json({ exists: false });
      }
    }

    if (action === 'getsize') {
      const headResp = await fetch(videoUrl, { method: 'HEAD' });
      if (!headResp.ok) return res.status(500).json({ error: 'Head failed: ' + headResp.status });
      const size = parseInt(headResp.headers.get('content-length'));
      return res.status(200).json({ size });
    }

    if (action === 'init') {
      const cmd = new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: 'video/mp4' });
      const result = await s3.send(cmd);
      return res.status(200).json({ uploadId: result.UploadId });
    }

    if (action === 'upload-part-from-url') {
      // Range download depuis lefive
      const rangeHeader = 'bytes=' + rangeStart + '-' + rangeEnd;
      const partResp = await fetch(videoUrl, { headers: { 'Range': rangeHeader } });
      if (!partResp.ok && partResp.status !== 206) {
        return res.status(500).json({ error: 'Download part failed: ' + partResp.status });
      }
      const buffer = await partResp.buffer();
      const cmd = new UploadPartCommand({
        Bucket: bucket, Key: key, UploadId: uploadId,
        PartNumber: partNumber, Body: buffer,
      });
      const upResult = await s3.send(cmd);
      return res.status(200).json({ etag: upResult.ETag });
    }

    if (action === 'complete') {
      const cmd = new CompleteMultipartUploadCommand({
        Bucket: bucket, Key: key, UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      });
      await s3.send(cmd);
      return res.status(200).json({ url: publicUrl });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
