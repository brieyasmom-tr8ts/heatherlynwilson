# Full Website Audit

**Site:** heatherlynwilson.com
**Audited:** 15 September 2026
**Scope:** entire repository, 529 tracked files
**Auditor note:** every claim below is backed by a command that was actually run.
Anything that could not be checked from this environment is marked
**NOT VERIFIED** with what it would take to check it.

---

## Executive Summary

**Overall status: healthy, with one unresolved risk that needs answering before
the next launch.**

The site is in better shape than its size suggests. All automated checks pass,
there are zero broken internal links across 2,897 of them, every challenge's
content file has the right number of days in the right order, no secrets are
committed, and every admin endpoint is guarded. A guard now runs on every push.

**Production ready?** Yes for current traffic, with one caveat. Nothing found
is actively breaking today. The item that stops this being an unqualified yes is
**HIGH-001**, a second email worker that nobody deploys but which may still be
live on Cloudflare and would fire in July 2027. That cannot be resolved from
here and needs one command run on Heather's machine.

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 3 |
| Medium | 5 |
| Low | 6 |
| Informational / cleanup | 5 |

**The honest limits of this audit.** I cannot reach the live site directly,
query the D1 database, log in as a reader, or run a browser. So this audit
covers code, content, configuration and data flow thoroughly, and covers
rendering, real user journeys, and production data **not at all**. Every such
item is marked NOT VERIFIED rather than assumed to pass.

---

## System Overview

Static HTML on Cloudflare Pages. No framework, no bundler, no `package.json` at
the root, no build step for the pages. Three runtimes:

1. **Pages** — 112 HTML files carrying 234 inline script blocks. What is in the
   file is what ships.
2. **Pages Functions** — 60 endpoints under `functions/api/`, plus
   `functions/blog/[[path]].js` (renders a post with no static file) and
   `functions/v/[id].js` (video share pages pulling live from Vimeo).
3. **Cron worker** `blog-publish-cron` — 4,743 lines, sends every email and
   posts to Facebook, X and LinkedIn.

**Data:** one Cloudflare D1 database, `blog-engagement`, 44 tables. Tables are
created with `CREATE TABLE IF NOT EXISTS` at first use rather than by migration.

**Auth:** readers never have passwords. A magic link carries `email` plus an
HMAC token (`NOTIFY_SECRET`). Admin surfaces use an `ADMIN_KEY` in localStorage.

**Third party:** Brevo (email), Cloudflare Turnstile (captcha), Facebook Graph,
X, LinkedIn, Vimeo, Google Analytics, Meta Pixel.

**Environment variables referenced** (names only): `ADMIN_KEY`, `BREVO_API_KEY`,
`FB_PAGE_TOKEN`, `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_PERSON_ID`, `NOTIFY_SECRET`,
`TURNSTILE_SECRET`, `X_ACCESS_SECRET`, `X_ACCESS_TOKEN`, `X_API_KEY`,
`X_API_SECRET`.

**Source of truth:** `challenge/registry.json` describes all 8 challenges and 19
tracks. The hub, dashboard and certificate read from it.
`scripts/check_registry.py` proves it matches the code.

---

## Challenge Inventory

| Challenge | Status | Dates | Days | Reading structure | Emails | Progress | Issues |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bible Reading Challenge (`july-2026`) | Live, evergreen | from 2026-07-01 | 31 or 90 | 7 tracks | daily, weekly for 3-month | `challenge_checkins` | MED-002 |
| One Book Deep: James (`august-james-2026`) | Live, evergreen | from 2026-08-01 | 31 | James 1-5 daily | daily | checkins + journal | none |
| 31 Days of Living Hope (`obd-first-peter`) | **Scheduled** | from 2027-02-01 | 31 | 1 Peter 1-5 daily | daily | checkins + journal | HIGH-003 |
| Hide It In Your Heart (`september-beatitudes-2026`) | Live, evergreen | from 2026-09-01 | 30 | Matthew 5:1-12 | daily | checkins + journal | none |
| Around the Table (`october-proverbs-2026`) | Upcoming | from 2026-10-01 | 31 | Proverbs, 1 ch/day | daily | checkins + journal | none |
| Give Thanks (`november-thanks-2026`) | Upcoming | from 2026-11-01 | 30 | 2 tracks | daily | checkins + journal | none |
| God With Us (`december-gospels-2026`) | Upcoming | from 2026-12-01 | 31 | 2 tracks | daily | checkins + journal | none |
| ABC Bible Memory (`abc-memory-2027`) | Live, evergreen | no official start | 56 calendar / 21 verses | 21 verses + 4 reviews | letter-days only | `abc_progress` | MED-004 |

**Content integrity: all 19 tracks pass.** Correct day count, contiguous
numbering, no duplicates, no gaps. ABC's 26 entries against a 56-day calendar is
correct by design: emails only go out on letter days.

---

## Test Results

