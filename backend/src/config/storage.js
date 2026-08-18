const Minio = require('minio');
const {
  BlobServiceClient
} = require('@azure/storage-blob');

// ============================================================
// STORAGE PROVIDER
// ============================================================
//
// Azure deployment:
//     STORAGE_PROVIDER=azure
//
// Local development with MinIO:
//     STORAGE_PROVIDER=minio
//
// IMPORTANT:
// Azure is the default provider because this application is
// deployed on Azure Container Apps.
//
// ============================================================

const provider =
  (process.env.STORAGE_PROVIDER || 'azure').toLowerCase();

console.log(
  `[storage] STORAGE_PROVIDER=${provider}`
);


// ============================================================
// MINIO CONFIGURATION
// ============================================================

let minioClient = null;

const VIDEO_BUCKET =
  process.env.MINIO_BUCKET ||
  'streamhive-videos';

if (provider === 'minio') {

  console.log('[storage] Initializing MinIO storage...');

  minioClient = new Minio.Client({

    endPoint:
      process.env.MINIO_ENDPOINT ||
      'minio',

    port:
      parseInt(
        process.env.MINIO_PORT || '9000',
        10
      ),

    useSSL:
      process.env.MINIO_USE_SSL === 'true',

    accessKey:
      process.env.MINIO_ACCESS_KEY ||
      'streamhive',

    secretKey:
      process.env.MINIO_SECRET_KEY ||
      'streamhive_secret'
  });

  console.log(
    `[storage] MinIO endpoint=${process.env.MINIO_ENDPOINT || 'minio'}`
  );
}


// ============================================================
// AZURE BLOB STORAGE CONFIGURATION
// ============================================================

let blobServiceClient = null;
let containerClient = null;

const AZURE_STORAGE_CONTAINER =
  process.env.AZURE_STORAGE_CONTAINER ||
  'streamhive-videos';

if (provider === 'azure') {

  console.log('[storage] Initializing Azure Blob Storage...');

  const connectionString =
    process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (!connectionString) {

    throw new Error(
      '[storage] AZURE_STORAGE_CONNECTION_STRING is required when STORAGE_PROVIDER=azure'
    );
  }

  blobServiceClient =
    BlobServiceClient.fromConnectionString(
      connectionString
    );

  containerClient =
    blobServiceClient.getContainerClient(
      AZURE_STORAGE_CONTAINER
    );

  console.log(
    `[storage] Azure Blob container=${AZURE_STORAGE_CONTAINER}`
  );
}


// ============================================================
// VALIDATE STORAGE PROVIDER
// ============================================================

if (
  provider !== 'minio' &&
  provider !== 'azure'
) {

  throw new Error(
    `[storage] Unsupported STORAGE_PROVIDER "${provider}". ` +
    `Use "minio" or "azure".`
  );
}


// ============================================================
// ENSURE STORAGE IS READY
// ============================================================

async function ensureStorage() {

  // ==========================================================
  // MINIO
  // ==========================================================

  if (provider === 'minio') {

    try {

      console.log(
        `[minio] Checking bucket "${VIDEO_BUCKET}"...`
      );

      const exists =
        await minioClient.bucketExists(
          VIDEO_BUCKET
        );

      if (!exists) {

        await minioClient.makeBucket(
          VIDEO_BUCKET,
          'us-east-1'
        );

        console.log(
          `[minio] bucket "${VIDEO_BUCKET}" created`
        );

      } else {

        console.log(
          `[minio] bucket "${VIDEO_BUCKET}" ready`
        );
      }

    } catch (err) {

      console.error(
        '[minio] storage initialization failed:',
        err
      );

      throw err;
    }

    return;
  }


  // ==========================================================
  // AZURE BLOB STORAGE
  // ==========================================================

  if (provider === 'azure') {

    try {

      console.log(
        `[azure] Checking blob container "${AZURE_STORAGE_CONTAINER}"...`
      );

      await containerClient.createIfNotExists();

      console.log(
        `[azure] blob container "${AZURE_STORAGE_CONTAINER}" ready`
      );

    } catch (err) {

      console.error(
        '[azure] storage initialization failed:',
        err
      );

      throw err;
    }

    return;
  }
}


