-- UTM Attribution Tracking — incremental migration (August 15, 2026)
--
-- Production already has: utm_source, utm_medium, utm_campaign, utm_content,
-- utm_first_source, utm_first_medium, utm_first_campaign, utm_first_content,
-- utm_landing_page, utm_referrer on both challenge_signups and subscribers.
--
-- This migration adds ONLY the columns not yet in production.
-- SQLite ALTER TABLE ADD COLUMN fails if the column already exists,
-- so this file must contain only new columns.

-- New columns added in this deployment:
ALTER TABLE challenge_signups ADD COLUMN utm_term TEXT DEFAULT '';
ALTER TABLE challenge_signups ADD COLUMN utm_first_term TEXT DEFAULT '';
ALTER TABLE challenge_signups ADD COLUMN is_new_subscriber INTEGER;

ALTER TABLE subscribers ADD COLUMN utm_term TEXT DEFAULT '';
ALTER TABLE subscribers ADD COLUMN utm_first_term TEXT DEFAULT '';

-- page_views UTM columns (all new):
ALTER TABLE page_views ADD COLUMN utm_source TEXT DEFAULT '';
ALTER TABLE page_views ADD COLUMN utm_medium TEXT DEFAULT '';
ALTER TABLE page_views ADD COLUMN utm_campaign TEXT DEFAULT '';
ALTER TABLE page_views ADD COLUMN utm_content TEXT DEFAULT '';
ALTER TABLE page_views ADD COLUMN utm_term TEXT DEFAULT '';

ALTER TABLE challenge_signups ADD COLUMN utm_last_landing_page TEXT DEFAULT '';
ALTER TABLE subscribers ADD COLUMN utm_last_landing_page TEXT DEFAULT '';

-- Set historical is_new_subscriber to NULL (unknown) for pre-tracking records:
UPDATE challenge_signups SET is_new_subscriber = NULL WHERE utm_source = '' AND utm_first_source = '';
