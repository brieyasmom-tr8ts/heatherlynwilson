# Heather Lyn Wilson - Personal Site

This is the codebase for **heatherlynwilson.com** — Heather's personal author, speaker, and blog site.

## About Heather

- Author of Built to Shine, Are You That Dude's Girlfriend, You Can't Hide the Fruit, I Am NOT a Banana, and a leather Journal
- **Built to Shine** is the upcoming book launch — for women leading with faith in the business world
- Public speaker on faith, leadership, identity, generosity, courage
- Co-founder and co-CEO of GiveSendGo (10 years)
- One of twelve siblings
- Lives on the Eastern Shore of Maryland with husband Dan and kids (Rachel, Brieya, Harmony, Kenzie, and more)

## Voice Guidelines

- Plain, sturdy, honest writing
- **Minimize em dashes.** AI overuses them in prose, so avoid them in body copy.
  An occasional one is fine where it reads naturally (like a subject line).
  Never do bulk removal sweeps.
- No AI-sounding phrases
- Direct and warm, not corporate
- Faith woven in naturally, not preachy
- Honest estimates over optimistic ones

## Design System

Clean, professional, warm — matching the Kadence WordPress aesthetic but elevated.

### Colors (in css/main.css as CSS variables)
- `--bg: #ffffff` — main background
- `--bg-soft: #f7f4ee` — subtle warm tint
- `--bg-warm: #faf6ef` — section backgrounds
- `--ink: #1f2937` — body text, dark sections
- `--ink-soft: #4b5563` — secondary text
- `--ink-quiet: #6b7280` — captions
- `--accent: #b85638` — primary terracotta accent
- `--accent-deep: #8d3e26` — accent hover
- `--gold: #c8a365` — secondary warm accent
- `--border: #e5e0d5` — borders

### Typography
- Headlines: **Lora** (warm, modern serif)
- Body: **Inter** (clean sans-serif, weights 300-700)
- Use serif italic only for genuine emphasis, not as decoration on every headline

### Important Style Notes
- Heather dislikes when every headline has the same one-word-italic pattern (AI tell)
- Vary headline styles
- Subtitles should be CLEAN SANS-SERIF, not italic serif
- Keep buttons simple, not too many CTAs per section

## Tech Stack

- **Static HTML/CSS/JS** (no framework)
- **Cloudflare Pages** for hosting — auto-deploy is BROKEN, use `cloudflare-deploy.yml` workflow
- **Cloudflare Workers** for cron (daily emails) — deploy via `worker-deploy.yml` workflow
- **Cloudflare D1** database `blog-engagement` for all data
- **Brevo** for transactional email
- **GitHub repo:** `heatherlynwilson` under `brieyasmom-tr8ts` org
- **Domain:** heatherlynwilson.com

## Site Structure

```
heatherlynwilson/
├── index.html              # Home page
├── about.html              # About Heather
├── books.html              # 5 books
├── speaking.html           # Speaking topics + booking form
├── blog.html               # Blog landing page with category filter
├── blog/                   # Individual blog posts (60+)
├── contact.html            # Contact form
├── booking.html            # Book a call
├── projects.html           # Other projects / ventures
├── challenge.html          # Bible challenge hub + signup (all challenges)
├── challenge-james.html    # One Book Deep: James signup
├── challenge-beatitudes.html # Hide It In Your Heart signup
├── challenge-proverbs.html # Around the Table signup
├── challenge-thanks.html  # Give Thanks signup
├── challenge-gospels.html # God With Us signup
├── challenge/
│   ├── dashboard.html      # Combined challenge dashboard (all challenges)
│   ├── login.html          # Magic link login
│   └── ...                 # Certificates, email preview, etc.
├── built-to-shine.html     # Public book landing page + email list (see note below)
├── launch-team.html        # Invite-only book launch team signup (noindex)
├── admin.html              # HeatherLyn Dashboard (admin, noindex)
├── admin-emails.html       # Challenge email editor (admin)
├── manuscript.html         # Password-protected book reader for launch team (noindex)
├── content-queue/          # Queued blog posts (auto-publish MWF)
│   └── schedule.json       # Publish schedule (skip in publish script)
├── functions/api/          # Cloudflare Pages Functions (API endpoints)
├── workers/blog-cron/      # Daily email cron worker
├── css/main.css            # Brand system, nav, footer, buttons
├── css/post.css            # Blog post styles
├── scripts/publish_queue.py # Blog auto-publisher
├── scripts/convert_manuscript.js # Rebuilds manuscript.html from the Google Doc
├── .github/workflows/read-diag.yml # Prints /api/diag (worker diagnostics)
├── .github/workflows/read-api.yml  # Fetches any public page/endpoint, optional grep
└── CLAUDE.md               # This file
```