| # | Check | Command | Result |
| --- | --- | --- | --- |
| 1 | Full site guard | `python3 scripts/check_site.py` | **PASS** (exit 0) |
| 2 | Registry matches code | `python3 scripts/check_registry.py` | **PASS**, 8 challenges, 19 tracks |
| 3 | All JSON parses | part of guard | **PASS**, 58 files |
| 4 | Inline JS parses | part of guard | **PASS**, 234 blocks, 111 pages |
| 5 | Server-side JS parses | `node --check` on all | **PASS**, 69 files |
| 6 | Challenge day integrity | custom script, per track | **PASS**, 19/19 |
| 7 | Internal links resolve | custom crawler | **PASS**, 2,897 links, 0 broken |
| 8 | Secrets committed | pattern scan | **PASS**, none found |
| 9 | Admin endpoints guarded | per-file scan | **PASS**, 20/20 |
| 10 | Dev/staging URLs in shipped code | grep | **PASS** (1 hit, in an unshipped script) |
| 11 | Copyright year consistency | grep | **PASS**, 73/73 read 2026 |
| 12 | Images missing alt text | grep | **PASS**, 0 real images |
| 13 | Orphaned pages | reachability crawl | 3 candidates, see LOW-001 |
| 14 | Automated unit/integration tests | `ls test*` | **NONE EXIST** (INFO-002) |
| 15 | Production build | n/a | **NOT APPLICABLE**, no build step |
| 16 | Live page rendering | n/a | **NOT VERIFIED**, no browser |
| 17 | Database state | n/a | **NOT VERIFIED**, no D1 access |
| 18 | Call graph after the dashboard split | acorn parse of dashboard + 7 files | **PASS**, 0 undefined calls, 0 name collisions |
| 19 | External links reachable | n/a | **NOT VERIFIED**, no outbound fetch |

---

## Findings

### [HIGH-001] A second email worker exists that nothing deploys and that may still be live

- **Severity:** High
- **Area:** Email / infrastructure
- **Files:** `workers/challenge-emails/src/index.js` (188 lines),
  `workers/challenge-emails/wrangler.toml`
- **Challenge affected:** `july-2026`
- **Description:** There are two workers in this repo. `blog-publish-cron` is
  the live one and `worker-deploy.yml` deploys it. A second worker named
  `challenge-emails` also exists, with its own `wrangler.toml`, its own cron
  `0 10 * 7 *` (10:00 UTC every day in **July**), an `async scheduled()` handler
  and a live Brevo send call at line 157. **No workflow deploys it**, it is
  referenced nowhere else in the repository, and it was last touched
  2026-08-19.
- **Why it matters:** If it is still deployed on Cloudflare from an earlier
  manual deploy, it will wake up on 1 July 2027 and send a **second** daily
  email to everyone signed up for `july-2026`, on top of the one
  `blog-publish-cron` sends at 6:05am. Worse, its content is **hardcoded into
  the file** (`EMAILS_FULL_BIBLE` as an embedded array) rather than read from
  D1 or the JSON, so it would send content frozen at August 2026 and ignore
  anything edited since.
- **Evidence:**
  ```
  workers/challenge-emails/wrangler.toml:  name = "challenge-emails"
                                           crons = ["0 10 * 7 *"]
  src/index.js:12   const CHALLENGE = "july-2026";
  src/index.js:99   async scheduled(event, env) {
  src/index.js:157  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
  ```
- **How to reproduce:** NOT VERIFIABLE from here. Requires
  `npx wrangler deployments list --name challenge-emails` or the Cloudflare
  dashboard Workers list.
- **Recommended fix:** Determine whether it is deployed. If it is, delete the
  Cloudflare worker (`npx wrangler delete --name challenge-emails`). Then remove
  `workers/challenge-emails/` from the repo so it cannot be redeployed by
  accident. Do not delete the directory before confirming, because the directory
  is the only record of what the deployed worker contains.
- **Risk of fix:** Low once confirmed. Deleting a worker that is not deployed is
  a no-op; deleting one that is stops a duplicate send.
- **Verification after fix:** `npx wrangler deployments list --name
  challenge-emails` returns nothing, and `scripts/check_site.py` still passes.

---

### [HIGH-002] Switching Bible plan carries your check-ins onto the new plan

- **Severity:** High
- **Area:** Data integrity / challenge correctness
- **Files:** `functions/api/challenge-switchplan.js:40`
- **Route:** dashboard, Bible challenge, "Switch plan"
- **Challenge affected:** `july-2026`, all 7 tracks
- **Description:** `challenge-switchplan` runs exactly one statement:
  `UPDATE challenge_signups SET track = ? WHERE email = ? AND challenge = ?`.
  It does not touch `challenge_checkins`. Progress is keyed on
  `(email, day, challenge)` and **not on track**, so every day already ticked
  stays ticked against the new plan.
- **Why it matters:** A reader 20 days into the New Testament plan who switches
  to chronological is instantly "on day 20" of chronological with twenty days
  marked as read that they have never read. If they then switch to a 3-month
  track, the same 20 days count toward 90. The completion email says "you showed
  up every single one", which would not be true.
