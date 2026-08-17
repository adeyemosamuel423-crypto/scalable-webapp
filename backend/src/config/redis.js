const { createClient } = require('redis');

// ============================================================
// REDIS CONFIGURATION
// ============================================================
//
// Local Docker:
//     REDIS_ENABLED=true
//     REDIS_HOST=redis
//     REDIS_PORT=6379
//
// Azure Container Apps - minimum-change deployment:
//     REDIS_ENABLED=false
//
// Redis is optional for the application.
// If disabled, cache operations simply do nothing and the
// application continues without Redis.
//
// ============================================================

const REDIS_ENABLED =
  process.env.REDIS_ENABLED !== 'false';

const REDIS_HOST =
  process.env.REDIS_HOST || 'redis';

const REDIS_PORT =
  parseInt(
    process.env.REDIS_PORT || '6379',
    10
  );

const REDIS_PASSWORD =
  process.env.REDIS_PASSWORD || null;


// ============================================================
// REDIS CLIENT
// ============================================================

let redisClient = null;

if (REDIS_ENABLED) {

  // ----------------------------------------------------------
  // REDIS CONNECTION URL
  // ----------------------------------------------------------

  let redisUrl;

  if (REDIS_PASSWORD) {

    redisUrl =
      `redis://:${encodeURIComponent(REDIS_PASSWORD)}` +
      `@${REDIS_HOST}:${REDIS_PORT}`;

  } else {

    redisUrl =
      `redis://${REDIS_HOST}:${REDIS_PORT}`;
  }


  // ----------------------------------------------------------
  // CREATE REDIS CLIENT
  // ----------------------------------------------------------

  redisClient = createClient({

    url: redisUrl,

    socket: {

      reconnectStrategy: (retries) => {

        const delay =
          Math.min(
            retries * 500,
            3000
          );

        console.log(
          `[redis] reconnecting in ${delay}ms...`
        );

        return delay;
      }
    }
  });


  // ----------------------------------------------------------
  // REDIS ERROR HANDLER
  // ----------------------------------------------------------

  redisClient.on(
    'error',
    (err) => {

      console.error(
        '[redis] client error:',
        err.message
      );

    }
  );

} else {

  console.log(
    '[redis] Redis disabled - continuing without Redis'
  );
}


// ============================================================
// REDIS CONNECT
// ============================================================

async function connectRedis() {

  // Redis disabled
  if (!REDIS_ENABLED) {

    console.log(
      '[redis] connection skipped because Redis is disabled'
    );

    return;
  }


  if (!redisClient) {
    return;
  }


  if (redisClient.isOpen) {
    return;
  }


  try {

    await redisClient.connect();

    console.log(
      `[redis] connected to ${REDIS_HOST}:${REDIS_PORT}`
    );

  } catch (err) {

    console.error(
      '[redis] connection failed:',
      err.message
    );

    throw err;
  }
}


// ============================================================
// MAKE SURE REDIS IS CONNECTED
// ============================================================

async function ensureRedis() {

  if (!REDIS_ENABLED) {
    return false;
  }

  if (!redisClient) {
    return false;
  }

  if (!redisClient.isOpen) {
    await connectRedis();
  }

  return redisClient.isOpen;
}


// ============================================================
// DEFAULT CACHE TTL
// ============================================================

const DEFAULT_TTL_SECONDS =
  parseInt(
    process.env.REDIS_DEFAULT_TTL || '30',
    10
  );


// ============================================================
// CACHE GET
// ============================================================

async function cacheGet(key) {

  // Redis disabled
  if (!REDIS_ENABLED) {
    return null;
  }

  try {

    const connected =
      await ensureRedis();

    if (!connected) {
      return null;
    }

    const raw =
      await redisClient.get(key);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw);

  } catch (err) {

    console.error(
      '[redis] cacheGet failed:',
      err.message
    );

    return null;
  }
}


// ============================================================
// CACHE SET
// ============================================================

async function cacheSet(
  key,
  value,
  ttl = DEFAULT_TTL_SECONDS
) {

  // Redis disabled
  if (!REDIS_ENABLED) {
    return;
  }

  try {

    const connected =
      await ensureRedis();

    if (!connected) {
      return;
    }

    await redisClient.set(
      key,
      JSON.stringify(value),
      {
        EX: ttl
      }
    );

  } catch (err) {

    console.error(
      '[redis] cacheSet failed:',
      err.message
    );
  }
}


// ============================================================
// CACHE INVALIDATION
// ============================================================

async function cacheInvalidate(pattern) {

  // Redis disabled
  if (!REDIS_ENABLED) {
    return;
  }

  try {

    const connected =
      await ensureRedis();

    if (!connected) {
      return;
    }

    const keys = [];

    for await (
      const key of redisClient.scanIterator({
        MATCH: pattern,
        COUNT: 100
      })
    ) {

      keys.push(key);
    }

    if (keys.length) {

      await redisClient.del(keys);

    }

  } catch (err) {

    console.error(
      '[redis] cacheInvalidate failed:',
      err.message
    );
  }
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {

  redisClient,

  connectRedis,

  ensureRedis,

  cacheGet,

  cacheSet,

  cacheInvalidate
};