## Tracking & Analytics

- **Facebook Meta Pixel** (ID: 888808929804415) installed on all public pages
  - PageView on every page load
  - Lead event on challenge signups
  - Contact event on contact/speaking forms
  - Subscribe event on email signups
  - ViewContent on books page
- **Google Analytics** (G-FKRFZVG2JN) on all pages
- **Custom page_views table** in D1 with path, referrer, visitor_id, country, region, device
- **Device tracking** — User-Agent parsed to mobile/desktop/tablet, stored in `device` column
- **Signup source tracking** — `document.referrer` captured at signup, stored in `source` column
- **State/region tracking** — Cloudflare `cf.region` captured on page views and signups

## Bible Challenges

All challenges run on Cloudflare (Pages Functions + D1 + a cron Worker).

### The challenges

1. **Bible Reading Challenge** (`july-2026`): seven tracks: `full-bible`, `new-testament`,
   `chronological` (31 days each), `bible-90`, `chrono-90`, `ot-90`, `nt-90` (3 months, weekly emails).
   Evergreen: anyone can join any time. Signup: `challenge-bible.html`.
2. **One Book Deep: James + Prayer** (`august-james-2026`): read James every day for 31 days
   plus prayer focus and Lectio Divina journal. Official start August 1, 2026.
3. **Hide It In Your Heart** (`september-beatitudes-2026`): memorize the Beatitudes in 30 days.
   Translation stored in `track` (niv/nlt/esv/kjv). Official start September 1, 2026.
4. **Around the Table** (`october-proverbs-2026`): family devotional, one Proverbs chapter/day.
   Track is `family`. Official start October 1, 2026.
5. **Give Thanks** (`november-thanks-2026`): one psalm/day + gratitude list. Tracks:
   `one-psalm` (1/day) or `all-psalms` (all 150 in 30 days). Official start November 1, 2026.
6. **God With Us** (`december-gospels-2026`): read the Gospels in December. Tracks:
   `four-gospels` (Mark→John→Matthew→Luke, manger on Christmas Eve) or `luke` (one chapter/day,
   finish Christmas Eve + week of John). Includes advent scratch-off calendar with track-specific
   missions. Official start December 1, 2026.

### Beatitudes memory cards

Heather's 8-card visual memory art lives in `images/beatitudes/`: `card1..card8.jpg`
(full size), `card1-thumb..card8-thumb.jpg` (grid thumbnails), and
`beatitudes-memory-cards.pdf` (the original 8-card PDF, 3.65MB).

- Card N matches beatitude N, which is Matthew 5:(N+2). So card 1 = 5:3, card 8 = 5:10.
- On the dashboard: today's card shows above the lesson, and the full grid of 8 sits
  lower down. Both the countdown (pre-launch) screen and the live dashboard show them.
  `beatRenderCardGrid()` fills `#bCardGrid` and `#bCardGridPre`.
- Verse text under each card comes from the reader's own translation, pulled from
  `challenge/beatitudes-passage.json`. The printed art itself has no verse text on it,
  which is why the translation is layered on in code.
- Print: "Print the cards" and "Picture pegs" both call `beatPrintCards()`, which builds
  a title page, the 8 cards with their verses, and a translation credit line.
- Emails: `beatitudeCardBlock()` in the cron worker puts the matching card in each day's
  email. It returns nothing for beatitude 0 (the intro) and 9 (the closing), so only
  days on beatitudes 1-8 carry an image.

### Beatitude numbering