- **Evidence:**
  ```
  $ grep -cE 'DELETE|challenge_checkins' functions/api/challenge-switchplan.js
  0
  ```
- **How to reproduce:** Sign up for `july-2026` on `full-bible`, check off days
  1-5, use Switch plan to move to `chronological`, reopen the dashboard. Days
  1-5 are still ticked. **NOT VERIFIED live** (requires a logged-in session);
  confirmed by reading the code and the table's unique constraint.
- **Recommended fix:** Two options. Either make Switch plan archive the round
  and reset, which is what Start over already does correctly, or add `track` to
  `challenge_checkins` so progress is per plan. The second is the real fix and
  is already planned in `docs/challenge-architecture.md`. The quick mitigation
  is to remove Switch plan for anyone who already has check-ins and point them
  at Start over.
- **Risk of fix:** Medium. Adding a column changes a table that six endpoints
  read. The quick mitigation is low risk.
- **Verification after fix:** Switch plan with existing check-ins, confirm the
  new plan starts at day 1 and the old round appears under Past challenges.

---

### [HIGH-003] 31 Days of Living Hope has no dashboard view

- **Severity:** High
- **Area:** Challenge completeness
- **Files:** `challenge/dashboard.html`, `challenge/js/onebookdeep.js`
- **Challenge affected:** `obd-first-peter`
- **Description:** 1 Peter is fully wired for signup, welcome email, daily
  emails, completion email, certificate, hub and nav. It has **no dashboard
  view**. `challenge/js/onebookdeep.js` contains only the James functions
  (`james*`), and the dashboard has no `#obd-first-peter` view to route to.
- **Why it matters:** Signups open now and the challenge launches 1 February
  2027. A reader who signs up and clicks their dashboard link will land on a
  dashboard with no 1 Peter screen. The welcome email already links there.
- **Evidence:** `challenge/registry.json` has `"hash": "#obd-first-peter"`;
  no matching view exists in `challenge/dashboard.html`.
- **How to reproduce:** Sign up for 1 Peter, open the dashboard link in the
  welcome email. **NOT VERIFIED live.**
- **Recommended fix:** Make the One Book Deep view render whichever book is
  active, driven by the registry, rather than cloning the James view. The
  groundwork exists: `OBD_BOOKS` in the dashboard already keys book wording by
  track.
- **Risk of fix:** Medium. Touches a live challenge (James) that has finishers.
- **Verification after fix:** Open the dashboard with `#obd-first-peter` and
  confirm the day grid, journal and check-in all read 1 Peter.

---

### [MED-001] The daily challenge email has no duplicate-send protection

- **Severity:** Medium
- **Area:** Email
- **Files:** `workers/blog-cron/src/index.js`, `sendChallengeEmails()`
- **Description:** Nudges use `nudge_log`, Facebook posts use `fb_post_log`,
  Beatitudes recruitment uses `beatitudes_recruit_log`, and completion emails
  use `challenge_completion_emails`. The **main daily challenge send has no
  such guard**. If `sendChallengeEmails` runs twice for the same Eastern date,
  every participant gets two copies.
- **Why it matters:** It is currently protected only by the fact that one cron
  fires once. A manual re-run, a Cloudflare retry after a partial failure, or a
  future second cron entry would double-send to the whole list. On a 10K/month
  Brevo plan a double send is also a billing event.
- **Evidence:** searching `sendChallengeEmails` for `INSERT OR IGNORE`, `sent`,
  `already` or a log table returns nothing; the other four senders all match.
- **How to reproduce:** NOT VERIFIABLE safely. Reproducing means sending real
  email to real readers.
- **Recommended fix:** The same pattern the others use. Before sending, insert
  `challenge + email + eastern date` into a log table with
  `INSERT OR IGNORE`; skip when `changes === 0`.
- **Risk of fix:** Low, and it is the established pattern in this file.
- **Verification after fix:** Invoke the send twice in a row against a test
  address and confirm only one email arrives.

---

### [MED-002] `like` and `vote` can be inflated without limit

- **Severity:** Medium
- **Area:** Security / data quality
- **Files:** `functions/api/like.js`, `functions/api/vote.js`
- **Description:** Both accept an unauthenticated POST and increment a counter
  with no visitor identity, no unique constraint and no rate limiting.
  `comment-heart` does this correctly with `UNIQUE(comment_id, visitor)`;
  these two do not.
- **Why it matters:** Anyone can run a loop and drive a blog post's like count
  or the About page vote to any number. It is vanity data, not user data, so the
  damage is credibility rather than harm. It also means those numbers cannot be
  trusted for deciding what content works.
- **Evidence:**
  ```
  $ grep -nE 'INSERT|UNIQUE|visitor' functions/api/like.js   -> no visitor, no UNIQUE
  $ grep -nE 'UNIQUE|visitor' functions/api/vote.js          -> no visitor, no UNIQUE
  $ grep -n 'UNIQUE' functions/api/comment-heart.js          -> UNIQUE(comment_id, visitor)
  ```
