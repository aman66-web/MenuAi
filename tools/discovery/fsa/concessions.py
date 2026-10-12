"""Names registered at 3+ addresses inside a host (supermarket, department store, station, airport, services, retail park store)."""
import csv, re, collections, json, sys
HOST = re.compile(r'(?i)\b(tesco|sainsbury|asda|morrisons|waitrose|marks (and|&) spencer|m ?& ?s\b|next\b|john lewis|ikea|b ?& ?q|dunelm|the range|primark|tk ?maxx|boots|selfridges|harrods|debenhams|house of fraser|airport|terminal|railway station|station|services|motorway|retail park|shopping centre|westfield|outlet|hospital|university|cinema|odeon|vue|cineworld|garden centre|zoo|stadium)\b')
known = json.load(open('/tmp/fsa-cache/known.json'))
kn = set(known['names'])
counts = collections.defaultdict(lambda: {'pcs': set(), 'hosts': collections.Counter(), 'raw': collections.Counter()})
FOOD = {'1', '7844', '7843', '7846', '7841', '4613'}
for r in csv.DictReader(open('/tmp/fsa-cache/establishments.tsv', encoding='utf-8'), delimiter='\t'):
    if r['BusinessTypeID'] not in FOOD or r['Region'] == 'Northern Ireland':
        continue
    addr = ' '.join(r[k] for k in ('AddressLine1', 'AddressLine2', 'AddressLine3'))
    m = HOST.search(addr + ' ' + r['BusinessName'])
    if not m:
        continue
    name = r['BusinessName'].lower()
    name = re.split(r'\s[-@|]\s|\s@|@|\(|,', name)[0]
    name = re.sub(r"[^a-z0-9&' ]+", ' ', name)
    name = re.sub(r'\b(ltd|limited|plc|uk|the)\b', ' ', name)
    name = ' '.join(name.split())
    hostword = m.group(1).lower()
    if hostword in name:       # the host's own cafe ("Tesco cafe") is not a concession
        continue
    c = counts[name]
    c['pcs'].add(r['PostCode'].replace(' ', '').upper())
    c['hosts'][hostword] += 1
    c['raw'][r['BusinessName']] += 1
rows = sorted(((len(c['pcs']), n, c['hosts'].most_common(3), c['raw'].most_common(2)) for n, c in counts.items() if len(c['pcs']) >= 4), reverse=True)
for g, n, h, raw in rows[:400]:
    flag = 'K' if n.replace("'", '').replace('&', 'and') in kn else ' '
    print(g, flag, n, '|', h, '|', [x for x, _ in raw])
