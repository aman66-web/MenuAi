"""Collect every chain name already known to the repo: published folders, every candidate list, held folders,
and the names in docs/UK_DATA_STATUS.md. Writes known.json = {"names": [...normalised...], "corpus": "..."}."""
import csv, glob, json, os, re, sys, unicodedata
ROOT = sys.argv[1]
EXCLUDE = set(sys.argv[3].split(',')) if len(sys.argv) > 3 else set()  # chains added in this round


def norm(s: str) -> str:
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = s.replace('&', ' and ').replace('+', ' and ')
    s = re.sub(r"['`]", '', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    s = re.sub(r'\b(ltd|limited|plc|llp|uk|the|co|company|group|restaurants?|cafes?)\b', ' ', s)
    return ' '.join(s.split())


names = set()
corpus = []
for p in [q for q in glob.glob(os.path.join(ROOT, 'data/source/*/chain.csv')) if os.path.basename(os.path.dirname(q)) not in EXCLUDE]:
    for r in csv.DictReader(open(p, encoding='utf-8-sig')):
        names.add(norm(r['id'].replace('-', ' ')))
        names.add(norm(r['name']))
        for a in (r.get('aliases') or '').split('|'):
            if a.strip():
                names.add(norm(a))
for d in glob.glob(os.path.join(ROOT, 'data/held-*/*')):
    if os.path.isdir(d):
        names.add(norm(os.path.basename(d).replace('-', ' ')))
cand = glob.glob(os.path.join(ROOT, 'data/candidates/**/*.csv'), recursive=True)
for p in cand:
    with open(p, encoding='utf-8-sig', newline='') as f:
        rd = csv.DictReader(f)
        for r in rd:
            for k in ('id', 'name'):
                v = (r.get(k) or '').strip()
                if v:
                    names.add(norm(v.replace('-', ' ') if k == 'id' else v))
            corpus.append(' '.join(str(v) for v in r.values() if v))
for p in [os.path.join(ROOT, 'docs/UK_DATA_STATUS.md'), os.path.join(ROOT, 'docs/CHAINS_WORK_LIST.md'),
          os.path.join(ROOT, 'docs/PROGRESS.md'), os.path.join(ROOT, 'data/held-downloads/pdf_list.csv'),
          *glob.glob(os.path.join(ROOT, 'data/held-*/README.md')), *glob.glob(os.path.join(ROOT, 'data/chrome-inbox/*.md'))]:
    if os.path.exists(p):
        t = open(p, encoding='utf-8').read()
        corpus.append(t)
        for m in re.finditer(r'\*\*([^*]{2,60})\*\*', t):
            names.add(norm(m.group(1)))
        for m in re.finditer(r'^\| ([^|]{2,60}) \|', t, re.M):
            names.add(norm(m.group(1)))
names.discard('')
json.dump({'names': sorted(names), 'corpus': ' ' + norm(' \n '.join(corpus)) + ' '}, open(sys.argv[2], 'w'))
print(len(names), 'known names;', len(cand), 'candidate files')
