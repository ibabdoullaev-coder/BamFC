const { S3Client, PutObjectCommand, HeadObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

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

  const { action, key, uploadId, partNumber, parts } = req.body || {};
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

    if (action === 'init') {
      // Demarrer un multipart upload
      const cmd = new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: 'video/mp4' });
      const result = await s3.send(cmd);
      return res.status(200).json({ uploadId: result.UploadId });
    }

    if (action === 'sign-part') {
      // Generer URL pre-signee pour une partie
      const cmd = new UploadPartCommand({
        Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber,
      });
      const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
      return res.status(200).json({ url });
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
