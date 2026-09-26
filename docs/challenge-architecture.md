# Splitting the challenges apart

Agreed September 2026. Written down so the reasoning survives.

## What is wrong now

The seven Bible reading plans are one challenge wearing seven labels. Two
database constraints decide it:

```
challenge_signups   UNIQUE(email, challenge)
challenge_checkins  UNIQUE(email, day, challenge)
```

The track is in neither. So:

- **One plan at a time.** One signup row per challenge means you cannot read
  the 3-month chronological plan alongside the one-month New Testament.
- **You can finish it once.** Complete the full Bible in 31 days and the
  Completed list says "Bible Reading Challenge". Do chronological next and
  there is nowhere for it to go, so you hit Start over and the first one is
  filed into history.
- **Switching a plan carries your ticks with it.** `challenge-switchplan`
  only updates the track column. Twenty days into the New Testament, switch
  to chronological, and you are on day 20 of chronological with twenty days
  marked that you never read.

One Book Deep would have inherited all of this the moment it held a second
book. James and 1 Peter as tracks would have meant you cannot read both,
finishing James and starting 1 Peter archives James, and Completed shows One
Book Deep once rather than each book.

**That did not happen, because 1 Peter shipped the way this document argues
for.** It went in as its own challenge id, `obd-first-peter`, in the
`one-book-deep` family, not as a second track on the James challenge. So
James and 1 Peter can be read at once, each finishes separately, and the hub
groups them under one heading. The approach below is not a proposal any more
on the One Book Deep side. It has been done once and it worked. What remains
is the seven Bible reading plans.

## Where we are going

Each plan becomes its own challenge with its own id, signup, check-ins,
completion and certificate. A `family` field groups them for display, so the
hub still shows one Bible Reading Challenge card and one One Book Deep card
that open into the options. Separate underneath, grouped on the surface.

```
family: bible          family: one-book-deep
  bible-full-31          obd-james
  bible-nt-31            obd-first-peter
  bible-chrono-31        obd-second-peter
  bible-full-90
  bible-chrono-90
  bible-ot-90
  bible-nt-90
```

## Additive, not a cutover

Nothing moves. New ids are added alongside `july-2026` and
`august-james-2026`. New signups land on the new ids. Everyone currently
reading stays where they are and finishes untouched. The old ids drain on
their own over a few months.

This matters because there is then no risky window to schedule, nothing to
roll back, and no chance of a half-migrated reader losing progress they
earned.

## Do the registry first

A new challenge still has to be registered by hand in a long list of places
across four runtimes:

| Where | What |
| --- | --- |
| `workers/blog-cron/src/index.js` | `CHALLENGE_CONFIGS`, `FOLLOWUP_TOTALS`, `FOLLOWUP_OFFICIALS`, `CHALLENGE_LABELS`, `TRACK_LABELS`, the per-challenge send branch, `DRIP` and `DRIP_PLAN_MAP` |
| `functions/api/challenge-signup.js` | track chain, invite slug chain, welcome email branch, `OFFICIAL_STARTS` |
| `functions/api/challenge-complete.js` | `CHALLENGE_TOTALS`, `CHALLENGE_META` |
| `challenge/dashboard.html` | `challengeMeta`, `CHALLENGE_NAMES`, `RESTART_MAP`, the view, and `OBD_BOOKS` for a One Book Deep book |
| `challenge/certificate.html` | the `isX` branch and its config |
| `admin-emails.html` | `PLAN_ORDER` and `PLAN_LABELS`, or Heather cannot see the emails |
| `challenge/email-seed.json` | the packaged emails, or there is nothing to load into the editor |

Two rows came off this list and two went on, so it has not got shorter.

Off: `challenge.html` no longer keeps a `HUB_CHALLENGES` list, and the nav
dropdown across ~98 files is gone. Both now come from `challenge/registry.json`,
which is the first piece of this plan actually built. That is the shape the rest
of the table should end up in.

On: the two email editor rows. Those were never written down, and in September
2026 they cost exactly what this document predicts. 1 Peter shipped with 31
working emails that sent correctly to readers, and Heather opened the editor to
find no 1 Peter tab at all, because both hand-kept lists had been missed.
`check_email_editor` in `check_site.py` now fails the build on that particular
gap, which is a patch over the symptom, not the registry.

Ten new challenges through that by hand is about 120 opportunities to repeat
the bugs found in September: ABC finishers getting no completion email, the
3-month tracks passing a 31-day check, Heather's digest printing raw
database ids, ABC missing from the hub and the nav, and 1 Peter's emails
invisible in the editor.

So the registry comes first. One file describes every challenge: id, family,
name, subtitle, total days, official start (or none for evergreen), content
plan, signup page, certificate wording, completion email. Everything else
reads from it.

The three runtimes reach it differently:

- **Worker and Pages Functions** import it at build time.
- **Browser** (`dashboard.html`, `certificate.html`) fetches
  `/challenge/registry.json`, with a bundled copy as the fallback, the same
  pattern the email content already uses with D1.

After that a new challenge is one registry entry plus its content file.

## Order of work

Status as of 26 September 2026. Steps 1 to 3 are done, 4 and 5 are not.

1. **Registry. Built, and partly wired.** `challenge/registry.json` exists and
   carries all eight challenges with their family, name, official start, hash,
   signup page and invite path. `scripts/check_registry.py` runs on every push
   and fails the build if it drifts from the code. But it is not yet the single
   source it is meant to be: the hub reads from it, and the nav no longer needs
   a list at all, while the worker, the signup API, the completion API, the
   dashboard, the certificate and the email editor all still keep their own
   copies. The table above is the remaining work.
2. **Family grouping. Done on the hub.** `challenge.html` groups by family in
   the order the families declare, and pulls anything whose launch date has not
   arrived into Coming Soon. Eight challenges do not show as eight flat cards.
3. **1 Peter as its own challenge. Done, and it proved the system.** It is
   `obd-first-peter` in the `one-book-deep` family, sharing the dashboard code
   with James through `OBD_BOOKS`. Content lives in
   `challenge/emails-first-peter.json` and is now also in the email seed so it
   can be edited. Launches 1 February 2027.
4. **Split the Bible plans.** Not started. Seven new ids for new signups only.
   `july-2026` keeps serving everyone already on it. This is the whole reason
   the document exists and it is the piece still outstanding.
5. **Backfill history (optional, and with Heather at a wrangler prompt).**
   Re-file past completions under the specific plan rather than the generic
   Bible Reading Challenge. Cosmetic, genuinely a migration, wants a backup
   first and a query straight after. Not something to run blind from a cron
   tick.

## Why not at night

Claude cannot reach D1 from the sandbox: no wrangler auth, no admin key. The
only way in is a one-time task in the cron worker, which runs on the next
tick and reports to `diag_log`. Crons are `5 10 * * *`, `5 12 * * *` and
`5,23,30,45` on hours 1, 2, 12, 15, 20, 22, 23 UTC, so a task written late
evening Eastern first executes in the same tick that sends the 6:05am emails,
with no way to see the result for hours. Fewer readers are awake at night,
which is a real argument, but it is not the constraint that matters here.

Steps 1 to 4 move nothing, so they do not need a quiet hour at all.