- **Recommended fix:** Copy the `comment-heart` approach: a localStorage visitor
  id plus a unique constraint.
- **Risk of fix:** Low. Existing counts stay as they are.
- **Verification after fix:** POST twice from the same visitor id, confirm the
  count moves once.

---

### [MED-003] The Brevo webhook accepts anything, from anyone

- **Severity:** Medium
- **Area:** Security
- **Files:** `functions/api/brevo-events.js`
- **Description:** The endpoint performs no sender verification. Any POST with
  `{event: "opened", email: "..."}` writes a row into `email_prefs`.
- **Why it matters:** Two effects. First, engagement can be forged, and
  engagement is what decides whether a quiet reader drops from daily to weekly
  emails, so a forger could keep addresses on daily sends. Second, and more
  practically, **each unknown address creates a new `email_prefs` row**, so a
  script could grow that table without limit.
  The file's own comment acknowledges the first risk but not the second.
- **Evidence:** no `header`, `signature`, `secret` or `token` check in the file;
  `INSERT INTO email_prefs ... ON CONFLICT(email) DO UPDATE` at line 28.
- **Recommended fix:** Either a shared secret in the webhook URL that the worker
  already knows when it registers the hook (see `brevoWebhookSetupOnce`), or
  ignore addresses that are not already in `subscribers` or
  `challenge_signups`. The second also fixes the row growth.
- **Risk of fix:** Low, but re-registering the webhook with Brevo is required if
  the URL changes.
- **Verification after fix:** POST an unknown address, confirm no row appears.

---

### [MED-004] ABC's calendar length and finish line are two different numbers

- **Severity:** Medium
- **Area:** Challenge correctness
- **Files:** `challenge/registry.json`, `functions/api/challenge-complete.js`
- **Challenge affected:** `abc-memory-2027`
- **Description:** ABC is 56 days on the calendar and 21 verses to finish. Both
  numbers are correct and both are needed, but they live in several places:
  `total: 56` in the worker and follow-up maps, `completionTotal: 21` in the
  registry, `21` in `CHALLENGE_TOTALS`. This is the exact shape of the bug fixed
  this week where the 3-month tracks passed a 31-day check.
- **Why it matters:** Not currently wrong, verified by
  `scripts/check_registry.py`. It is fragile rather than broken: a future edit
  that changes one number and not the others reintroduces a completion bug that
  is invisible until someone finishes.
- **Evidence:** `check_registry.py` compares these and passes today.
- **Recommended fix:** Nothing urgent. The guard already catches drift. Worth
  noting in case ABC's shape changes.
- **Risk of fix:** n/a
- **Verification:** `python3 scripts/check_registry.py`

---

### [MED-005] Every API sends `Access-Control-Allow-Origin: *`

- **Severity:** Medium
- **Area:** Security
- **Files:** 60 files in `functions/api/`, 95 occurrences
- **Description:** Every endpoint, including token-authenticated ones, allows
  any origin.
- **Why it matters:** Auth here is a token in the URL, not a cookie, so there is
  no CSRF exposure in the usual sense: a hostile page cannot borrow ambient
  credentials. The real effect is that any site can call these endpoints and
  read responses, so a phishing page could present a working copy of the
  dashboard if it also had the reader's magic link. This is a hardening item,
  not an open door.
- **Recommended fix:** Restrict to `https://heatherlynwilson.com` on endpoints
  that return reader data (`challenge-login`, `challenge-journal`,
  `group-dashboard`, `manuscript-notes`). Leave public read endpoints open.
- **Risk of fix:** Medium. Getting it wrong breaks the dashboard. Test on one
  endpoint first.
- **Verification after fix:** Dashboard still loads; a fetch from another origin
  is refused.

---

### [LOW-001] Three pages appear to be dead

- **Severity:** Low
- **Files:** `challenge-plans.html` (last touched 2026-07-21),
  `challenge/dashboard-james.html` (2026-07-10),
  `challenge/email-preview.html` (2026-07-21)
- **Description:** Nothing links to them from any page, the registry, the worker
  or any API. Checked by crawling every `href`/`src` in all HTML and JS plus the
  registry.
- **Why I believe they are unused:** `dashboard-james.html` predates the
  combined dashboard which now serves James. `challenge-plans.html` appears
  superseded by `bible-plans.html`, which the worker does reference.
  `email-preview.html` looks like an admin preview tool that nothing links to.
- **Why it matters:** Only maintenance. They are extra surfaces that can drift
  and confuse the next person.
- **Recommended fix:** Confirm with Heather that she does not open any of them
  by bookmark, then remove. **Not deleted, per instruction.**
- **Risk of fix:** Low, but a bookmark would 404.
- **Verification:** `scripts/check_site.py` passes after removal.

---

### [LOW-002] 63 `console.log` calls ship in server-side code

- **Severity:** Low
- **Area:** Code quality / logging hygiene
- **Files:** `functions/api/*.js`, `workers/blog-cron/src/index.js`
- **Description:** 63 `console.log`/`console.error` calls in Functions and the
  worker. Most are legitimate error reporting. Some log operational detail.
