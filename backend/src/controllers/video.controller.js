const { v4: uuidv4 } = require('uuid');
const path = require('path');

const pool = require('../config/db');

const {
  putFile,
  statFile,
  getFile,
  getPartialFile
} = require('../config/storage');

const {
  cacheGet,
  cacheSet,
  cacheInvalidate
} = require('../config/redis');

const {
  probeDuration,
  extractThumbnail,
  safeUnlink
} = require('../utils/media');

const VALID_AGE_RATINGS = ['U', 'PG', '12', '12A', '15', '18'];

// ============================================================
// CREATOR: UPLOAD VIDEO
// ============================================================
// Creator uploads a video with metadata:
// - Title
// - Publisher
// - Producer
// - Genre
// - Age rating
//
// The original video and generated thumbnail are stored in
// object storage through storage.js.
//
// Local development:
//     STORAGE_PROVIDER=minio
//
// Azure deployment:
//     STORAGE_PROVIDER=azure
//
// Metadata is stored in PostgreSQL.
// FFmpeg is used to determine duration and generate thumbnail.
// ============================================================

async function uploadVideo(req, res) {
  if (!req.file) {
    return res.status(400).json({
      error: 'A video file is required (field name: video).'
    });
  }

  const {
    title,
    publisher,
    producer,
    genre,
    description
  } = req.body;

  let { age_rating } = req.body;

  age_rating = (age_rating || 'PG').toUpperCase();

  if (!title) {
    safeUnlink(req.file.path);

    return res.status(400).json({
      error: 'title is required.'
    });
  }

  if (!VALID_AGE_RATINGS.includes(age_rating)) {
    safeUnlink(req.file.path);

    return res.status(400).json({
      error: `age_rating must be one of ${VALID_AGE_RATINGS.join(', ')}`
    });
  }

  const localPath = req.file.path;

  const objectKey =
    `videos/${uuidv4()}${path.extname(req.file.originalname)}`;

  try {

    // --------------------------------------------------------
    // 1. Upload original video to object storage
    // --------------------------------------------------------

    await putFile(
      objectKey,
      localPath,
      req.file.mimetype
    );

    // --------------------------------------------------------
    // 2. Media processing using FFmpeg
    // --------------------------------------------------------

    const duration = await probeDuration(localPath);

    let thumbnailKey = null;

    try {

      const thumbLocalPath =
        await extractThumbnail(
          localPath,
          Math.min(1, duration || 1)
        );

      thumbnailKey =
        `thumbnails/${uuidv4()}.jpg`;

      // Upload generated thumbnail
      await putFile(
        thumbnailKey,
        thumbLocalPath,
        'image/jpeg'
      );

      safeUnlink(thumbLocalPath);

    } catch (thumbErr) {

      console.warn(
        '[uploadVideo] thumbnail generation skipped:',
        thumbErr.message
      );
    }

    // --------------------------------------------------------
    // 3. Save video metadata in PostgreSQL
    // --------------------------------------------------------

    const result = await pool.query(
      `INSERT INTO videos
        (
          creator_id,
          title,
          publisher,
          producer,
          genre,
          age_rating,
          description,
          object_key,
          thumbnail_key,
          duration_secs,
          status
        )
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ready')
       RETURNING *`,
      [
        req.user.id,
        title,
        publisher || null,
        producer || null,
        genre || null,
        age_rating,
        description || null,
        objectKey,
        thumbnailKey,
        duration
      ]
    );

    // --------------------------------------------------------
    // 4. Invalidate relevant Redis caches
    // --------------------------------------------------------

    await cacheInvalidate('dashboard:*');
    await cacheInvalidate('videos:*');

    return res.status(201).json({
      video: result.rows[0]
    });

  } catch (err) {

    console.error('[uploadVideo]', err);

    return res.status(500).json({
      error: 'Video upload failed.'
    });

  } finally {

    // Delete temporary uploaded file from container
    safeUnlink(localPath);
  }
}


// ============================================================
// CONSUMER: LIST / SEARCH VIDEOS
// ============================================================

async function listVideos(req, res) {

  const {
    q = '',
    genre = '',
    page = '1',
    limit = '12'
  } = req.query;

  const pageNum =
    Math.max(parseInt(page, 10) || 1, 1);

  const limitNum =
    Math.min(
      Math.max(parseInt(limit, 10) || 12, 1),
      50
    );

  const offset =
    (pageNum - 1) * limitNum;

  const cacheKey =
    `videos:list:${q}:${genre}:${pageNum}:${limitNum}`;

  const cached =
    await cacheGet(cacheKey);

  if (cached) {
    return res.json({
      ...cached,
      cached: true
    });
  }

  try {

    const params = [];

    let where =
      "WHERE status = 'ready'";

    // Search by title or description
    if (q) {

      params.push(`%${q}%`);

      where +=
        ` AND (
          title ILIKE $${params.length}
          OR description ILIKE $${params.length}
        )`;
    }

    // Filter by genre
    if (genre) {

      params.push(genre);

      where +=
        ` AND genre = $${params.length}`;
    }

    params.push(limitNum);
    params.push(offset);

    const result =
      await pool.query(
        `SELECT
            v.*,
            u.display_name AS creator_name,
            COALESCE(
              AVG(r.stars),
              0
            )::numeric(3,2) AS avg_rating,
            COUNT(DISTINCT r.id) AS rating_count

         FROM videos v

         JOIN users u
           ON u.id = v.creator_id

         LEFT JOIN ratings r
           ON r.video_id = v.id

         ${where}

         GROUP BY
            v.id,
            u.display_name

         ORDER BY
            v.created_at DESC

         LIMIT $${params.length - 1}
         OFFSET $${params.length}`,
        params
      );

    const payload = {
      videos: result.rows,
      page: pageNum,
      limit: limitNum
    };

    await cacheSet(
      cacheKey,
      payload,
      20
    );

    return res.json(payload);

  } catch (err) {

    console.error('[listVideos]', err);

    return res.status(500).json({
      error: 'Could not fetch videos.'
    });
  }
}


