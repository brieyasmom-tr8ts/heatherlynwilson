-- Run this in Cloudflare Dashboard > D1 > your database > Console
-- Or via: wrangler d1 execute blog-engagement --file=schema.sql

CREATE TABLE IF NOT EXISTS post_likes (
  slug TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_slug ON post_comments(slug);

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  reason TEXT,
  organization TEXT,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