- **Why it matters:** Cloudflare logs are not public, so this is not a leak by
  itself, but it is worth confirming none logs an email address or token.
- **Recommended fix:** Audit the 63 for personal data; keep error logging.
- **Risk of fix:** Low.

---

### [LOW-003] `import-wordpress-posts.py` still points at the old WordPress site

- **Severity:** Low
- **Files:** `import-wordpress-posts.py:26`
- **Description:** `WORDPRESS_BASE = "https://d9b.09a.myftpupload.com"`. This is
  the old site Heather is not renewing. The script is a one-off importer at the
  repo root, not part of any workflow.
- **Why it matters:** Nothing runs it. It will silently stop working when the
  old hosting lapses, which is fine, but it is the only place a dead domain is
  referenced.
- **Recommended fix:** Move to an `archive/` folder or delete once the import is
  confirmed complete.

---

### [LOW-004] `scripts/convert_manuscript_txt.js` is unreferenced

- **Severity:** Low
- **Files:** `scripts/convert_manuscript_txt.js`
- **Description:** Nothing references it. `convert_manuscript.js` is the one
  CLAUDE.md documents for rebuilding the manuscript.
- **Recommended fix:** Confirm it is superseded, then remove.

---

### [LOW-005] Placeholder comment in a live page

- **Severity:** Low
- **Files:** `built-to-shine.html:428`
- **Description:** `<!-- REPLACE: swap this div with <img
  src="images/built-to-shine-cover.jpg" ...> when the final cover is ready -->`.
  That image does not exist yet, which is correct, the cover is not final.
- **Why it matters:** It is a live reminder sitting in shipped HTML. Harmless,
  but it will be missed when the cover arrives unless someone is looking.
- **Recommended fix:** Move to the to-do list in CLAUDE.md.

---

### [LOW-006] Known issues already documented and still open

- **Severity:** Low
- **Description:** Two items already in CLAUDE.md's to-do list, restated here so
  the audit is complete:
  1. The bottom form on `built-to-shine.html` (`ctaForm`) has no Turnstile
     widget and borrows the hero form's token, which expires after about five
     minutes. Someone who reads the whole page and then signs up at the bottom
     can fail silently.
  2. The ABC signup counter never appears. It fetches `/api/challenge-admin`,
     which needs the admin key, gets a 401 and hides itself.
- **Recommended fix:** As documented.

---

### [INFO-001] 160MB of images, and the largest are served unoptimised

- **Area:** Performance
- **Files:** `books.html`, `images/cover-*.png`
- **Description:** `books.html` loads `cover-fruit.png` (14.0 MB),
  `cover-dude.png` (7.5 MB) and `cover-banana.png` (5.3 MB). Optimised
  `-web.jpg` versions of all three exist in the repo and **are used by nothing**.
- **Why it matters:** That is roughly 27 MB on one page. On a phone on mobile
  data the books page will be slow enough to lose people, and this is the page
  someone lands on to buy a book. This is the single highest-value performance
  fix on the site.
- **Evidence:**
  ```
  cover-fruit    .png used by: ./books.html    -web.jpg used by: none
  cover-dude     .png used by: ./books.html    -web.jpg used by: none
  cover-banana   .png used by: ./books.html    -web.jpg used by: none
  ```
- **Recommended fix:** Point `books.html` at the `-web.jpg` files. Three
  one-line changes.
- **Risk of fix:** Very low. Compare the rendered quality first.
- **Verification after fix:** Page weight drops by about 27 MB.

---

### [INFO-002] No automated tests beyond the guard

- **Area:** Quality
- **Description:** No test directory, no unit tests, no integration tests, no
  end-to-end tests. `scripts/check_site.py` is the only automated verification
  and it checks structure and syntax, not behaviour.
- **Why it matters:** It would not have caught the 3-month completion bug, which
  was valid, consistent code that was simply wrong. Behaviour is verified by
  Heather clicking things.
- **Recommended fix:** A small set of pure-function tests would cover the
  highest-risk logic: day computation from a start date, completion thresholds
  per track, and the launch-date rules. Those are the calculations where an
  off-by-one reaches every reader at once.

---

### [INFO-003] No dependency management at the root

- **Area:** Deployment
- **Description:** No root `package.json` or lockfile. This is a deliberate and
  correct choice for a no-build static site: there is nothing to install and
  nothing to go out of date. Recorded so it is not mistaken for an omission.

---

### [INFO-004] Tables are created on first use, not migrated

- **Area:** Database
- **Description:** 44 tables, created by `CREATE TABLE IF NOT EXISTS` at the
  point of first use. Two SQL files exist in `scripts/migrations/` but the
  pattern is not used consistently.
- **Why it matters:** It works, and it means a new feature cannot fail on a
  missing table. The cost is that no single file describes the schema, so the
  only way to know the shape of a table is to find the endpoint that creates it.
  Several endpoints also run `ALTER TABLE ... ADD COLUMN` inside a try/catch on
  every request, which is a no-op after the first but is still a statement per
  call.