// ============================================================
// CONSUMER: DASHBOARD
// ============================================================
// Latest videos are cached in Redis because this is a
// frequently accessed endpoint.
// ============================================================

async function dashboard(req, res) {

  const cacheKey =
    'dashboard:latest';

  const cached =
    await cacheGet(cacheKey);

  if (cached) {

    return res.json({
      ...cached,
      cached: true
    });
  }

  try {

    const result =
      await pool.query(
        `SELECT
            v.*,
            u.display_name AS creator_name,
            COALESCE(
              AVG(r.stars),
              0
            )::numeric(3,2) AS avg_rating

         FROM videos v

         JOIN users u
           ON u.id = v.creator_id

         LEFT JOIN ratings r
           ON r.video_id = v.id

         WHERE v.status = 'ready'

         GROUP BY
            v.id,
            u.display_name

         ORDER BY
            v.created_at DESC

         LIMIT 10`
      );

    const payload = {
      videos: result.rows
    };

    await cacheSet(
      cacheKey,
      payload,
      15
    );

    return res.json(payload);

  } catch (err) {

    console.error('[dashboard]', err);

    return res.status(500).json({
      error: 'Could not load dashboard.'
    });
  }
}


// ============================================================
// CONSUMER: GET VIDEO DETAILS
// ============================================================

async function getVideo(req, res) {

  const { id } = req.params;

  try {

    const result =
      await pool.query(
        `SELECT
            v.*,
            u.display_name AS creator_name,

            COALESCE(
              AVG(r.stars),
              0
            )::numeric(3,2) AS avg_rating,

            COUNT(DISTINCT r.id) AS rating_count

         FROM videos v

         JOIN users u
           ON u.id = v.creator_id

         LEFT JOIN ratings r
           ON r.video_id = v.id

         WHERE v.id = $1

         GROUP BY
            v.id,
            u.display_name`,
        [id]
      );

    if (!result.rows.length) {

      return res.status(404).json({
        error: 'Video not found.'
      });
    }

    // Increment view count asynchronously
    pool
      .query(
        `UPDATE videos
         SET view_count = view_count + 1
         WHERE id = $1`,
        [id]
      )
      .catch(() => {});

    // Determine current user's rating
    let myRating = null;

    if (req.user) {

      const rating =
        await pool.query(
          `SELECT stars
           FROM ratings
           WHERE video_id = $1
           AND user_id = $2`,
          [
            id,
            req.user.id
          ]
        );

      myRating =
        rating.rows[0]?.stars ?? null;
    }

    return res.json({
      video: result.rows[0],
      my_rating: myRating
    });

  } catch (err) {

    console.error('[getVideo]', err);

    return res.status(500).json({
      error: 'Could not fetch video.'
    });
  }
}


// ============================================================
// CONSUMER: STREAM VIDEO
// ============================================================
// IMPORTANT:
// This function now works with BOTH:
//
// Local:
//     MinIO
//
// Azure:
//     Azure Blob Storage
//
// The storage implementation is handled by storage.js.
//
// HTTP Range requests are supported so that users can:
// - play videos
// - seek
// - scrub
// - resume playback
// ============================================================

