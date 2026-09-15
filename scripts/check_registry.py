#!/usr/bin/env python3
"""Check challenge/registry.json against what the code actually does.

The registry is only worth having if it cannot drift from reality. This reads
the real values back out of the worker, the signup API and the completion API
and fails loudly on any disagreement.

Run it after touching any challenge config:

    python3 scripts/check_registry.py
"""
import json
import re
import sys

ROOT = __file__.rsplit('/scripts/', 1)[0]


def read(path):
    with open(ROOT + '/' + path, encoding='utf-8') as fh:
        return fh.read()


def main():
    reg = json.loads(read('challenge/registry.json'))
    by_id = {c['id']: c for c in reg['challenges']}
    worker = read('workers/blog-cron/src/index.js')
    signup = read('functions/api/challenge-signup.js')
    complete = read('functions/api/challenge-complete.js')

    problems = []

    def check(label, ok, detail=''):
        if not ok:
            problems.append('%s %s' % (label, detail))

    # --- worker CHALLENGE_CONFIGS ---------------------------------------
    block = re.search(r'const CHALLENGE_CONFIGS = \[(.*?)\n\];', worker, re.S).group(1)
    seen = set()
    for line in block.strip().split('\n'):
        line = line.strip()
        if not line.startswith('{'):
            continue
        cid = re.search(r'id: "([a-z0-9-]+)"', line).group(1)
        seen.add(cid)
        c = by_id.get(cid)
        if not c:
            problems.append('worker has challenge %r, registry does not' % cid)
            continue
        total = int(re.search(r'total: (\d+)', line).group(1))
        # The worker total is the default track's calendar length.
        default = next((t for t in c['tracks'] if t.get('default')), c['tracks'][0])
        check('%s:' % cid, total == default['total'],
              'worker total=%s, registry default track total=%s' % (total, default['total']))
        for key in ('hash', 'footer'):
            m = re.search(key + r': "([^"]*)"', line)
            if m:
                check('%s:' % cid, m.group(1) == c[key],
                      '%s worker=%r registry=%r' % (key, m.group(1), c[key]))
        m = re.search(r'official: "(\d{4}-\d{2}-\d{2})"', line)
        wo = m.group(1) if m else None
        if c['official'] is None and wo:
            # Evergreen in the registry but dated in the worker is allowed: the
            # worker uses it only as a fallback start date. Flag it as a note.
            pass
        elif c['official'] != wo:
            problems.append('%s: official worker=%r registry=%r' % (cid, wo, c['official']))

    for cid in by_id:
        check('registry:', cid in seen, 'challenge %r is not in the worker configs' % cid)

    # --- signup API: allowed tracks -------------------------------------
    chain = re.search(r'const track = (.*?);\n', signup, re.S).group(1)
    for cid, c in by_id.items():
        reg_tracks = {t['id'] for t in c['tracks']}
        m = re.search(r'challenge === "%s" \? \(\[([^\]]*)\]\.includes' % re.escape(cid), chain)
        if m:
            code_tracks = set(re.findall(r'"([a-z0-9-]+)"', m.group(1)))
        else:
            m = re.search(r'challenge === "%s" \? "([a-z0-9-]+)"' % re.escape(cid), chain)
            if m:
                code_tracks = {m.group(1)}
            elif cid == 'july-2026':
                m = re.search(r'\(\[([^\]]*)\]\.includes\(body\.track\) \? body\.track : "full-bible"\)', chain)
                code_tracks = set(re.findall(r'"([a-z0-9-]+)"', m.group(1))) | {'full-bible'}
            else:
                problems.append('%s: no track rule found in the signup API' % cid)
                continue
        check('%s:' % cid, code_tracks == reg_tracks,
              'tracks code=%s registry=%s' % (sorted(code_tracks), sorted(reg_tracks)))

    # --- signup API: official starts ------------------------------------
    starts = dict(re.findall(r'"([a-z0-9-]+)": "(\d{4}-\d{2}-\d{2})"',
                             re.search(r'OFFICIAL_STARTS = \{(.*?)\};', signup, re.S).group(1)))
    for cid, c in by_id.items():
        check('%s:' % cid, starts.get(cid) == c['official'],
              'official start signupAPI=%r registry=%r' % (starts.get(cid), c['official']))

    # --- completion totals ----------------------------------------------
    totals = dict((k, int(v)) for k, v in re.findall(
        r'"([a-z0-9-]+)": (\d+)',
        re.search(r'CHALLENGE_TOTALS = \{(.*?)\n\};', complete, re.S).group(1)))
    for cid, c in by_id.items():
        default = next((t for t in c['tracks'] if t.get('default')), c['tracks'][0])
        want = default.get('completionTotal', default['total'])
        check('%s:' % cid, totals.get(cid) == want,
              'completion total completeAPI=%r registry=%r' % (totals.get(cid), want))

    # --- content files exist ---------------------------------------------
    import os
    for cid, c in by_id.items():
        for t in c['tracks']:
            files = [t.get('planFile') or t.get('plan')]
            pb = t.get('planBefore') or {}
            if pb:
                files.append(pb.get('planFile') or pb.get('plan'))
            for plan in filter(None, files):
                path = 'challenge/emails-%s.json' % plan
                check('%s/%s:' % (cid, t['id']), os.path.exists(ROOT + '/' + path),
                      'content file %s is missing' % path)

    if problems:
        print('registry does NOT match the code (%d problems):\n' % len(problems))
        for p in problems:
            print('  ' + p)
        return 1
    print('registry matches the code')
    print('  %d challenges, %d tracks, all content files present'
          % (len(by_id), sum(len(c['tracks']) for c in by_id.values())))
    return 0


if __name__ == '__main__':
    sys.exit(main())
