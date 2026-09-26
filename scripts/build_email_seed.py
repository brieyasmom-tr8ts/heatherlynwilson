#!/usr/bin/env python3
"""Add any missing plan to challenge/email-seed.json.

Why this exists: email-seed.json is what the "load the packaged emails" button
in /admin-emails.html imports into the challenge_emails table. It was kept by
hand, so when 1 Peter shipped, its 31 emails existed as challenge/emails-first-peter.json
and in the worker, but nothing put them in front of Heather to edit. She opened
the editor and there was no 1 Peter tab at all.

This script only ADDS. A plan already in the seed is left exactly as it is,
because Heather's edits may have been folded back into it and because the seed
is the fallback the site ships with. Run it, read the diff, commit.

    python3 scripts/build_email_seed.py

Drip (pre-launch) emails are not in any packaged JSON file: they live in the
DRIP object in the cron worker. Those are added to the seed by hand, and
scripts/check_site.py fails the build if one is missing.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED_PATH = os.path.join(ROOT, "challenge", "email-seed.json")
CHALLENGE_DIR = os.path.join(ROOT, "challenge")

# The columns challenge_emails actually has. Anything else in a packaged file
# (1 Peter carries a "chapters" key the One Book Deep dashboard never reads) is
# dropped, because the seed has to round-trip through those columns.
FIELDS = [
    "subject", "reading", "title", "focus", "verse_ref", "beatitude",
    "hide_pct", "prayer_focus", "prayer_verse", "practice", "body",
]
INT_FIELDS = {"beatitude", "hide_pct"}

# Files whose rows are not day-keyed email content and so do not belong in the
# editor. ABC is per-letter (letter/cue/mnemonic), not per-day, and none of its
# fields map onto the challenge_emails columns.
SKIP_FILES = {"emails-abc.json"}

# Where the filename does not match the plan key the worker and the dashboard
# actually use. emails-james-prayer.json is the plan called "james".
FILE_PLAN = {"james-prayer": "james"}


def row_for_seed(row):
    out = {"day": row["day"]}
    for f in FIELDS:
        if f in INT_FIELDS:
            v = row.get(f)
            out[f] = None if v in (None, "") else int(v)
        else:
            out[f] = row.get(f, "") or ""
    return out


def main():
    with open(SEED_PATH, encoding="utf-8") as fh:
        seed = json.load(fh)

    added = []
    for name in sorted(os.listdir(CHALLENGE_DIR)):
        m = re.match(r"^emails-([a-z0-9-]+)\.json$", name)
        if not m or name in SKIP_FILES:
            continue
        plan = FILE_PLAN.get(m.group(1), m.group(1))
        if plan in seed:
            continue
        with open(os.path.join(CHALLENGE_DIR, name), encoding="utf-8") as fh:
            rows = json.load(fh)
        if not isinstance(rows, list) or not rows or "day" not in rows[0]:
            print("Skipping %s: not a day-keyed list of emails." % name)
            continue
        seed[plan] = [row_for_seed(r) for r in sorted(rows, key=lambda r: r["day"])]
        added.append("%s (%d emails, from %s)" % (plan, len(seed[plan]), name))

    if not added:
        print("Nothing to add. Every packaged plan is already in the seed.")
        return 0

    with open(SEED_PATH, "w", encoding="utf-8") as fh:
        json.dump(seed, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    for line in added:
        print("Added " + line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