`beatitude` 0 = the setup verses (Matthew 5:1-2), 1-8 = the blessings (5:3-5:10),
9 = the closing (5:11-12). Day 1 learns the setup verses only. Day 2 starts the
blessings. The `hide_pct` column on each day drives the Fill the Blanks game
(0/25/50/75/100 = None/A little/Half/Most/All): day 1 is 25, day 2 is 10.

### Translation switching

Readers can change translation any time from the dashboard (`#bTransSwitch`) or the
countdown screen (`#bTransSwitchPre`, sitting above "What to expect"). The words they
are memorizing change with it, so the note under the switcher tells them to pick one
early and stay there.

### How challenge start dates work (launch model)

Changed August 2026 (used to be a 7-day fixed cohort after launch). The rule
lives in two places: `functions/api/challenge-signup.js` (backend, the source
of truth) and each `challenge-*.html` signup page (shows or hides the picker).

1. **Before the official start (the 1st of the month):** signups are held.
   Everyone's start date is set to the 1st. No date picker is shown.
2. **From the 1st onward (evergreen):** the signup page shows a "When do you
   want to start?" picker. Any date is allowed, including past dates on
   purpose, so someone can catch up with friends who already started (the
   form warns them when they pick a past date). On launch day the picker
   defaults to today so signups start with everyone; after that it defaults
   to tomorrow.
3. **Groups override everything:** joining a group sets your start date to the
   group creator's, so the whole group reads the same day.

The main Bible Reading Challenge (`july-2026`) is past its official start, so
it is simply evergreen: every new signup picks a date.

### "Do it with Friends" Group System

Full group challenge feature allowing friends to read together:

**Database tables:**
- `challenge_groups` — id, name, challenge, track, created_by_email, created_at
- `group_members` — group_id, email, name, joined_at (UNIQUE group_id+email)
- `group_messages` — group_id, email, name, message, created_at (280 char limit)

**API endpoints** (all in `functions/api/`):
- `group-create.js` — POST: create group, returns invite URL, sends welcome email with share link/code/checklist
- `group-join.js` — GET: public group info for invite page; POST: join a group
- `group-dashboard.js` — GET: members, check-in status, streak, messages
- `group-message.js` — POST: post to encouragement wall (rate limited 20/day)
- `group-list.js` — GET: all groups a user belongs to
- `group-leave.js` — POST: leave a group (auto-deletes empty groups)