async function streamVideo(req, res) {

  const { id } = req.params;

  try {

    // --------------------------------------------------------
    // 1. Get object key from PostgreSQL
    // --------------------------------------------------------

    const result =
      await pool.query(
        `SELECT object_key
         FROM videos
         WHERE id = $1`,
        [id]
      );

    if (!result.rows.length) {

      return res.status(404).json({
        error: 'Video not found.'
      });
    }

    const { object_key } =
      result.rows[0];

    // --------------------------------------------------------
    // 2. Get file information from storage
    // --------------------------------------------------------
    // OLD:
    // minioClient.statObject(...)
    //
    // NEW:
    // statFile(...)
    // --------------------------------------------------------

    const stat =
      await statFile(object_key);

    const fileSize =
      Number(stat.size);

    const contentType =
      stat.contentType || 'video/mp4';

    const range =
      req.headers.range;

    // --------------------------------------------------------
    // 3. Handle HTTP Range request
    // --------------------------------------------------------

    if (range) {

      const rangeValue =
        range.replace(/bytes=/, '');

      const [
        startStr,
        endStr
      ] = rangeValue.split('-');

      let start =
        parseInt(startStr, 10);

      let end =
        endStr
          ? parseInt(endStr, 10)
          : fileSize - 1;

      // Validate range
      if (
        Number.isNaN(start) ||
        start < 0 ||
        start >= fileSize
      ) {

        res.status(416);

        res.setHeader(
          'Content-Range',
          `bytes */${fileSize}`
        );

        return res.end();
      }

      if (
        Number.isNaN(end) ||
        end >= fileSize
      ) {

        end =
          fileSize - 1;
      }

      if (start > end) {

        res.status(416);

        res.setHeader(
          'Content-Range',
          `bytes */${fileSize}`
        );

        return res.end();
      }

      const chunkSize =
        end - start + 1;

      // ------------------------------------------------------
      // Send partial content response
      // ------------------------------------------------------

      res.writeHead(206, {

        'Content-Range':
          `bytes ${start}-${end}/${fileSize}`,

        'Accept-Ranges':
          'bytes',

        'Content-Length':
          chunkSize,

        'Content-Type':
          contentType
      });

      // ------------------------------------------------------
      // Get partial object from storage
      // ------------------------------------------------------
      // OLD:
      // minioClient.getPartialObject(...)
      //
      // NEW:
      // getPartialFile(...)
      // ------------------------------------------------------

      const stream =
        await getPartialFile(
          object_key,
          start,
          chunkSize
        );

      stream.pipe(res);

      return;
    }

    // --------------------------------------------------------
    // 4. Full video request
    // --------------------------------------------------------

    res.writeHead(200, {

      'Content-Length':
        fileSize,

      'Content-Type':
        contentType,

      'Accept-Ranges':
        'bytes'
    });

    // --------------------------------------------------------
    // Get complete video from storage
    // --------------------------------------------------------
    // OLD:
    // minioClient.getObject(...)
    //
    // NEW:
    // getFile(...)
    // --------------------------------------------------------

    const stream =
      await getFile(object_key);

    stream.pipe(res);

  } catch (err) {

    console.error(
      '[streamVideo]',
      err
    );

    if (!res.headersSent) {

      return res.status(500).json({
        error: 'Could not stream video.'
      });
    }

    res.end();
  }
}


// ============================================================
// CONSUMER: STREAM VIDEO THUMBNAIL
// ============================================================
// Works with MinIO locally and Azure Blob Storage in Azure.
// ============================================================

async function streamThumbnail(req, res) {

  const { id } = req.params;

  try {

    const result =
      await pool.query(
        `SELECT thumbnail_key
         FROM videos
         WHERE id = $1`,
        [id]
      );

    const key =
      result.rows[0]?.thumbnail_key;

    if (!key) {
      return res.status(404).end();
    }

    // OLD:
    // minioClient.getObject(...)
    //
    // NEW:
    // getFile(...)
    const stream =
      await getFile(key);

    res.setHeader(
      'Content-Type',
      'image/jpeg'
    );

    stream.pipe(res);

  } catch (err) {

    console.error(
      '[streamThumbnail]',
      err
    );

    return res.status(404).end();
  }
}


// ============================================================
// CONSUMER: RATE VIDEO
// ============================================================

async function rateVideo(req, res) {

  const { id } = req.params;
  const { stars } = req.body;

  if (
    !Number.isInteger(stars) ||
    stars < 1 ||
    stars > 5
  ) {

    return res.status(400).json({
      error:
        'stars must be an integer from 1 to 5.'
    });
  }

  try {

    await pool.query(
      `INSERT INTO ratings
        (video_id, user_id, stars)

       VALUES
        ($1,$2,$3)

       ON CONFLICT
        (video_id, user_id)

       DO UPDATE SET
        stars = EXCLUDED.stars`,
      [
        id,
        req.user.id,
        stars
      ]
    );

    // Invalidate cached ratings
    await cacheInvalidate(
      'dashboard:*'
    );

    await cacheInvalidate(
      'videos:*'
    );

    return res.json({
      ok: true
    });

  } catch (err) {

    console.error(
      '[rateVideo]',
      err
    );

    return res.status(500).json({
      error:
        'Could not save rating.'
    });
  }
}


// ============================================================
// CREATOR: MY UPLOADS
// ============================================================

async function myUploads(req, res) {

  try {

    const result =
      await pool.query(
        `SELECT *
         FROM videos
         WHERE creator_id = $1
         ORDER BY created_at DESC`,
        [req.user.id]
      );

    return res.json({
      videos: result.rows
    });

  } catch (err) {

    console.error(
      '[myUploads]',
      err
    );

    return res.status(500).json({
      error:
        'Could not fetch your uploads.'
    });
  }
}


// ============================================================
// EXPORT CONTROLLERS
// ============================================================

module.exports = {

  uploadVideo,

  listVideos,

  dashboard,

  getVideo,

  streamVideo,

  streamThumbnail,

  rateVideo,

  myUploads

};