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

One Book Deep inherits all of this the moment it holds a second book. James
and 1 Peter as tracks would mean you cannot read both, finishing James and
starting 1 Peter archives James, and Completed shows One Book Deep once
rather than each book.

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

A new challenge currently has to be registered by hand in twelve places
across four runtimes:

| Where | What |
| --- | --- |
| `workers/blog-cron/src/index.js` | `CHALLENGE_CONFIGS`, `FOLLOWUP_TOTALS`, `FOLLOWUP_OFFICIALS`, `CHALLENGE_LABELS`, `TRACK_LABELS`, the per-challenge send branch |
| `functions/api/challenge-signup.js` | track chain, invite slug chain, welcome email branch, `OFFICIAL_STARTS` |
| `functions/api/challenge-complete.js` | `CHALLENGE_TOTALS`, `CHALLENGE_META` |
| `challenge/dashboard.html` | `challengeMeta`, `CHALLENGE_NAMES`, `RESTART_MAP`, the view |
| `challenge/certificate.html` | the `isX` branch and its config |
| `challenge.html` | `HUB_CHALLENGES` |
| ~98 HTML files | the nav dropdown |

Ten new challenges through that by hand is about 120 opportunities to repeat
the bugs found in September: ABC finishers getting no completion email, the
3-month tracks passing a 31-day check, Heather's digest printing raw
database ids, ABC missing from the hub and the nav.

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

1. **Registry.** Build it, point all twelve places at it, change no
   behaviour. Verify every existing challenge renders and sends identically.
2. **Family grouping.** Hub and dashboard group by family, so ten challenges
   do not become ten cards.
3. **1 Peter as its own challenge.** First one through the new system, and it
   proves the system. Content is already written and sitting in
   `challenge/emails-first-peter.json`.
4. **Split the Bible plans.** Seven new ids for new signups only.
   `july-2026` keeps serving everyone already on it.
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
