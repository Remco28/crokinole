# Re-pin the cosmetic manifest after approved UI changes. Usage: repin.py "<boundary note>"
import json, hashlib, re, sys, os
os.chdir('/home/frank/Projects/crokinole')
sha = lambda b: hashlib.sha256(b).hexdigest()
mp = 'docs/disc-design-approved.json'
m = json.load(open(mp))
for p in m['cosmeticSourceHashes']:
    m['cosmeticSourceHashes'][p] = sha(open(p, 'rb').read())
if len(sys.argv) > 1: m['boundary'] += ' ' + sys.argv[1]
text = json.dumps(m, indent=2) + '\n'
open(mp, 'w').write(text)
sp = 'scripts/physics-integrated-equivalence.mjs'
s = open(sp).read()
s, n = re.subn(r"(assert\.equal\(sha\(text\), ')[0-9a-f]{64}(', 'Reviewed cosmetic manifest must not drift'\))", lambda x: x.group(1) + sha(text.encode()) + x.group(2), s)
assert n == 1
open(sp, 'w').write(s)
print('repinned', sha(text.encode()))
