const Minio = require('minio');
const {
  BlobServiceClient
} = require('@azure/storage-blob');

// ============================================================
// STORAGE PROVIDER
// ============================================================
//
// Local development:
//     STORAGE_PROVIDER=minio
//
// Azure deployment:
//     STORAGE_PROVIDER=azure
//
// ============================================================

const provider =
  (process.env.STORAGE_PROVIDER || 'minio').toLowerCase();


// ============================================================
// MINIO CONFIGURATION
// ============================================================

let minioClient = null;

const VIDEO_BUCKET =
  process.env.MINIO_BUCKET ||
  'streamhive-videos';

if (provider === 'minio') {

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

  // ----------------------------------------------------------
  // MINIO
  // ----------------------------------------------------------

  if (provider === 'minio') {

    try {

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


  // ----------------------------------------------------------
  // AZURE BLOB STORAGE
  // ----------------------------------------------------------

  try {

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

  // ----------------------------------------------------------
  // MINIO
  // ----------------------------------------------------------

  if (provider === 'minio') {

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


  // ----------------------------------------------------------
  // AZURE BLOB STORAGE
  // ----------------------------------------------------------

  const blobClient =
    containerClient.getBlockBlobClient(
      objectKey
    );

  return blobClient.uploadFile(
    localPath,
    {
      blobHTTPHeaders: {
        blobContentType:
          contentType ||
          'application/octet-stream'
      }
    }
  );
}


// ============================================================
// GET FILE INFORMATION
// ============================================================
//
// Returns a common structure:
//
// {
//     size: 123456,
//     contentType: "video/mp4"
// }
//
// This is used by video streaming.
// ============================================================

async function statFile(objectKey) {

  // ----------------------------------------------------------
  // MINIO
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // AZURE BLOB STORAGE
  // ----------------------------------------------------------

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


// ============================================================
// GET COMPLETE FILE STREAM
// ============================================================
//
// Used when a client requests the complete video/image.
// ============================================================

async function getFile(objectKey) {

  // ----------------------------------------------------------
  // MINIO
  // ----------------------------------------------------------

  if (provider === 'minio') {

    return minioClient.getObject(
      VIDEO_BUCKET,
      objectKey
    );
  }


  // ----------------------------------------------------------
  // AZURE BLOB STORAGE
  // ----------------------------------------------------------

  const blobClient =
    containerClient.getBlockBlobClient(
      objectKey
    );

  const response =
    await blobClient.download();

  if (!response.readableStreamBody) {

    throw new Error(
      `Azure Blob Storage returned no readable stream for "${objectKey}".`
    );
  }

  return response.readableStreamBody;
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
// This is essential for video:
// - seeking
// - scrubbing
// - partial playback
// ============================================================

async function getPartialFile(
  objectKey,
  start,
  length
) {

  // ----------------------------------------------------------
  // MINIO
  // ----------------------------------------------------------

  if (provider === 'minio') {

    return minioClient.getPartialObject(
      VIDEO_BUCKET,
      objectKey,
      start,
      length
    );
  }


  // ----------------------------------------------------------
  // AZURE BLOB STORAGE
  // ----------------------------------------------------------

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
      `Azure Blob Storage returned no readable range stream for "${objectKey}".`
    );
  }

  return response.readableStreamBody;
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