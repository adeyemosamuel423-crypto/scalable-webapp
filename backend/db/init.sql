-- ==========================================================
-- StreamHive database schema
-- Scalable Advanced Software Solutions (COM769) - Coursework 2
-- ==========================================================

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(120) NOT NULL,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('creator', 'consumer')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS videos (
    id              SERIAL PRIMARY KEY,
    creator_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    publisher       VARCHAR(150),
    producer        VARCHAR(150),
    genre           VARCHAR(80),
    age_rating      VARCHAR(10) NOT NULL DEFAULT 'PG',
    description     TEXT,
    object_key      VARCHAR(400) NOT NULL,      -- key of file in object storage (MinIO/S3)
    thumbnail_key   VARCHAR(400),                -- key of generated thumbnail
    duration_secs   INTEGER,
    view_count      INTEGER NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'processing', -- processing | ready | failed
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
    id              SERIAL PRIMARY KEY,
    video_id        INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            TEXT NOT NULL,
    sentiment_score NUMERIC(5,2),               -- advanced feature: sentiment analysis
    sentiment_label VARCHAR(20),                 -- positive | neutral | negative
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ratings (
    id              SERIAL PRIMARY KEY,
    video_id        INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stars           SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(video_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_creator ON videos(creator_id);
CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id);
CREATE INDEX IF NOT EXISTS idx_ratings_video ON ratings(video_id);
