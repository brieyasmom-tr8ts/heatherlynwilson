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
  view_id TEXT DEFAULT '',
  dwell_seconds INTEGER DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_views_created ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_views_path ON page_views(path);
CREATE INDEX IF NOT EXISTS idx_views_visitor ON page_views(visitor_id);
CREATE INDEX IF NOT EXISTS idx_views_view_id ON page_views(view_id);

-- If you already created page_views before this migration, run these too:
--   ALTER TABLE page_views ADD COLUMN view_id TEXT DEFAULT '';
--   ALTER TABLE page_views ADD COLUMN dwell_seconds INTEGER DEFAULT NULL;
--   CREATE INDEX IF NOT EXISTS idx_views_view_id ON page_views(view_id);

-- ─── Bible Challenge community: feed, reflections, prayer wall ──────────────

-- Daily reflection comments. One row per posted reflection per day per user.
CREATE TABLE IF NOT EXISTS challenge_reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge TEXT NOT NULL DEFAULT 'july-2026',
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  day INTEGER NOT NULL,
  content TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reflections_day ON challenge_reflections(challenge, day, created_at);
CREATE INDEX IF NOT EXISTS idx_reflections_email ON challenge_reflections(email);

-- Anonymous prayer wall. content stays anonymous; pray_count tracks how many
-- have tapped "praying for this".
CREATE TABLE IF NOT EXISTS challenge_prayers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge TEXT NOT NULL DEFAULT 'july-2026',
  email TEXT NOT NULL,
  content TEXT NOT NULL,
  pray_count INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prayers_created ON challenge_prayers(challenge, created_at);

-- Per-book sub-checkmarks within a reading day. item_index is 0-based.
-- A day is "fully complete" once a user has rows for every item in that
-- day's reading. The existing challenge_checkins row is still what powers
-- streaks and the live feed; we mirror to it when all sub-items are done.
CREATE TABLE IF NOT EXISTS challenge_subcheckins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge TEXT NOT NULL DEFAULT 'july-2026',
  email TEXT NOT NULL,
  day INTEGER NOT NULL,
  item_index INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(challenge, email, day, item_index)
);
CREATE INDEX IF NOT EXISTS idx_subcheck_user_day ON challenge_subcheckins(challenge, email, day);

-- ─── Lectio Divina journal entries (One Book Deep challenge + beyond) ────────

-- Each day a user can record: what stood out, what God is saying, their prayer,
-- and a reflection on yesterday's prayer focus.
CREATE TABLE IF NOT EXISTS challenge_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge TEXT NOT NULL DEFAULT 'august-james-2026',
  email TEXT NOT NULL,
  day INTEGER NOT NULL,
  stood_out TEXT DEFAULT '',
  god_speaking TEXT DEFAULT '',
  prayer TEXT DEFAULT '',
  yesterday_reflection TEXT DEFAULT '',
  read_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(challenge, email, day)
);
CREATE INDEX IF NOT EXISTS idx_journal_user ON challenge_journal(challenge, email);
CREATE INDEX IF NOT EXISTS idx_journal_day ON challenge_journal(challenge, day);

-- Migration: evergreen challenge + multi-challenge support (run once in D1 console)
-- Step 1: ALTER TABLE challenge_signups ADD COLUMN personal_start_date TEXT DEFAULT NULL;
-- Step 2: recreate table with UNIQUE(email, challenge) instead of UNIQUE(email):
--   CREATE TABLE challenge_signups_v2 (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, track TEXT NOT NULL DEFAULT 'full-bible', prayer INTEGER NOT NULL DEFAULT 0, challenge TEXT NOT NULL DEFAULT 'july-2026', bookmark TEXT DEFAULT '', personal_start_date TEXT DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(email, challenge));
--   INSERT INTO challenge_signups_v2 SELECT * FROM challenge_signups;
--   DROP TABLE challenge_signups;
--   ALTER TABLE challenge_signups_v2 RENAME TO challenge_signups;