- **Recommended fix:** None urgent. A generated schema dump committed to the
  repo would help the next person.

---

### [INFO-005] One-time task markers accumulate

- **Area:** Maintenance
- **Description:** 23 one-time task markers in `apology_log`, a table whose name
  is historical. They are never removed, which is deliberate: the list is the
  history of every one-time task run.
- **Why it matters:** Nothing, today. Noted because the table name actively
  misleads: it is the one-time task ledger, not a log of apologies.

---

## Broken Links and Routes

**2,897 internal links checked. Zero broken.**

| Reported by crawler | Verdict |
| --- | --- |
| `built-to-shine.html` → `images/built-to-shine-cover.jpg` | **False positive.** Inside an HTML comment. See LOW-005 |
| `favorites.html` → `/api/track` | **False positive.** An API route, not a file. `functions/api/track.js` exists |
| `admin.html`, `challenge.html`, `challenge/dashboard.html` fragments | **False positives.** JavaScript template strings, not literal URLs |

**External hosts referenced:** heatherlynwilson.com (420), facebook.com (264),
fonts.googleapis.com (226), amazon.com (212), instagram.com (195),
googletagmanager.com (99), challenges.cloudflare.com (97), givesendgo.com (85),
api.brevo.com (57), vimeo (24), api.linkedin.com (5), api.x.com (4).
**External links were not fetched** (NOT VERIFIED, requires outbound requests).

**No hardcoded localhost, staging, ngrok, `.vercel.app` or `.pages.dev` URLs in
any shipped file.** One reference to the old WordPress domain exists in an
unshipped script (LOW-003).

---

## Challenge-Specific Findings

### Bible Reading Challenge (`july-2026`)
Seven tracks, all content files correct. **HIGH-002** applies: switching plan
carries check-ins. **HIGH-001** may target this challenge specifically. The
`full-bible` track serves two different plans by start date (readers from
2026-07-29 get `full-bible-v2`), which is deliberate and now recorded in the
registry. Completion correctly requires 90 days on the 3-month tracks.

### One Book Deep: James (`august-james-2026`)
No issues found. Content 31/31, contiguous. Journal, certificate and completion
email all wired.

### 31 Days of Living Hope (`obd-first-peter`)
**HIGH-003**: no dashboard view. Everything else is wired and verified:
signup chain, official start 2027-02-01, welcome email, daily send branch,
follow-up maps, completion email, certificate, hub, nav. Launch-date behaviour
tested against eight dates.

### Hide It In Your Heart (`september-beatitudes-2026`)
No issues found. Four translations share one content plan, which is correct.
Per-translation scripture credits present on screen and on all three printables.

### Around the Table, Give Thanks, God With Us
No issues found. Content files correct. All three are pre-launch, so signups are
held to the 1st, which the signup API does correctly.

### ABC Bible Memory (`abc-memory-2027`)
**MED-004** (two numbers for length). ABC is the one challenge that does not use
`challenge_checkins`; it tracks per-letter status in `abc_progress`. That is
now handled consistently in the completion API, the login API and the home card,
all fixed this week. The 26 content entries against 56 calendar days is correct:
21 verses, 4 reviews, 1 celebration.

---

## Email Audit

**How it works.** `blog-publish-cron` fires at 10:05 UTC (6:05am ET). For each
signup it computes a personal day from that reader's own start date, looks up
that day's content (D1 `challenge_emails` first, packaged JSON as fallback), and
sends via Brevo. Readers with no check-in for 7+ days drop to a Monday summary;
the first 7 days are always daily.

**Verified correct:**
- Day computation is consistent: `Math.floor(diffMs / 86400000) + 1` in all
  eight places that compute it
- Content lookup falls back safely when D1 has no rows
- Per-challenge opt-out respected (`challenge_email_optouts`)
- 3-month tracks correctly send weekly, not daily
- ABC correctly sends only on letter days
- Completion emails are deduplicated by `challenge_completion_emails`
- Nudges and streak savers are deduplicated by `nudge_log`

**Issues:** MED-001 (no dedup on the main daily send), HIGH-001 (possible second
sender), MED-003 (forgeable engagement signal, which feeds the daily-vs-weekly
decision).

**Could the wrong day's email be sent?** Not from the day calculation, which is
consistent everywhere. The realistic wrong-content risk is HIGH-001: a second
worker with frozen content sending alongside the live one.

**NOT VERIFIED:** actual delivery, actual rendering in a mail client, Brevo
quota headroom, and whether this morning's 6:05am send went out correctly.
`diag_log` only records one-time tasks and social failures; its newest row is
from 2026-08-18, so it says nothing about daily sends.

---

## Database / Data Audit

44 tables. Key constraints confirmed by reading the `CREATE TABLE` statements:

| Table | Key | Note |
| --- | --- | --- |
| `challenge_signups` | `UNIQUE(email, challenge)` | One signup per challenge. **Track is not part of the key**, which is the root of HIGH-002 |
| `challenge_checkins` | `UNIQUE(email, day, challenge)` | Same, and why plans share progress |
| `challenge_completions` | append-only | Written by Start over |
| `abc_progress` | per letter | ABC does not use check-ins |
| `comment_hearts` | `UNIQUE(comment_id, visitor)` | Correct pattern |
| `post_likes`, `truth_votes` | counter only | MED-002 |

**Reader isolation:** every reader-scoped endpoint verifies an HMAC of the
email before returning data, so User A cannot read User B's rows by changing the
email parameter without also forging the token. Spot-checked
`challenge-journal`, `challenge-login`, `group-dashboard`, `manuscript-notes`.

**Timezone:** consistently `America/New_York` via
`toLocaleDateString('en-CA', {timeZone: 'America/New_York'})`. `nowEastern()`
carries a comment explaining the iOS Safari bug that made an earlier approach
return Invalid Date. Daylight saving is handled by the browser and by Cloudflare,
not by hand. **NOT VERIFIED across a DST boundary.**

**NOT VERIFIED:** row counts, duplicate rows, orphaned rows, query performance,
N+1 behaviour under load. All require D1 access.

---

## Mobile / Responsive Audit

**NOT VERIFIED.** No browser available. What can be said from the code:

- Every page carries `<meta name="viewport" content="width=device-width,
  initial-scale=1.0">`
- The nav collapses to `.main-nav.open` at 768px, one implementation shared by
  all pages, so the recent nav simplification applies to mobile identically
- 99 files use `aria-label`, including the menu button
- The dashboard uses `clamp()` and percentage widths rather than fixed pixels in
  most places

**Recommended before launch:** open the hub, the dashboard home, one challenge
view and the books page at 390px wide. The books page is the one I would expect
trouble on, because of INFO-001.

---

## Accessibility Audit

**Verified:**
- **0 real images missing alt text.** The 73 initially flagged are Facebook
  tracking pixels and JavaScript template strings
- All 110 pages with content have an `<h1>`
- `aria-label` used on 99 files, including icon-only buttons

**NOT VERIFIED:** keyboard navigation, focus order, focus traps in the modals
(the ABC card sheet and the completion celebration both use overlays), screen
reader behaviour, colour contrast. These need a browser and, ideally, a screen
reader.

**Worth checking specifically:** the ABC card bottom sheet and the completion
overlay. Both are custom modals, and custom modals are where focus traps and
missing escape handling usually live.

---

## Performance Audit

**Real problems:**
1. **INFO-001**, the books page at roughly 27 MB. This is the only finding I
   would call a genuine performance problem.

**Theoretical, and probably not worth acting on:**
- `challenge/registry.json` is 30 KB and fetched by the dashboard, the hub and
  the certificate. It is small and cacheable.
- The dashboard now loads eight files instead of one. Over HTTP/2 this is
  multiplexed and the total bytes went down, not up, because the CSS is now
  separately cacheable.
- `dashboard.html` is 6,540 lines, down from 11,853 this week.

**NOT VERIFIED:** real load times, Core Web Vitals, cache hit rates.

---

## Security Audit

**Passed:**
- No secrets committed. Scanned for AWS keys, Stripe keys, Brevo keys, GitHub
  tokens and PEM private keys
- All 20 admin endpoints check `ADMIN_KEY`
- Reader endpoints verify an HMAC token; no reader can read another's data by
  changing a parameter
- Turnstile on all public-facing forms, 16 widgets, all using the same site key
- `/api/diag` is public by design and the code comments warn against putting
  personal data in it; spot-checked, it carries counts and status strings only

**Findings:** MED-002 (unbounded counters), MED-003 (unauthenticated webhook),
MED-005 (permissive CORS).

**Not attempted:** any destructive testing, any attempt to access data, any
attempt to exploit. Per instruction.

**NOT VERIFIED:** whether the Cloudflare account has 2FA, whether secrets in the
Workers environment match what the code expects, whether `ADMIN_KEY` is strong.

---

## Dead / Unused / Legacy Code

Nothing below has been deleted.

| Item | Why I believe it is unused | Confidence |
| --- | --- | --- |
| `workers/challenge-emails/` | No workflow deploys it, referenced nowhere, superseded by `blog-cron`. **But see HIGH-001: it may still be live on Cloudflare** | High that it is unused in the repo; **unknown** whether deployed |
| `challenge-plans.html` | No inbound link from any page, the registry, the worker or any API. Superseded by `bible-plans.html` | High |
| `challenge/dashboard-james.html` | No inbound link. Predates the combined dashboard | High |
| `challenge/email-preview.html` | No inbound link. Admin preview tool | Medium, Heather may open it directly |
| `scripts/convert_manuscript_txt.js` | Unreferenced; `convert_manuscript.js` is the documented one | High |
| `import-wordpress-posts.py` | One-off importer pointing at the old WordPress site | High |
| 2 files in `scripts/migrations/` | The codebase creates tables inline instead | Medium |

