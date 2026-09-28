# Beginnings: Genesis, January 2027

Agreed with Heather 27–28 September 2026. Written down before any code, so the
plan survives a session or an account change. If you are a fresh Claude picking
this up, everything you need to build it is here.

## Locked

- **Name:** Beginnings
- **Theme line:** Meet the God who started it
- **Book:** Genesis only. All 50 chapters. Not Exodus. It ends in a coffin in
  Egypt on purpose, and day 31 points forward to Moses as a later challenge.
- **Slot:** January 2027. It was the only gap in a seven month run of monthly
  launches (July to December 2026, then 1 Peter in February 2027).
- **1 Peter does not move.** It stays 1 February 2027. Genesis and 1 Peter are
  different enough shapes that back to back is fine.
- **Length:** 31 days. 30 reading days and a closing day.

## The id, and why it has no date in it

Use `beginnings-genesis`. Not `january-beginnings-2027`.

`october-proverbs-2026` has its month welded into its id, so Proverbs can never
run again without either reusing a name that says October 2026 or building a
whole new challenge. `obd-first-peter` got this right. Beginnings follows
1 Peter's example, so it can run again in a different month and a different
length without being rebuilt.

## Family

Needs a new family, `story`, for reading a book of the Bible straight through.
The existing five do not fit: `bible` is whole-Bible and Testament plans,
`one-book-deep` is reading one short book *every day*, `memory` is
memorisation, `family` is read-together, `seasonal` is tied to a holiday.

The new family is also where Exodus goes when Moses gets his own month.

## The reading plan

Cut at the story's seams, not by chapter count. About 1.7 chapters a day,
roughly ten to fifteen minutes. All 50 chapters, nothing skipped.

| Day | Reading | Title |
| --- | --- | --- |
| 1 | Genesis 1 | In the beginning |
| 2 | Genesis 2 | The garden |
| 3 | Genesis 3 | The fall |
| 4 | Genesis 4 | Cain and Abel |
| 5 | Genesis 5–6 | The long line, and the earth goes wrong |
| 6 | Genesis 7–8 | The flood, and the waters go down |
| 7 | Genesis 9–10 | The rainbow, and the nations |
| 8 | Genesis 11 | Babel, and the line that leads to Abram |
| 9 | Genesis 12–13 | Leave your country |
| 10 | Genesis 14–15 | Count the stars |
| 11 | Genesis 16–17 | Hagar, and the new names |
| 12 | Genesis 18 | Three visitors, and Abraham argues with God |
| 13 | Genesis 19 | Sodom, and Lot |
| 14 | Genesis 20–21 | Isaac laughs |
| 15 | Genesis 22 | The mountain |
| 16 | Genesis 23–24 | Burying Sarah, finding Rebekah |
| 17 | Genesis 25–26 | Two nations, one bowl of stew |
| 18 | Genesis 27–28 | The stolen blessing, and the ladder |
| 19 | Genesis 29–30 | Leah, Rachel, and twelve sons |
| 20 | Genesis 31–32 | Wrestling until daybreak |
| 21 | Genesis 33–34 | Facing Esau, and Dinah |
| 22 | Genesis 35–36 | Back to Bethel |
| 23 | Genesis 37 | The coat, and the pit |
| 24 | Genesis 38 | Judah and Tamar |
| 25 | Genesis 39–40 | Prison, and dreams |
| 26 | Genesis 41 | From the dungeon to the palace |
| 27 | Genesis 42–43 | The brothers come, twice |
| 28 | Genesis 44–45 | I am Joseph |
| 29 | Genesis 46–48 | Down to Egypt, and a blessing |
| 30 | Genesis 49–50 | You meant evil, God meant good |
| 31 | — | The whole timeline, and where Moses walks in |

### Days deliberately left alone

Do not pair these with anything when editing the plan.

- **Day 12, Genesis 18.** Abraham arguing with God over Sodom gets swallowed if
  it shares a day.
- **Day 13, Genesis 19.** Sodom and Lot.
- **Day 15, Genesis 22.** Abraham and Isaac on the mountain.
- **Day 24, Genesis 38.** Judah and Tamar.

Days 13 and 24 are the two chapters that quietly make people stop reading.
They are alone so the morning's note can meet them head on instead of
pretending they are not there.

## The daily thing

**"Who God is."** One line. *What did this show you about Him?*

That is the whole daily action. No reflection questions, no paragraph.

Why this one: Genesis is where God introduces himself, and he does it entirely
through what he does. No law yet, no prophets, no Jesus. So the question the
book already asks its reader is who is this God, and the daily action just makes
her answer it. It also keeps Heather out of devotional territory, which is her
standing rule for challenges: short encouragement plus one simple action, never
a devotional.

It is also the only prompt that survives days 13 and 24. "What is your takeaway"
does not. Asking who God is in Genesis 19 is a fair and serious question a
reader can sit in honestly.

**The payoff:** on day 31 she has the timeline complete and thirty lines she
wrote herself about who God is. That is the certificate moment.

**No new database work.** The One Book Deep journal already saves a
`god_speaking` field alongside the prayer. Beginnings reuses that shape and
asks a different question.

## The timeline

Fourteen markers that fill in as she reads, so the dashboard shows where she is
in a story rather than square 20 of 31. Copy the Advent scratch-off on the
Gospels challenge for the pattern.

| Day | Beat |
| --- | --- |
| 1 | Creation |
| 3 | The fall |
| 6 | The flood |
| 8 | Babel |
| 9 | Abraham called |
| 10 | The promise, count the stars |
| 14 | Isaac born |
| 15 | The mountain |
| 18 | The ladder at Bethel |
| 20 | Jacob becomes Israel |
| 23 | Joseph sold |
| 26 | Joseph raised up |
| 29 | The family comes to Egypt |
| 30 | You meant evil, God meant good |

Open design question: fourteen markers may read better as a path that bends
than as a straight line, so the Abraham stretch and the Joseph stretch feel like
different legs of one journey.

## Still needs Heather

- The **blurb** for the hub card. Draft offered for her to react to, not take:
  *Read Genesis in a month, from the first light to a coffin in Egypt. Every day
  you write one line about who God is, and by the end you have thirty.*
- The **30 daily encouragements**, two or three sentences each. These are hers.
  Claude does not write them. They drop in through `/admin-emails.html` after
  the build, which works for a new challenge now.
- Whether there is a **family track**, given Genesis is the book children
  already half know and Around the Table proved that audience exists.

## Build checklist

The guards in `scripts/check_site.py` fail the build if any of the wiring is
missed, so work through these and let the checks catch what is forgotten.

- [ ] `challenge/registry.json`: the `story` family and the challenge entry
- [ ] `challenge/emails-beginnings.json`: 31 rows, reading and title filled,
      body left for Heather
- [ ] `challenge-beginnings.html` signup page
- [ ] `challenge/dashboard.html`: the view, check-ins, journal, certificate
- [ ] The timeline component
- [ ] `functions/api/challenge-signup.js`: track chain, invite slug, welcome
      email, `OFFICIAL_STARTS`
- [ ] `functions/api/challenge-complete.js`: totals and meta
- [ ] `workers/blog-cron/src/index.js`: config, labels, follow-up totals and
      officials, drip, the send branch
- [ ] `admin-emails.html`: `PLAN_ORDER` and `PLAN_LABELS`
- [ ] `challenge/email-seed.json` via `python3 scripts/build_email_seed.py`
