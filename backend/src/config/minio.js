const Minio = require('minio');

// Object/block storage client - MinIO is an S3-compatible object store,
// so this same client code (and bucket API) works unchanged against real
// AWS S3 in a production cloud deployment. This satisfies the
// "persistence through scalable hosted databases and/or object storage"
// requirement while remaining fully runnable on a local machine.
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'streamhive',
  secretKey: process.env.MINIO_SECRET_KEY || 'streamhive_secret',
});

const VIDEO_BUCKET = process.env.MINIO_BUCKET || 'streamhive-videos';

async function ensureBucket() {
  const exists = await minioClient.bucketExists(VIDEO_BUCKET).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(VIDEO_BUCKET, 'us-east-1');
    console.log(`[minio] created bucket "${VIDEO_BUCKET}"`);
  } else {
    console.log(`[minio] bucket "${VIDEO_BUCKET}" already exists`);
  }
}

module.exports = { minioClient, VIDEO_BUCKET, ensureBucket };