---

## Environment and Deployment Audit

**Deployment:** two manual workflows. `cloudflare-deploy.yml` publishes Pages
and Functions. `worker-deploy.yml` publishes `blog-publish-cron` only.
Cloudflare's own GitHub auto-deploy is broken and documented as such.

**A change to `workers/` does nothing until the worker workflow is run.** This
is the easiest mistake to make on this repo.

**Automated checks:** `check.yml` runs on every push and pull request. It is the
only non-manual workflow. Eleven workflows total.

**Environment variables:** eleven referenced, all by name in the table above.
**NOT VERIFIED** that every one is actually set in both the Pages and Worker
environments. They are separate. A missing `BREVO_API_KEY` in the worker would
silently skip sending; the code checks for it and logs rather than throwing.

**Token expiry, already documented and worth repeating:**
- `FB_PAGE_TOKEN` expires around **25 September 2026**, ten days away
- `LINKEDIN_ACCESS_TOKEN` expires around **13 October 2026**
- LinkedIn API version `202606` sunsets around June 2027

---

## Recommended Fix Order

### Fix immediately
1. **HIGH-001** — find out whether the `challenge-emails` worker is deployed.
   One command. Everything else about it depends on the answer.

### Fix before the next challenge launch
2. **HIGH-003** — build the 1 Peter dashboard view. Signups are open now.
3. **HIGH-002** — stop Switch plan carrying check-ins, at minimum by pointing
   finished readers at Start over.
4. **FB token** — expires in ten days. Not a bug, but it will stop social
   posting when it lapses.
5. **MED-001** — add a dedup guard to the daily send.

### Fix soon
6. **INFO-001** — point `books.html` at the `-web.jpg` covers. Biggest
   user-visible win on the list for the least work.
7. **MED-003** — restrict the Brevo webhook.
8. **MED-002** — dedup likes and votes.
9. **LOW-006** — the Built to Shine bottom form captcha.

### Cleanup
10. **MED-005** — tighten CORS on reader-data endpoints.
11. **LOW-001, LOW-003, LOW-004** — remove dead files after confirming.
12. **LOW-002** — audit the 63 console statements for personal data.
13. **INFO-002** — add tests for day computation and completion thresholds.

---

## Final Production Readiness Checklist

Before the next challenge launch:

- [ ] `npx wrangler deployments list --name challenge-emails` — confirm it is
      not deployed, or delete it (HIGH-001)
- [ ] 1 Peter dashboard view exists and renders (HIGH-003)
- [ ] Switch plan no longer carries check-ins (HIGH-002)
- [ ] Daily send has a dedup guard (MED-001)
- [ ] `FB_PAGE_TOKEN` renewed (expires ~25 Sept 2026)
- [ ] `python3 scripts/check_site.py` passes
- [ ] `python3 scripts/check_registry.py` passes
- [ ] CI green on the latest push
- [ ] Pages deployed **and** worker deployed, both confirmed by run status
- [ ] Open the hub at phone width and confirm all sections render
- [ ] Open the dashboard, check one active challenge end to end: day grid,
      check-in, journal save
- [ ] Sign up a test address for the launching challenge and confirm the welcome
      email arrives with the right date
- [ ] Confirm the first daily email arrives on day one at 6:05am ET
- [ ] Check Brevo quota headroom for the expected list size
- [ ] Books page loads acceptably on mobile data (INFO-001)

---

## Final Pass

After completing the sections above I re-checked the repository for anything
missed. That pass found:

- **HIGH-001**, the second worker. Found by noticing an unfamiliar path in a
  search for day calculations, not by looking for it. It is the most important
  finding in this audit and it was nearly missed.
- **MED-004**, ABC's two length numbers, found while cross-checking the registry.
- **A whole-codebase call-graph check on the dashboard split.** After moving
  182 functions into seven files this week, I parsed the dashboard's inline
  script plus all seven extracted files as one program and compared every
  function called against every function defined. **Nothing is called that is
  not defined**, and there are **no duplicate function names across the seven
  files**. The eleven names the first run flagged were browser globals
  (`requestAnimationFrame`, `clearInterval`, `isFinite`) and local function
  expressions (`didDay`, `updateCount`, `paint`, `scratch`, `cleanup`, and
  others), each confirmed defined with `var`. This is the strongest evidence
  available from here that the split did not break a call, short of clicking
  through the dashboard.
- The orphan list needed correcting twice: my first pass wrongly flagged every
  challenge signup page as orphaned, because since the nav simplification their
  only inbound link is `registry.json`, which my filter excluded. The corrected
  crawl is what the report uses. Worth recording because it is exactly the kind
  of false conclusion an audit can produce.

**Sections where I could not do what was asked**, restated plainly: mobile and
responsive rendering, accessibility beyond static checks, real performance
numbers, database contents, live email delivery, and every user journey that
requires logging in. Those are marked NOT VERIFIED throughout and are not
covered by anything else in this document.
