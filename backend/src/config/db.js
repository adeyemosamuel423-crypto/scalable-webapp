const { Pool } = require('pg');

// ============================================================
// PostgreSQL CONNECTION POOL
// ============================================================
//
// Local Docker:
//     PGHOST=postgres
//     PGSSL=false
//
// Azure PostgreSQL:
//     PGHOST=<azure-postgres-host>
//     PGSSL=true
//
// The same application code therefore works in both
// environments.
//
// ============================================================

const pool = new Pool({

  // ----------------------------------------------------------
  // Database host
  // ----------------------------------------------------------

  // host:
  //   process.env.PGHOST ||
  //   'postgres',
  host:
  process.env.PGHOST ||
  'streamhive-postgres-2026.postgres.database.azure.com',
  

  // ----------------------------------------------------------
  // PostgreSQL port
  // ----------------------------------------------------------

  port:
    parseInt(
      process.env.PGPORT || '5432',
      10
    ),

  // ----------------------------------------------------------
  // Database username
  // ----------------------------------------------------------

  user:
    process.env.PGUSER ||
    'streamhive',

  // ----------------------------------------------------------
  // Database password
  // ----------------------------------------------------------

  password:
    process.env.PGPASSWORD ||
    'streamhive_pw',

  // ----------------------------------------------------------
  // Database name
  // ----------------------------------------------------------

  database:
    process.env.PGDATABASE ||
    'streamhive',

  // ----------------------------------------------------------
  // SSL
  // ----------------------------------------------------------
  //
  // Local Docker:
  //     PGSSL=false
  //
  // Azure:
  //     PGSSL=true
  //
  // Azure PostgreSQL requires encrypted connections.
  //
  // ----------------------------------------------------------

  ssl:
    process.env.PGSSL === 'true'
      ? {
          rejectUnauthorized: false
        }
      : undefined,

  // ----------------------------------------------------------
  // Connection pool
  // ----------------------------------------------------------
  //
  // Reuses database connections rather than creating a new
  // connection for every HTTP request.
  //
  // This is important when the backend is horizontally scaled.
  //
  // ----------------------------------------------------------

  max:
    parseInt(
      process.env.PG_POOL_MAX || '20',
      10
    ),

  idleTimeoutMillis:
    parseInt(
      process.env.PG_IDLE_TIMEOUT || '30000',
      10
    ),

  connectionTimeoutMillis:
    parseInt(
      process.env.PG_CONNECTION_TIMEOUT || '10000',
      10
    )
});


// ============================================================
// POOL ERROR HANDLER
// ============================================================

pool.on('error', (err) => {

  console.error(
    '[postgres] unexpected error on idle client:',
    err.message
  );

});


// ============================================================
// OPTIONAL CONNECTION TEST
// ============================================================
//
// Used by server.js through waitForPostgres().
// No connection is opened here unnecessarily.
// ============================================================


module.exports = pool;