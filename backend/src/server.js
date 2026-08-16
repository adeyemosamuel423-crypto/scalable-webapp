require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');

const pool = require('./config/db');
const { ensureStorage } = require('./config/storage');
const { connectRedis } = require('./config/redis');

const authRoutes = require('./routes/auth.routes');
const videoRoutes = require('./routes/video.routes');
const commentRoutes = require('./routes/comment.routes');

const fs = require('fs');
const path = require('path');

const app = express();

const PORT = parseInt(
  process.env.PORT || '4000',
  10
);

// Azure Container Apps exposes the container through
// the port configured above.
const HOST =
  process.env.HOST || '0.0.0.0';


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);

app.use(cors());

app.use(morgan('dev'));

app.use(
  express.json({
    limit: '2mb'
  })
);


// ============================================================
// HEALTH CHECK
// ============================================================
// Used by:
// - Azure Container Apps
// - Azure DevOps pipeline
// - Manual deployment testing
// ============================================================

app.get('/api/health', (req, res) => {

  res.status(200).json({
    status: 'ok',
    service: 'streamhive-backend'
  });

});


// ============================================================
// API ROUTES
// ============================================================

app.use(
  '/api/auth',
  authRoutes
);

app.use(
  '/api/videos',
  videoRoutes
);

app.use(
  '/api/videos/:id/comments',
  commentRoutes
);


// ============================================================
// 404 HANDLER
// ============================================================

app.use((req, res) => {

  res.status(404).json({
    error: 'Not found.'
  });

});


// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {

  console.error(
    '[unhandled]',
    err
  );

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: 'Internal server error.'
  });

});


// ============================================================
// DATABASE SCHEMA
// ============================================================

const SCHEMA =
  fs.readFileSync(
    path.join(
      __dirname,
      '../db/init.sql'
    ),
    'utf8'
  );


// ============================================================
// WAIT FOR POSTGRESQL
// ============================================================

async function waitForPostgres(
  retries = 30,
  delayMs = 2000
) {

  for (
    let i = 0;
    i < retries;
    i++
  ) {

    try {

      await pool.query(
        'SELECT 1'
      );

      console.log(
        '[startup] PostgreSQL connection successful'
      );

      return;

    } catch (err) {

      console.log(
        `[startup] waiting for PostgreSQL... ` +
        `(${i + 1}/${retries})`
      );

      if (i === retries - 1) {
        console.error(
          '[startup] PostgreSQL connection error:',
          err.message
        );
      }

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            delayMs
          )
      );
    }
  }

  throw new Error(
    'PostgreSQL did not become available in time.'
  );
}


// ============================================================
// SEED DEMO CREATOR
// ============================================================

async function seedCreator() {

  const email =
    process.env.SEED_CREATOR_EMAIL ||
    'creator@streamhive.local';

  const password =
    process.env.SEED_CREATOR_PASSWORD ||
    'CreatorPass123!';

  const existing =
    await pool.query(
      'SELECT id FROM users WHERE email=$1',
      [email]
    );

  // Creator already exists
  if (existing.rows.length) {
    console.log(
      `[seed] creator account already exists -> ${email}`
    );

    return;
  }

  const hash =
    await bcrypt.hash(
      password,
      10
    );

  await pool.query(
    `INSERT INTO users
      (
        email,
        password_hash,
        display_name,
        role
      )
     VALUES
      ($1,$2,$3,'creator')`,
    [
      email,
      hash,
      'Demo Creator'
    ]
  );

  // Do NOT print the password in Azure logs.
  console.log(
    `[seed] created demo creator account -> ${email}`
  );
}


// ============================================================
// APPLICATION STARTUP
// ============================================================

async function start() {

  try {

    // --------------------------------------------------------
    // 1. PostgreSQL
    // --------------------------------------------------------

    await waitForPostgres();


    // --------------------------------------------------------
    // 2. Database schema
    // --------------------------------------------------------

    await pool.query(
      SCHEMA
    );

    console.log(
      '[startup] database schema ensured'
    );


    // --------------------------------------------------------
    // 3. Object storage
    // --------------------------------------------------------
    //
    // Local:
    //     MinIO
    //
    // Azure:
    //     Azure Blob Storage
    //
    // Controlled by:
    //     STORAGE_PROVIDER
    // --------------------------------------------------------

    await ensureStorage();

    console.log(
      '[startup] object storage ready'
    );


    // --------------------------------------------------------
    // 4. Redis
    // --------------------------------------------------------

    await connectRedis();

    console.log(
      '[startup] Redis connection ready'
    );


    // --------------------------------------------------------
    // 5. Demo creator
    // --------------------------------------------------------

    await seedCreator();


    // --------------------------------------------------------
    // 6. Start Express
    // --------------------------------------------------------

    app.listen(
      PORT,
      HOST,
      () => {

        console.log(
          `[startup] StreamHive backend listening on ${HOST}:${PORT}`
        );

      }
    );

  } catch (err) {

    console.error(
      '[startup] fatal error:',
      err
    );

    process.exit(1);
  }
}


// ============================================================
// START APPLICATION
// ============================================================

start();