**How groups work:**
- Create a group during signup or from the dashboard
- Groups are tied to a challenge and a track (invitees get the same reading plan)
- Invite via shareable link: `challenge?group=XXXXXXXX` or by entering code on dashboard
- Group invite banner shows at top of signup page with member names
- Track picker is hidden for invitees (locked to group's track)
- Already-signed-up users can still join groups
- Dashboard shows group section at top: today's check-ins (avatar circles), group streak,
  member progress cards, encouragement wall, invite link with native share
- Celebration state when everyone checks in: "Everyone read today!"
- Group completion: "Your whole group finished" with gold badge
- Shareable progress card (1080x1080 PNG via canvas, Web Share API on mobile)
- Leave group link at bottom

**Daily emails include group status:**
- Subject line: "Day 18: Genesis 40-43 | Tuesday Bible Study"
- Body: warm card showing "Your group: [name] — 3 of 5 friends read yesterday"
- Group invite URL in welcome emails instead of generic challenge link
- Join notifications emailed to existing members when someone new joins

### Combined dashboard

`challenge/dashboard.html` is a single dashboard for ALL challenges:
- Magic link auth (email + HMAC token)
- Hash routing: `#july-2026`, `#august-james-2026`, etc.
- Group section moves into the active challenge view via insertBefore
- No-group state shows "Start a group" / "Join by code" options
- Group refreshes after any check-in (July, James, Beatitudes, Proverbs)
- **My Journal** on the 31-day Bible reading challenge (`#julyJournalSection`): every entry
  the reader has written, newest first, each one openable and editable in place. It sits
  inside the main column, not as a sibling of the sidebar, so it stays in the right order
  on a phone.
- **Group roster is visible before launch too.** The members list used to be hidden during
  the countdown, so tapping the group arrow dropped people straight onto the encouragement
  wall with no way to see who had joined.
- **Completion celebration requires every day.** `maybeShowCompletionCelebration()` returns
  early unless `daysDone` equals the challenge total, and `functions/api/challenge-complete.js`
  counts `DISTINCT day` in `challenge_checkins` server side before sending the finish email.
  If it cannot read the count, it declines to send rather than guessing. Marking only the
  last square used to fire the whole celebration.

### Backend pieces

- **D1 database `blog-engagement`** — all tables
- **APIs** in `functions/api/` — challenge-signup, challenge-login, challenge-checkin,
  challenge-journal, group-*, contact, subscribe, stats, etc.
- **Challenge emails**: `workers/blog-cron/src/index.js` sends at 6:05am ET
- **Blog emails**: same worker, 8:05am ET cron — weekly digest on Mondays (daily opt-in available)
- **Inactive readers** (no check-in 7+ days) get weekly summary on Mondays instead of daily emails
- **Magic link token**: HMAC of `email + ":challenge:" + "2026-10-01"` with NOTIFY_SECRET
- **Signup API returns dashboard token** so frontend can call group-create without
  needing the HMAC secret client-side

### Email content is editable in D1

Challenge emails live in `challenge_emails` table. Edit at `/admin-emails.html`.
The cron worker and dashboards read from DB first, fall back to packaged JSON.

## Scheduled Blog Publishing

MWF at 7am Eastern. `scripts/publish_queue.py` publishes from `content-queue/`.
**Important:** `schedule.json` in content-queue is skipped by the publish script
(it crashed before this fix was added).

### Blog page sorting

Every card in `blog.html` carries `data-date="YYYY-MM-DD"` (the CARD_TEMPLATE in
`publish_queue.py` writes it on new posts). The "All Posts" tab merges every category
into one `#allPostsSection` sorted newest first. The category tabs still filter to
just that category.

Careful editing `blog.html` with regexes: a named group is worth the extra typing.
A positional group once matched the category slug instead of a closing tag and
shredded the markup across every card.

### The blog fallback renderer

`functions/blog/[[path]].js` renders a post from `published.json` when there is no
static HTML file for it yet. The `verse`, `verse_ref`, and `question` fields are
inserted raw, not escaped, so HTML entities like `&mdash;` render as real characters.
A post can be live through this renderer while no file exists in `blog/` — do not
call it unpublished just because the file is missing.

## Book Launch

### There are TWO Built to Shine lists

Easy to mix up, and they live in different tables:

1. **The book page list** — `built-to-shine.html` at `/built-to-shine`, public. Anyone
   can join to hear when the book comes out. Goes through `/api/subscribe` into the
   ordinary `subscribers` table, tagged `source = 'built-to-shine'`. When Heather asks
   about "my Built to Shine list", this is almost always the one she means.
2. **The launch team** — `launch-team.html`, invite-only and noindex. Separate
   `launch_team` table. Much smaller, and she hands the link out personally.

Known issue, not yet fixed: the bottom form on `built-to-shine.html` (`ctaForm`) has no
Turnstile widget of its own and borrows the token from the hero form at the top. That
token expires after about five minutes, so someone who reads the whole page and then
signs up at the bottom can fail silently. The hero form is fine.

### Built to Shine Launch Team

Invite-only signup page at `launch-team.html` (noindex, nofollow).

- Heather shares the link with specific people she wants on the team
- Signups stored in `launch_team` table with `book` column (default: `built-to-shine`)
- Captures: name, email, social handle, why they want in, 3 commitment checkboxes
- Reusable for future books (just change the `book` value in the form)
- Heather gets email notification for each signup
- Admin dashboard shows Launch Team section with member cards

### Launch Team API

`/api/launch-team` — POST: signup; GET with admin key: list all members.
Duplicate check is per-book (same person can join teams for different books).

## Admin Dashboard (HeatherLyn Dashboard)

`admin.html` — beautiful single-page admin dashboard. Auth via admin key in localStorage.

### Sections (scrollable with sticky nav):
1. **Health Check** — green/yellow status bar
2. **Milestone** — celebration banner at 25/50/75/100/150/200/250/500 signups
3. **Summary Cards** — Visitors, Signups, Subscribers, Groups with trend arrows
4. **Insights for Heather** — plain-language bullets computed from data
5. **Challenge Performance** — per-challenge cards with today/total/source/active
6. **Conversion Funnel** — visitors → signups → active → completed with rate
7. **Best Signup Hours** — bar chart by hour with peak highlighted
8. **Mobile vs Desktop** — donut chart with mobile/desktop/tablet split (last 30 days)
9. **Where People Are** — US state tile grid map + state/country lists
10. **Traffic Sources** — horizontal bar chart (Instagram pink, Facebook blue, etc.)
11. **Email Performance** — Brevo open/click/bounce/unsubscribe stats with Day/Week/Month/All filter, daily opens sparkline
12. **Groups** — group cards with members and invite codes
13. **Signups** — searchable, sortable, paginated table with source/group/state columns
14. **Subscribers** — sortable, paginated with resubscribe/remove
15. **Upcoming Content** — queued blog posts with publish dates
16. **Launch Team** — members with social handles and "why" responses
17. **Contact Inquiries** — booking/contact submissions, speaking inquiries highlighted
18. **Manuscript Notes** — launch team reader notes with highlighted passages

### Date filter: Today / 7 Days / 30 Days
### Tables: 25 per page, sortable columns, CSV export, copy emails

### API endpoints used:
- `/api/challenge-admin` — signups, groups, contacts, content queue, page views,
  signup hours, countries, states, signup states
- `/api/stats` — traffic (visitors, views, daily, pages, referrers, countries)
- `/api/subscribers` — email subscriber management
- `/api/challenge-stats` — analytics (active, completed, checkins, streaks)
- `/api/download-leads` — guide downloads
- `/api/launch-team` — launch team members
- `/api/email-stats` — Brevo open/click/bounce stats (Day/Week/Month/All)
- `/api/manuscript-notes` — launch team reader notes + highlights
- `/api/blog-pref` — one-click daily/weekly blog email toggle

## Deploy Commands

- **Pages:** `git push origin main` then `gh workflow run cloudflare-deploy.yml --ref main`
- **Worker:** `gh workflow run worker-deploy.yml --ref main`
- **D1 query:** `cd C:\Users\Heather && npx wrangler d1 execute blog-engagement --remote --command "SQL"`

## Deploy Gotchas

- Cloudflare Pages auto-deploy from GitHub is BROKEN. Always trigger manually.
- Worker changes need the separate workflow.
- The Edit tool has corrupted straight quotes into curly quotes in inline JS before.
  After editing dashboard JS, extract the script block and run `node --check` on it.
- `publish_queue.py` skips `schedule.json` in content-queue (was crashing on it).
- D1 crashes on `undefined` in .bind() — always use `|| ""` or `|| null` fallbacks.
- **Challenge email content lives in D1, not the packaged JSON.** `challenge/emails-*.json`
  is only the fallback used when the `challenge_emails` table has no rows for that plan.
  Editing the JSON alone changes nothing live. Check what is really being served with
  `read-api.yml` against `api/plan-emails?plan=<plan>`.
- **Editing email content without the admin key:** `/api/admin-emails` needs `ADMIN_KEY`,
  which Claude does not have. The way in is a one-time task in the cron worker (marker row
  in `apology_log`, same pattern as every other one-time task) that UPDATEs
  `challenge_emails`. Write only the columns you mean to change — never the whole row —
  so hand edits Heather is making at the same time are not clobbered. Runs on the next
  cron tick, not instantly.
- Preview mode (`?preview=1`) and the live dashboard are separate code paths. A bug fixed
  in one is not fixed in the other. Both should read content through `loadPlanContent()`.
- Long-running Playwright runs in this sandbox often time out. Abort non-localhost
  requests, avoid `await` inside `page.evaluate`, and give the script a hard `process.exit`.
- **Use `git merge origin/main`, never `git pull --rebase`.** The working branch carries
  merge commits, so a rebase tries to replay hundreds of commits and buries you in
  add/add conflicts.
- Claude cannot reach heatherlynwilson.com from this sandbox. To see what the live site
  is serving, run the `read-api.yml` workflow (any public path from the site root, with an
  optional grep) or `read-diag.yml` for the `diag_log` rows the worker writes via
  `diagPut()`. Worker one-time tasks report their results there.

## What's Done

- [x] Full website (home, about, books, speaking, blog, contact, projects, booking)
- [x] 60+ blog posts with MWF auto-publishing
- [x] 6 Bible challenges with signups, dashboards, daily emails, journals
- [x] "Do it with Friends" group system (create, join, invite, wall, streak, share card)
- [x] Group-created welcome email with share link, code, and invite checklist
- [x] Facebook Meta Pixel with conversion events
- [x] HeatherLyn Dashboard (admin) with full analytics
- [x] Launch team signup page for Built to Shine
- [x] Source tracking (Instagram/Facebook/Direct/etc.)
- [x] State/region tracking with tile map
- [x] Mobile vs desktop tracking (donut chart in admin)
- [x] Email performance tracking (Brevo API: opens, clicks, bounces, unsubscribes)
- [x] Contact form submissions tracked in admin
- [x] Content queue visible in admin
- [x] Post-challenge follow-up emails (7 days + 30 days after completion)
- [x] Pre-launch drip emails with track-specific variants (e.g. Luke vs four-gospels)
- [x] Advent scratch-off calendar with track-specific missions (Luke vs four-gospels)
- [x] Manuscript reader at `/manuscript` (password-protected, chapter nav, highlights + notes)
- [x] Weekly blog digest (default) with daily opt-in
- [x] Inactive reader weekly summaries (no check-in 7+ days → Monday recap)
- [x] Heather's digest switched to weekly (Mondays)
- [x] Beatitudes visual memory cards (dashboard, countdown screen, daily email, printable, PDF)
- [x] Translation switcher on both the countdown and live Beatitudes dashboard
- [x] My Journal view/edit on the 31-day Bible reading challenge
- [x] Completion celebration and finish email gated on all days being marked
- [x] Public Built to Shine book page with its own email list
- [x] Blog "All Posts" tab shows every category, newest first
- [x] Read-only diagnostic workflows (`read-diag.yml`, `read-api.yml`) so Claude can see
      what the live site is actually serving

## What's Still To Do (priority order)

### 1. Book Launch Preparation
- [ ] Pre-order link on the Built to Shine page (page and email list are live)
- [ ] Fix the bottom form on `built-to-shine.html` — it needs its own Turnstile widget
      instead of borrowing the hero form's expiring token
- [ ] QR code generator for speaking events (trackable per-event URLs)

### 2. Site Polish
- [ ] Confirm which books sell direct vs Amazon
- [ ] YouTube URL for social links
- Old WordPress site (d9b.09a.myftpupload.com) — paid through 3 years, will not renew. Turn off auto-renew.

### 3. Future Features (when ready)
- [ ] Public groups (browse and join open groups for people without a friend circle)
- [ ] Server-side profile photos for group avatars (currently initials only)
- [ ] A-to-Z Scripture memory challenge (26 verses, one per letter, ~30-40 days) for
  New Year 2027 or spring/Lent. Inspired by the Samaritan's Purse "Gospel Alphabet"
  bookmark a reader shared. Pick our own verse list, don't copy their card.

## Manuscript Reader

`manuscript.html` — password-protected book reader for the Built to Shine launch team.

- **Password:** `Ilovetoread` (SHA-256 hashed client-side)
- **Features:** chapter sidebar, remembers reading position, font size controls, progress bar
- **Highlights:** select text → tap Highlight → add optional note. Gold marks with pencil icon.
- **Notes:** per-chapter textarea at bottom, saves to server via `/api/manuscript-notes`
- **Admin view:** Manuscript Notes section in admin dashboard shows highlighted passages + reader notes
- **Content:** static snapshot from Google Drive. Must manually rebuild if manuscript changes.
- noindex/nofollow, not linked from anywhere
- **Rebuild with `scripts/convert_manuscript.js`.** Formatting fixes belong in that script,
  not in the generated HTML, or they vanish the next time the doc is regenerated. The
  front-matter branch is what turns the dedication into `.r-dedication` and "A Note Before
  We Begin" into an `h2.r-title`.
- Paragraph numbers were removed, so the notes hint at the bottom of each chapter asks for
  an overall thought on the chapter rather than a paragraph reference.

## Social Auto-Posting

All social posts run in the cron worker. Blog, promo, and gift posts cross-post to all three platforms.

### Facebook
- Page ID: 1522539041374773, via Graph API
- Token: `FB_PAGE_TOKEN` worker secret
- **TOKEN EXPIRES ~September 25, 2026** — renew every 60 days
- To renew: Graph API Explorer (developers.facebook.com/tools/explorer/) → HeatherLynWilson app
  → select HeatherlynWilson page → add `pages_manage_posts` + `pages_read_engagement` permissions
  → Generate Access Token → exchange for long-lived token via the `/oauth/access_token` endpoint
  → store with `npx wrangler secret put FB_PAGE_TOKEN --name blog-publish-cron`
- Meta App ID: 4394729444102718 (keep in Development mode, no need for Live)

### X (Twitter)
- Uses OAuth 1.0a request signing (built into the worker, no library)
- Secrets: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`
- Keys do NOT expire (set-it-and-forget-it)
- Posts trimmed to 280 chars automatically (links count as 23 chars)
- Developer portal: developer.x.com → HeatherLynWilson app
- If posting fails with permissions error: confirm app is set to Read and write,
  then regenerate Access Token and Secret

### LinkedIn
- Uses Community Management API (REST Posts endpoint)
- **LinkedIn-Version header must be an active YYYYMM version (LinkedIn sunsets
  versions after ~1 year).** Currently 202606 in the worker. A 426
  NONEXISTENT_VERSION error means bump it to a recent month.
- Secrets: `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_PERSON_ID`
- Person ID secret is only a FALLBACK: the worker asks /v2/userinfo who the
  token belongs to and posts as that member (the hand-copied profile ID
  `ACoAAAzHQt4B...` was the wrong kind of ID and caused bare 403s)
- **TOKEN EXPIRES ~October 13, 2026** — renew every 60 days
- To renew: LinkedIn Developer Portal → HeatherLynWilson app → Auth tab
  → generate new token with `w_member_social` scope
  → store with `npx wrangler secret put LINKEDIN_ACCESS_TOKEN --name blog-publish-cron`
- LinkedIn Developer app also has "Sign In with LinkedIn using OpenID Connect" product enabled

## Email Volume Management

Brevo plan: 10K emails/month. Key volume controls:

- **Blog:** weekly digest on Mondays (default). Daily opt-in via `/api/blog-pref?mode=daily`.
- **Inactive challenge readers:** no check-in for 7+ days → weekly Monday summary instead of daily.
  Daily emails resume automatically when they check in again. First 7 days always daily.
- **Heather's digest:** weekly on Mondays (was daily).
- **Preference page:** `/api/unsubscribe` shows blog (daily/weekly toggle), per-challenge toggles,
  group notification toggle. All in one page.
- **email_prefs table columns:** challenge_optout, group_optout, blog_daily

## Site Overview for ChatGPT

`SITE-OVERVIEW.md` in the repo root is a plain-language inventory of everything
built on the site. Heather pastes it into ChatGPT for branding and content
work. **Update it whenever a notable feature ships** so her ChatGPT context
stays accurate. No secrets or credentials in that file, ever - it is public.

## Heather's Preferences (always follow)

- **Always deploy to main** after working on code
- **Separate code blocks per command** (don't combine multiple deploy commands in one box)
- **Call her Heather**
- **Plain sturdy writing**, no AI-sounding prose
- **Minimize em dashes** (avoid in prose, occasional use like subject lines is fine)
- **Honest estimates** over optimistic ones
- Heather is not a developer — explain things clearly, not in jargon
- **Prefer robust/scalable architecture** over simple/fast options
- **Auto-commit and push** changes to main without asking
