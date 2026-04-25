-- Phase 4/5/6 reserved schema patch.
-- This file only reserves database structure and indexes.
-- No business logic is implemented in this migration.

CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR PRIMARY KEY,
  phone         VARCHAR NOT NULL,
  username      VARCHAR NOT NULL,
  display_name  VARCHAR NOT NULL,
  avatar        VARCHAR NULL,
  bio           VARCHAR(80) NULL,
  is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS tracking_results (
  id                 VARCHAR PRIMARY KEY,
  lesson_id          VARCHAR NOT NULL,
  user_id            VARCHAR NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  score              INTEGER NOT NULL,
  segment_scores     TEXT NOT NULL,
  video_url          VARCHAR NOT NULL,
  is_public          BOOLEAN NOT NULL DEFAULT FALSE,
  published_at       TIMESTAMP NULL,
  like_count         INTEGER NOT NULL DEFAULT 0,
  comment_count      INTEGER NOT NULL DEFAULT 0,
  moderation_status  VARCHAR NOT NULL DEFAULT 'none',
  moderation_reason  TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracking_results_user_created
  ON tracking_results(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_results_lesson_public_published
  ON tracking_results(lesson_id, is_public, published_at DESC);

CREATE TABLE IF NOT EXISTS follows (
  follower_id VARCHAR NOT NULL,
  followee_id VARCHAR NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, followee_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);

CREATE TABLE IF NOT EXISTS likes (
  user_id            VARCHAR NOT NULL,
  tracking_result_id VARCHAR NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tracking_result_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_result ON likes(tracking_result_id);

CREATE TABLE IF NOT EXISTS comments (
  id                 VARCHAR PRIMARY KEY,
  tracking_result_id VARCHAR NOT NULL,
  user_id            VARCHAR NOT NULL,
  content            TEXT NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  moderation_status  VARCHAR NOT NULL DEFAULT 'none'
);

CREATE INDEX IF NOT EXISTS idx_comments_result
  ON comments(tracking_result_id, created_at DESC);
