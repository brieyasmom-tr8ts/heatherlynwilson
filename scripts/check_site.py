#!/usr/bin/env python3
"""Catch the mistakes this site actually makes, before they reach a reader.

Every bug found in the September 2026 sweep was the same shape: something was
added in one place and forgotten in the others. ABC shipped with a working
signup page and was missing from the hub, the nav, the completion API, two
label maps and the follow-up email. None of those are hard to spot. They are
just easy to forget, which is what a machine is for.

Run locally:   python3 scripts/check_site.py
CI runs it on every push. A failure fails the build.
"""
import glob
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
problems = []
notes = []


def read(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as fh:
        return fh.read()


def fail(msg):
    problems.append(msg)


# ---------------------------------------------------------------- JSON parses
def check_json():
    n = 0
    for base, _dirs, files in os.walk(ROOT):
        if '.git' in base:
            continue
        for f in files:
            if not f.endswith('.json'):
                continue
            p = os.path.join(base, f)
            try:
                with open(p, encoding='utf-8') as fh:
                    json.load(fh)
                n += 1
            except Exception as e:
                fail('%s is not valid JSON: %s' % (os.path.relpath(p, ROOT), e))
    notes.append('%d JSON files parse' % n)


# ------------------------------------------------------- inline JS is parseable
def check_inline_js():
    pages, blocks = 0, 0
    for base, _dirs, files in os.walk(ROOT):
        if '.git' in base or '/node_modules' in base:
            continue
        for f in files:
            if not f.endswith('.html'):
                continue
            rel = os.path.relpath(os.path.join(base, f), ROOT)
            src = read(rel)
            found = re.findall(r'<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)</script>', src)
            if not found:
                continue
            pages += 1
            for i, code in enumerate(found, 1):
                blocks += 1
                r = subprocess.run(
                    ['node', '-e',
                     'try{new Function(require("fs").readFileSync(0,"utf8"));}'
                     'catch(e){console.error(e.message);process.exit(1);}'],
                    input=code, capture_output=True, text=True)
                if r.returncode != 0:
                    fail('%s: inline script block %d does not parse: %s'
                         % (rel, i, r.stderr.strip().split('\n')[0]))
    notes.append('%d inline script blocks across %d pages parse' % (blocks, pages))


# --------------------------------------------------- server-side JS is parseable
def check_node_files():
    n = 0
    for sub in ('functions', 'workers', 'scripts'):
        d = os.path.join(ROOT, sub)
        if not os.path.isdir(d):
            continue
        for base, _dirs, files in os.walk(d):
            for f in files:
                if not f.endswith('.js'):
                    continue
                p = os.path.join(base, f)
                r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
                n += 1
                if r.returncode != 0:
                    fail('%s does not parse: %s'
                         % (os.path.relpath(p, ROOT), r.stderr.strip().split('\n')[0]))
    notes.append('%d server-side JS files parse' % n)


# ------------------------------------------ every challenge is wired everywhere
def check_challenges_wired():
    reg = json.loads(read('challenge/registry.json'))
    worker = read('workers/blog-cron/src/index.js')
    signup = read('functions/api/challenge-signup.js')
    complete = read('functions/api/challenge-complete.js')
    hub = read('challenge.html')

    # The hub renders from the registry now, so it must not carry its own list.
    if 'HUB_CHALLENGES' in hub:
        fail('challenge.html has a hardcoded HUB_CHALLENGES list again. It renders '
             'from challenge/registry.json; a second list will drift from it')
    if '/challenge/registry.json' not in hub:
        fail('challenge.html no longer fetches the registry, so the hub will be empty')

    for c in reg['challenges']:
        cid = c['id']
        page = c['signupPage']

        if ('id: "%s"' % cid) not in worker:
            fail('%s is not in the worker CHALLENGE_CONFIGS, so it sends no emails' % cid)
        if ('"%s"' % cid) not in signup:
            fail('%s is not named in challenge-signup.js, so signups fall through '
                 'to the July defaults' % cid)
        if ('"%s"' % cid) not in complete:
            fail('%s is not in challenge-complete.js, so finishers get no email '
                 'and no certificate' % cid)
        # The signup page itself must exist.
        if not os.path.exists(os.path.join(ROOT, page)):
            fail('%s points at %s which does not exist' % (cid, page))

        # Content file per track.
        for t in c['tracks']:
            for plan in filter(None, [t.get('planFile') or t.get('plan'),
                                      (t.get('planBefore') or {}).get('plan')]):
                rel = 'challenge/emails-%s.json' % plan
                if not os.path.exists(os.path.join(ROOT, rel)):
                    fail('%s track %s needs %s, which is missing' % (cid, t['id'], rel))

        fam = c.get('family')
        if not fam or fam not in reg.get('families', {}):
            fail('%s has family %r, which is not declared in the registry, so it '
                 'renders in no section on the hub' % (cid, fam))
        for field in ('theme', 'meta', 'name'):
            if not c.get(field):
                fail('%s has no %s, so its hub card renders incomplete' % (cid, field))

    notes.append('%d challenges wired into worker, signup and completion, all in a '
                 'declared family' % len(reg['challenges']))


# ----------------------------------------- the nav points at the hub, once
def check_nav():
    """The Challenge dropdown used to be copied into 99 files.

    That is why ABC was missing from 96 of them and why Give Thanks and God
    With Us were missing from 30 blog posts. It is now a single Challenges
    link to the hub, so the only thing to check is that every page carrying
    the nav has that link and nobody has reintroduced a hardcoded list.
    """
    carriers, missing, stale = 0, [], []
    for base, _dirs, files in os.walk(ROOT):
        if '.git' in base:
            continue
        for f in files:
            if not f.endswith('.html'):
                continue
            rel = os.path.relpath(os.path.join(base, f), ROOT)
            src = read(rel)
            if 'class="main-nav"' not in src:
                continue
            carriers += 1
            if '>Challenges</a>' not in src:
                missing.append(rel)
            for menu in re.findall(r'<div class="nav-dropdown-menu"[^>]*>(.*?)</div>', src):
                if 'challenge-' in menu:
                    stale.append(rel)
                    break
    for rel in missing[:5]:
        fail('%s carries the nav but has no Challenges link to the hub' % rel)
    for rel in stale[:5]:
        fail('%s has a hardcoded challenge list back in its nav; it belongs on the hub' % rel)
    notes.append('nav on %d pages points at the hub, no hardcoded lists' % carriers)


# --------------------------------------------- registry agrees with the code
def check_publisher_template():
    """New blog posts must carry the Challenges link, not an old hardcoded list."""
    tpl = read('scripts/publish_queue.py')
    if '>Challenges</a>' not in tpl:
        fail('scripts/publish_queue.py builds new blog posts without a Challenges '
             'link, so every new post loses the way in')
    for menu in re.findall(r'<div class="nav-dropdown-menu"[^>]*>(.*?)</div>', tpl):
        if 'challenge-' in menu:
            fail('scripts/publish_queue.py has a hardcoded challenge list again; it '
                 'belongs on the hub')
            break
    notes.append('blog publisher template links to the hub')


def check_dashboard_assets():
    """The dashboard's styles and per-challenge code live in their own files now.

    A missing link tag renders the dashboard unstyled and a missing script
    renders it broken, and neither shows up as a syntax error, so the files
    themselves are checked for existence and for being referenced.
    """
    html = read('challenge/dashboard.html')
    for asset in ('dashboard.css', 'js/july.js', 'js/thanks.js', 'js/proverbs.js',
                  'js/gospels.js', 'js/onebookdeep.js', 'js/abc.js', 'js/beatitudes.js'):
        if not os.path.exists(os.path.join(ROOT, 'challenge', asset)):
            fail('challenge/%s is missing, and the dashboard references it' % asset)
        elif asset not in html:
            fail('challenge/dashboard.html no longer references %s, so it loads '
                 'without it' % asset)
    notes.append('dashboard assets present and referenced')


def check_broken_contractions():
    """"I have" only contracts to "I've" before a past participle.

    A pass that applied contractions blindly across the blog broke twelve
    sentences in nine posts, six of them already published: "I've to build an
    altar", "See how many enemies I've.", "Here I'm, here I'm." They read as
    plain errors and nothing caught them, because they are valid HTML and
    valid JSON.
    """
    bad = [
        (re.compile(r"\b(?:I|you|we|they)'ve\s+(?:to|a|an|the|no)\b", re.I),
         '"\'ve" followed by to/a/the/no. "I have to", not "I\'ve to"'),
        (re.compile(r"\b(?:I|you|we|they)'ve\s*[.,!?]", re.I),
         '"\'ve" ending a clause. "how many enemies I have", not "I\'ve"'),
        (re.compile(r"\b(?:I|you|we|they|he|she|it)'m\s*[.,!?]", re.I),
         '"\'m" ending a clause. "Here I am", not "Here I\'m"'),
        (re.compile(r"\bhow (?:I|you|we|they)'(?:m|ve)\b", re.I),
         '"how I\'m" / "how I\'ve". Needs the full verb'),
        (re.compile(r"\b(?:I|you|we|they|he|she|it)'(?:ll|d|re)\s*[.,!?;:]", re.I),
         '"\'ll" / "\'d" / "\'re" ending a clause. "And I will", not "And I\'ll."'),
        (re.compile(r"\b(?:I|you|we|they|he|she|it)'d\s+(?:to|a|an|the|no)\b", re.I),
         '"had" is the main verb here, so it cannot contract'),
        (re.compile(r"\bit's\s+own\b", re.I),
         '"it\'s own" is always wrong. The possessive is "its"'),
    ]

    def look(label, text):
        for rx, why in bad:
            m = rx.search(text)
            if m:
                s = max(0, m.start() - 40)
                fail('%s has a broken contraction: "...%s..." (%s)'
                     % (label, re.sub(r'\s+', ' ', text[s:m.end()+25]).strip(), why))
                return 1
        return 0

    import html as _html
    n = 0
    qdir = os.path.join(ROOT, 'content-queue')
    for name in sorted(os.listdir(qdir)):
        if not name.endswith('.json') or name in ('schedule.json', 'published.json',
                                                  'reserved.json'):
            continue
        with open(os.path.join(qdir, name), encoding='utf-8') as fh:
            post = json.load(fh)
        if not post.get('body_html'):
            continue
        n += 1
        look('content-queue/' + name,
             _html.unescape(re.sub(r'<[^>]+>', ' ', post['body_html'])))

    bdir = os.path.join(ROOT, 'blog')
    if os.path.isdir(bdir):
        for name in sorted(os.listdir(bdir)):
            if not name.endswith('.html'):
                continue
            src = read('blog/' + name)
            m = re.search(r'<article class="post-body">(.*?)</article>', src, re.S)
            if not m:
                continue
            n += 1
            look('blog/' + name, _html.unescape(re.sub(r'<[^>]+>', ' ', m.group(1))))

    notes.append('%d posts free of broken contractions' % n)


def check_reserved_dates():
    """Dates Heather is keeping for herself must stay empty.

    The failure this prevents: she asks for more posts, the next free
    Mon/Wed/Fri slots get filled mechanically, and a week she had plans for
    is quietly taken. Christmas week 2026 is the first of these.
    """
    rel = 'content-queue/reserved.json'
    if not os.path.exists(os.path.join(ROOT, rel)):
        return
    blocks = json.loads(read(rel)).get('reserved', [])
    queued = []
    qdir = os.path.join(ROOT, 'content-queue')
    for name in sorted(os.listdir(qdir)):
        if not name.endswith('.json') or name in ('schedule.json', 'published.json',
                                                  'reserved.json'):
            continue
        with open(os.path.join(qdir, name), encoding='utf-8') as fh:
            post = json.load(fh)
        if post.get('publish_date'):
            queued.append((post['publish_date'], post.get('slug', name)))

    days = 0
    for b in blocks:
        start, end = b['from'], b['to']
        days += 1
        for date, slug in queued:
            if start <= date <= end:
                fail('%s is scheduled for %s, which is reserved (%s to %s). %s'
                     % (slug, date, start, end, b.get('reason', '')))
    notes.append('%d reserved date range(s) respected' % days)


def check_dashboard_script_order():
    """The per-challenge files must load before the dashboard's own script.

    They used to load after it, and the shared day-popup table named
    provGoToDay at the top level of the script above. That threw a
    ReferenceError before those files existed, which killed the rest of the
    block, and every var declared after that point was silently left
    undefined: the ABC constants, the Advent missions and the popup table
    itself. ABC rendered an empty verse card and nobody saw an error.

    Loading them first is only safe while they declare functions and nothing
    else, so both halves are checked here.
    """
    html = read('challenge/dashboard.html')
    tags = [(m.start(), m.group(1)) for m in
            re.finditer(r'<script src="(js/[^"?]+)[^"]*"></script>', html)]
    if not tags:
        fail('challenge/dashboard.html loads no per-challenge js/ files at all')
        return

    # The dashboard's own script is the long inline block, so use the largest.
    inline = max(re.finditer(r'<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)</script>', html),
                 key=lambda m: len(m.group(1)))
    for pos, path in tags:
        if pos > inline.start():
            fail('challenge/dashboard.html loads %s after its own script block. '
                 'Anything that block names at the top level does not exist yet, '
                 'which throws and silently drops every var declared below it' % path)

    for _pos, path in tags:
        full = os.path.join(ROOT, 'challenge', path)
        if not os.path.exists(full):
            continue
        for i, line in enumerate(read('challenge/' + path).split('\n'), 1):
            if not line.strip() or line[0] in ' \t':
                continue
            if line.startswith(('function ', '}', '//', '/*', ' *', '*/')):
                continue
            fail('challenge/%s line %d runs code at the top level (%s). These '
                 'files load before the dashboard script, so they must only '
                 'declare functions' % (path, i, line.strip()[:50]))
            break
    notes.append('%d per-challenge scripts load first and only declare functions'
                 % len(tags))


def check_obd_books():
    """One Book Deep shares one dashboard view between its books.

    Every book needs a full set of wording or the view silently shows the
    previous book's words, which looks fine and is wrong. So each entry in
    OBD_BOOKS must carry every field, and every One Book Deep challenge in the
    registry must have an entry keyed by its track.
    """
    dash = read('challenge/dashboard.html')
    m = re.search(r'var OBD_BOOKS = \{(.*?)\n\};', dash, re.S)
    if not m:
        fail('OBD_BOOKS is gone from the dashboard, so One Book Deep has no book wording')
        return
    block = m.group(1)
    keys = re.findall(r"^\s*'([a-z-]+)':\s*\{", block, re.M)
    fields = ('name', 'range', 'title', 'statLine', 'certHeading', 'readLabel',
              'focusStep', 'focusPlaceholder', 'yesterdayStep', 'yesterdayLead',
              'plan', 'planFile', 'invitePath', 'gatewaySearch', 'youVersion',
              'infoImages', 'prep', 'journalLead', 'pdf')
    for k in keys:
        entry = re.search(r"'%s':\s*\{(.*?)\n  \}" % re.escape(k), block, re.S)
        if not entry:
            continue
        for f in fields:
            if (f + ':') not in entry.group(1):
                fail('OBD_BOOKS entry %r has no %s, so the view would show the '
                     'previous book\'s wording there' % (k, f))

    reg = json.loads(read('challenge/registry.json'))
    for c in reg['challenges']:
        if c.get('family') != 'one-book-deep':
            continue
        for t in c['tracks']:
            if t['id'] not in keys:
                fail('%s track %r is One Book Deep but has no OBD_BOOKS entry, so '
                     'its dashboard would say another book' % (c['id'], t['id']))
    notes.append('One Book Deep: %d book(s) with complete wording' % len(keys))


def check_group_challenge_scope():
    """A group code only counts for its own challenge.

    The signup API looked a group up by id alone before adding someone to it.
    So a Proverbs group code used on the Beatitudes signup put the reader in
    the Proverbs group, and then handed the Proverbs group's start date back to
    be written as their BEATITUDES start date. A reader in the middle of one
    challenge could be thrown forward to a date they never picked, on a
    challenge the group had nothing to do with.

    Every place the signup API adds someone to a group must have looked that
    group up scoped to the challenge being signed up for.
    """
    src = read('functions/api/challenge-signup.js')
    joins = [m.start() for m in re.finditer(r'INSERT OR IGNORE INTO group_members', src)]
    if not joins:
        fail('group scope: no group-join code found in challenge-signup.js, so '
             'this check is not checking anything. Fix the pattern.')
        return
    scoped = 0
    for pos in joins:
        window = src[max(0, pos - 600):pos]
        # Adding the creator to a group that was just built from this signup's
        # own `challenge` needs no lookup: it cannot belong to another one.
        if 'INSERT INTO challenge_groups' in window:
            scoped += 1
            continue
        lookup = re.findall(r'FROM challenge_groups WHERE id = \?[^"]*', window)
        if not lookup:
            fail('group scope: a group join in challenge-signup.js has no group '
                 'lookup before it, so nothing proves the group belongs to this '
                 'challenge.')
            continue
        if 'AND challenge = ?' not in lookup[-1]:
            fail('group scope: challenge-signup.js adds someone to a group it '
                 'looked up by id alone. Scope it with "AND challenge = ?", or '
                 'a group code from one challenge will rewrite the start date '
                 'of another.')
        else:
            scoped += 1
    notes.append('%d of %d group joins in signup are scoped to their own challenge'
                 % (scoped, len(joins)))


def check_div_balance():
    """Every page must have balanced <div> nesting.

    Moving the timeline card in the Beginnings view cut it in half. The regex
    that grabbed it stopped at the first </div>, which closed an element inside
    the card rather than the card, so the heading and the progress bar moved
    down the page while the legend and the markers stayed where they were. The
    dark background belonged to the half that moved, so on a phone the timeline
    appeared as grey text on white with its heading stranded below the fold.

    Nothing in the build noticed. The scripts all parsed, every id still
    existed, and getElementById works perfectly well on broken nesting, so the
    test I wrote to confirm the new order passed too.
    """
    bad = 0
    for path in sorted(glob.glob(os.path.join(ROOT, '*.html'))
                       + glob.glob(os.path.join(ROOT, 'challenge', '*.html'))):
        rel = os.path.relpath(path, ROOT)
        src = read(rel)
        # Ignore anything inside a script or a comment: those carry div strings.
        stripped = re.sub(r'<script\b.*?</script>', '', src, flags=re.S)
        stripped = re.sub(r'<!--.*?-->', '', stripped, flags=re.S)
        depth = 0
        lowest = 0
        for m in re.finditer(r'<div\b|</div\s*>', stripped):
            depth += 1 if m.group(0).startswith('<div') else -1
            lowest = min(lowest, depth)
        if depth != 0:
            fail('%s has %d unclosed <div>%s, so blocks below it render inside '
                 'something they do not belong to'
                 % (rel, abs(depth), '' if abs(depth) == 1 else 's')
                 if depth > 0 else
                 '%s closes %d more </div> than it opens' % (rel, abs(depth)))
            bad += 1
        elif lowest < 0:
            fail('%s closes a </div> before opening one' % rel)
            bad += 1
    if not bad:
        notes.append('div nesting balanced on every page')


def check_timelines():
    """A timeline marker has to land on a real day of its own reading plan.

    The markers live in the registry, not in the email content, on purpose.
    Content fields that are not columns of challenge_emails get dropped the
    moment a plan is seeded into D1, which is how 1 Peter's "chapters" key
    quietly stopped existing. A marker that vanished the first time Heather
    pressed Load current emails would be a nasty one to find.

    So the registry holds them, and this proves they still point at days the
    plan actually has.
    """
    reg = json.loads(read('challenge/registry.json'))
    checked = 0
    for c in reg['challenges']:
        marks = c.get('timeline') or []
        if not marks:
            continue
        default = next((t for t in c['tracks'] if t.get('default')), c['tracks'][0])
        plan_name = default.get('planFile') or default.get('plan')
        rel = 'challenge/emails-%s.json' % plan_name
        if not os.path.exists(os.path.join(ROOT, rel)):
            fail('timeline: %s has markers but %s is missing' % (c['id'], rel))
            continue
        days = {d['day'] for d in json.loads(read(rel))}
        total = default['total']
        for m in marks:
            if m['day'] not in days:
                fail('timeline: %s marker %r is on day %s, which its reading plan '
                     'does not have' % (c['id'], m.get('name'), m['day']))
            if m['day'] > total:
                fail('timeline: %s marker %r is on day %s but the challenge is only '
                     '%s days long, so it can never light up'
                     % (c['id'], m.get('name'), m['day'], total))
            if not m.get('name'):
                fail('timeline: %s has a marker on day %s with no name'
                     % (c['id'], m['day']))
        ordered = [m['day'] for m in marks]
        if ordered != sorted(ordered):
            fail('timeline: %s markers are out of order, so the path would double '
                 'back on itself' % c['id'])
        checked += len(marks)
    if checked:
        notes.append('%d timeline markers land on real reading days' % checked)


def check_countdowns():
    """A countdown must count down to the reader's own start date.

    Melissa's Beatitudes dashboard flashed forever in September 2026. Her own
    start date was still ahead of her, so she was shown the pre-launch screen,
    but the countdown on it was pointed at the September 1st launch date. That
    was already past, so it hit `location.reload()` on sight, which reloaded the
    page, which hit it again. An infinite loop, and the same trap was armed in
    Proverbs (October 1st), Give Thanks (November 1st) and God With Us
    (December 1st), waiting for each launch day to pass.

    Readers have picked their own start dates since August 2026, so a countdown
    that targets a fixed launch date is always wrong and eventually fatal. Every
    countdown has to read a per-reader start variable, and has to reload through
    countdownReload(), which allows one reload per challenge per visit.
    """
    js_dir = os.path.join(ROOT, 'challenge', 'js')
    if not os.path.isdir(js_dir):
        fail('countdowns: challenge/js is missing')
        return

    checked = 0
    for name in sorted(os.listdir(js_dir)):
        if not name.endswith('.js'):
            continue
        src = read(os.path.join('challenge', 'js', name))
        for m in re.finditer(r'\bfunction\s+(\w+)\s*\([^)]*\)\s*\{', src):
            start = src.index('{', m.end() - 1)
            depth, i = 0, start
            while i < len(src):
                if src[i] == '{':
                    depth += 1
                elif src[i] == '}':
                    depth -= 1
                    if depth == 0:
                        break
                i += 1
            body = src[start:i + 1]
            # A countdown is any function that writes the days/hours/mins boxes.
            if 'CdDays' not in body and 'CdHours' not in body:
                continue
            checked += 1
            fn = m.group(1)
            where = '%s:%s' % (name, fn)
            if 'location.reload' in body:
                fail('countdowns: %s calls location.reload directly. Use '
                     'countdownReload(), or a countdown whose target is already '
                     'past will reload the page forever.' % where)
            if 'countdownReload(' not in body:
                fail('countdowns: %s never calls countdownReload(), so it cannot '
                     'move the reader onto the live dashboard when it reaches '
                     'zero.' % where)
            if not re.search(r'\w*[Ss]tartIso\b', body):
                fail('countdowns: %s does not use a per-reader start date. It is '
                     'counting down to a fixed launch date, which is wrong for '
                     'anyone who picked their own start and becomes an infinite '
                     'reload once that launch date passes.' % where)

    if not checked:
        fail('countdowns: found no countdown functions to check, so this check '
             'is not actually checking anything. Fix the pattern.')
    else:
        notes.append('%d countdowns target the reader’s own start date' % checked)


def check_email_editor():
    """Every plan whose emails the worker reads from D1 has to be editable.

    1 Peter shipped with 31 emails in the worker and in emails-first-peter.json,
    and Heather opened /admin-emails.html to find no 1 Peter tab at all. Two
    separate omissions did that: the plan was not in PLAN_ORDER, so no tab was
    drawn, and it was not in email-seed.json, so the load button had nothing to
    put in the challenge_emails table even if she had found a tab.

    The worker is the source of truth here. If it asks D1 for a plan, or would
    send a pre-launch email for one, Heather has to be able to edit it.
    """
    worker = read('workers/blog-cron/src/index.js')
    editor = read('admin-emails.html')
    seed = json.loads(read('challenge/email-seed.json'))

    wanted = set(re.findall(r'loadPlanEmailMap\(env,\s*"([a-z0-9-]+)"', worker))
    drip_block = re.search(r'const DRIP_PLAN_MAP = \{(.*?)\}', worker, re.S)
    if drip_block:
        wanted |= set(re.findall(r':\s*"([a-z0-9-]+)"', drip_block.group(1)))
    if not wanted:
        fail('email editor: could not find any plan keys in the worker, so this '
             'check is not actually checking anything. Fix the patterns.')
        return

    order_m = re.search(r'var PLAN_ORDER = \[(.*?)\];', editor, re.S)
    if not order_m:
        fail('email editor: PLAN_ORDER not found in admin-emails.html')
        return
    order = re.findall(r"'([a-z0-9-]+)'", order_m.group(1))
    labels = set(re.findall(r"^\s*'([a-z0-9-]+)':",
                            re.search(r'var PLAN_LABELS = \{(.*?)\n\};', editor, re.S).group(1),
                            re.M))

    for plan in sorted(wanted):
        if plan not in order:
            fail('email editor: the worker reads plan "%s" but it is not in '
                 'PLAN_ORDER in admin-emails.html, so no tab is drawn for it.' % plan)
        if plan not in seed:
            fail('email editor: plan "%s" is not in challenge/email-seed.json, so '
                 'the load button cannot put it in the challenge_emails table. '
                 'Run python3 scripts/build_email_seed.py.' % plan)

    for plan in order:
        if plan not in labels:
            fail('email editor: PLAN_ORDER lists "%s" but PLAN_LABELS has no name '
                 'for it, so the tab reads as a raw plan key.' % plan)
        if plan not in seed:
            fail('email editor: PLAN_ORDER lists "%s" but challenge/email-seed.json '
                 'has no emails for it, so the load button stays on screen '
                 'forever with nothing to load.' % plan)

    notes.append('email editor covers all %d plans the worker reads' % len(wanted))


def check_registry():
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'check_registry.py')],
                       capture_output=True, text=True)
    if r.returncode != 0:
        for line in r.stdout.strip().split('\n'):
            if line.strip() and not line.startswith('registry does NOT'):
                fail('registry: ' + line.strip())
    else:
        notes.append('registry matches the code')


def main():
    check_json()
    check_inline_js()
    check_node_files()
    check_registry()
    check_challenges_wired()
    check_nav()
    check_publisher_template()
    check_dashboard_assets()
    check_dashboard_script_order()
    check_reserved_dates()
    check_broken_contractions()
    check_obd_books()
    check_email_editor()
    check_countdowns()
    check_timelines()
    check_div_balance()
    check_group_challenge_scope()

    for n in notes:
        print('  ok   ' + n)
    if problems:
        print('\n%d problem%s found:\n' % (len(problems), '' if len(problems) == 1 else 's'))
        for p in problems:
            print('  FAIL ' + p)
        return 1
    print('\nall checks passed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
