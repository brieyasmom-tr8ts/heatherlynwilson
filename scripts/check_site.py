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
