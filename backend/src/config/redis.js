const { createClient } = require('redis');

// ============================================================
// REDIS CONFIGURATION
// ============================================================
//
// Local Docker:
//     REDIS_HOST=redis
//     REDIS_PORT=6379
//
// Azure Container Apps:
//     REDIS_HOST=streamhive-redis
//     REDIS_PORT=6379
//
// The same application code works in both environments.
//
// ============================================================

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
// REDIS CONNECTION URL
// ============================================================

let redisUrl;

if (REDIS_PASSWORD) {

  redisUrl =
    `redis://:${encodeURIComponent(REDIS_PASSWORD)}` +
    `@${REDIS_HOST}:${REDIS_PORT}`;

} else {

  redisUrl =
    `redis://${REDIS_HOST}:${REDIS_PORT}`;
}


// ============================================================
// REDIS CLIENT
// ============================================================

const redisClient = createClient({
  url: redisUrl,

  socket: {
    reconnectStrategy: (retries) => {

      // Retry connection with increasing delay.
      // Maximum delay = 3 seconds.

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


// ============================================================
// REDIS ERROR HANDLER
// ============================================================

redisClient.on(
  'error',
  (err) => {

    console.error(
      '[redis] client error:',
      err.message
    );

  }
);


// ============================================================
// REDIS CONNECT
// ============================================================

async function connectRedis() {

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

  if (!redisClient.isOpen) {
    await connectRedis();
  }
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

  try {

    await ensureRedis();

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

  try {

    await ensureRedis();

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
//
// Example:
//     cacheInvalidate('videos:*')
//
// This removes matching cached entries.
//
// ============================================================

async function cacheInvalidate(pattern) {

  try {

    await ensureRedis();

    const keys = [];

    // scanIterator is preferable to KEYS for a
    // scalable application because KEYS can block
    // Redis when the keyspace becomes large.

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