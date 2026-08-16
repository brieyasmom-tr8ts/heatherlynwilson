-- UTM Attribution Tracking — full bootstrap for NEW databases
--
-- Run this on a fresh database that has the base tables but no UTM columns.
-- For production (which already has some columns), use 001-utm-attribution.sql instead.

-- challenge_signups: last-touch
ALTER TABLE challenge_signups ADD COLUMN utm_source TEXT DEFAULT '';
ALTER TABLE challenge_signups ADD COLUMN utm_medium TEXT DEFAULT '';
ALTER TABLE challenge_signups ADD COLUMN utm_campaign TEXT DEFAULT '';
ALTER TABLE challenge_signups ADD COLUMN utm_content TEXT DEFAULT '';
ALTER TABLE challenge_signups ADD COLUMN utm_term TEXT DEFAULT '';
-- challenge_signups: first-touch
ALTER TABLE challenge_signups ADD COLUMN utm_first_source TEXT DEFAULT '';
ALTER TABLE challenge_signups ADD COLUMN utm_first_medium TEXT DEFAULT '';
ALTER TABLE challenge_signups ADD COLUMN utm_first_campaign TEXT DEFAULT '';
ALTER TABLE challenge_signups ADD COLUMN utm_first_content TEXT DEFAULT '';
ALTER TABLE challenge_signups ADD COLUMN utm_first_term TEXT DEFAULT '';
-- challenge_signups: landing/referrer/classification
ALTER TABLE challenge_signups ADD COLUMN utm_landing_page TEXT DEFAULT '';
ALTER TABLE challenge_signups ADD COLUMN utm_last_landing_page TEXT DEFAULT '';
ALTER TABLE challenge_signups ADD COLUMN utm_referrer TEXT DEFAULT '';
ALTER TABLE challenge_signups ADD COLUMN is_new_subscriber INTEGER;

-- subscribers: last-touch
ALTER TABLE subscribers ADD COLUMN utm_source TEXT DEFAULT '';
ALTER TABLE subscribers ADD COLUMN utm_medium TEXT DEFAULT '';
ALTER TABLE subscribers ADD COLUMN utm_campaign TEXT DEFAULT '';
ALTER TABLE subscribers ADD COLUMN utm_content TEXT DEFAULT '';
ALTER TABLE subscribers ADD COLUMN utm_term TEXT DEFAULT '';
-- subscribers: first-touch
ALTER TABLE subscribers ADD COLUMN utm_first_source TEXT DEFAULT '';
ALTER TABLE subscribers ADD COLUMN utm_first_medium TEXT DEFAULT '';
ALTER TABLE subscribers ADD COLUMN utm_first_campaign TEXT DEFAULT '';
ALTER TABLE subscribers ADD COLUMN utm_first_content TEXT DEFAULT '';
ALTER TABLE subscribers ADD COLUMN utm_first_term TEXT DEFAULT '';
-- subscribers: landing/referrer
ALTER TABLE subscribers ADD COLUMN utm_landing_page TEXT DEFAULT '';
ALTER TABLE subscribers ADD COLUMN utm_last_landing_page TEXT DEFAULT '';
ALTER TABLE subscribers ADD COLUMN utm_referrer TEXT DEFAULT '';

-- page_views: UTM fields
ALTER TABLE page_views ADD COLUMN utm_source TEXT DEFAULT '';
ALTER TABLE page_views ADD COLUMN utm_medium TEXT DEFAULT '';
ALTER TABLE page_views ADD COLUMN utm_campaign TEXT DEFAULT '';
ALTER TABLE page_views ADD COLUMN utm_content TEXT DEFAULT '';
ALTER TABLE page_views ADD COLUMN utm_term TEXT DEFAULT '';
