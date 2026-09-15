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
        if page not in hub:
            fail('%s is not in HUB_CHALLENGES in challenge.html. The hub is now the '
                 'only place challenges are listed, so nothing links to it at all' % cid)

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

    notes.append('%d challenges wired into worker, signup, completion and hub'
                 % len(reg['challenges']))


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