// ============================================================
// UPLOAD FILE
// ============================================================
//
// objectKey:
//     videos/abc.mp4
//
// localPath:
//     temporary local file path
//
// contentType:
//     video/mp4
//
// ============================================================

async function putFile(
  objectKey,
  localPath,
  contentType
) {

  // ==========================================================
  // MINIO
  // ==========================================================

  if (provider === 'minio') {

    console.log(
      `[minio] Uploading "${objectKey}"...`
    );

    return minioClient.fPutObject(
      VIDEO_BUCKET,
      objectKey,
      localPath,
      {
        'Content-Type':
          contentType ||
          'application/octet-stream'
      }
    );
  }


  // ==========================================================
  // AZURE BLOB STORAGE
  // ==========================================================

  if (provider === 'azure') {

    console.log(
      `[azure] Uploading "${objectKey}"...`
    );

    const blobClient =
      containerClient.getBlockBlobClient(
        objectKey
      );

    const result =
      await blobClient.uploadFile(
        localPath,
        {
          blobHTTPHeaders: {
            blobContentType:
              contentType ||
              'application/octet-stream'
          }
        }
      );

    console.log(
      `[azure] Upload completed: "${objectKey}"`
    );

    return result;
  }
}


// ============================================================
// GET FILE INFORMATION
// ============================================================
//
// Returns:
//
// {
//     size: 123456,
//     contentType: "video/mp4"
// }
//
// ============================================================

async function statFile(objectKey) {

  // ==========================================================
  // MINIO
  // ==========================================================

  if (provider === 'minio') {

    const stat =
      await minioClient.statObject(
        VIDEO_BUCKET,
        objectKey
      );

    const metadata =
      stat.metaData || {};

    return {

      size:
        Number(stat.size),

      contentType:
        metadata['content-type'] ||
        metadata['Content-Type'] ||
        'application/octet-stream'
    };
  }


  // ==========================================================
  // AZURE BLOB STORAGE
  // ==========================================================

  if (provider === 'azure') {

    const blobClient =
      containerClient.getBlockBlobClient(
        objectKey
      );

    const properties =
      await blobClient.getProperties();

    return {

      size:
        Number(properties.contentLength),

      contentType:
        properties.contentType ||
        'application/octet-stream'
    };
  }
}


// ============================================================
// GET COMPLETE FILE STREAM
// ============================================================
//
// Used when a client requests the complete video.
//
// ============================================================

async function getFile(objectKey) {

  // ==========================================================
  // MINIO
  // ==========================================================

  if (provider === 'minio') {

    return minioClient.getObject(
      VIDEO_BUCKET,
      objectKey
    );
  }


  // ==========================================================
  // AZURE BLOB STORAGE
  // ==========================================================

  if (provider === 'azure') {

    const blobClient =
      containerClient.getBlockBlobClient(
        objectKey
      );

    const response =
      await blobClient.download();

    if (!response.readableStreamBody) {

      throw new Error(
        `[azure] No readable stream returned for "${objectKey}".`
      );
    }

    return response.readableStreamBody;
  }
}


// ============================================================
// GET PARTIAL FILE STREAM
// ============================================================
//
// Used for HTTP Range requests.
//
// Example:
//
//     bytes=0-999999
//
// Required for:
// - video playback
// - seeking
// - scrubbing
// - resume playback
//
// ============================================================

async function getPartialFile(
  objectKey,
  start,
  length
) {

  // ==========================================================
  // MINIO
  // ==========================================================

  if (provider === 'minio') {

    return minioClient.getPartialObject(
      VIDEO_BUCKET,
      objectKey,
      start,
      length
    );
  }


  // ==========================================================
  // AZURE BLOB STORAGE
  // ==========================================================

  if (provider === 'azure') {

    const blobClient =
      containerClient.getBlockBlobClient(
        objectKey
      );

    const response =
      await blobClient.download(
        start,
        length
      );

    if (!response.readableStreamBody) {

      throw new Error(
        `[azure] No readable range stream returned for "${objectKey}".`
      );
    }

    return response.readableStreamBody;
  }
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {

  provider,

  VIDEO_BUCKET,

  AZURE_STORAGE_CONTAINER,

  ensureStorage,

  putFile,

  statFile,

  getFile,

  getPartialFile

};