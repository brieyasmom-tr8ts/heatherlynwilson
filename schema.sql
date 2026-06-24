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
  email TEXT DEFAULT '',
  comment TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_slug ON post_comments(slug);

CREATE TABLE IF NOT EXISTS truth_votes (
  choice INTEGER PRIMARY KEY,
  count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  unsubscribed_at TEXT DEFAULT NULL
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

CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  referrer TEXT DEFAULT '',
  visitor_id TEXT NOT NULL,
  country TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_views_created ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_views_path ON page_views(path);
CREATE INDEX IF NOT EXISTS idx_views_visitor ON page_views(visitor_id);
