"""Count FSA establishments per normalised business name and shortlist the names not already known to the repo.

python3 -I count.py <known.json> <outdir>
Writes <outdir>/counts.csv (every name with 3+ GB outlets in a food-service type) and <outdir>/shortlist.csv
(the same, minus names already known, generic names and institutions)."""
import collections, csv, json, os, re, sys, unicodedata

KNOWN = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# FSA business types the public orders food from (BusinessTypeID): restaurant/cafe/canteen, takeaway/sandwich shop,
# pub/bar/nightclub, mobile caterer, other catering premises, hotel/B&B. Bakeries are usually filed as "Retailers - other",
# so those count only when the name itself says bakery/café/coffee/etc.
FOOD_TYPES = {'1': 'restaurant', '7844': 'takeaway', '7843': 'pub', '7846': 'mobile', '7841': 'other_catering', '7842': 'hotel'}
BAKERY_WORDS = re.compile(r'\b(bake|baker|bakers|bakery|bakehouse|patisserie|pasty|pasties|donuts?|doughnuts?|cafe|coffee|deli|'
                          r'sandwich|sandwiches|pies?|cookies?|crepes?|waffles?|juice|bubble|tea)\b')
LEGAL = {'ltd', 'limited', 'plc', 'llp', 'inc', 'uk', 'lp', 'llc'}


def ascii_lower(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()


def norm_simple(s):
    """Same normalisation as known.py, so stems can be compared with the known names."""
    s = ascii_lower(s).replace('&', ' and ').replace('+', ' and ')
    s = re.sub(r"['`]", '', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    s = re.sub(r'\b(ltd|limited|plc|llp|uk|the|co|company|group|restaurants?|cafes?)\b', ' ', s)
    return ' '.join(s.split())


def stem(name, address_tokens):
    s = ascii_lower(name).replace('’', "'")
    m = re.search(r'\b(?:t/a|t/as|ta|trading as|t\\a)\b\s*(.+)$', s)
    if m and len(m.group(1).strip()) > 2:
        s = m.group(1)
    s = re.sub(r'\([^)]*\)|\[[^\]]*\]', ' ', s)
    s = re.split(r'\s[-–—|@]\s|\s@|@\s|:|,|\s-\w|\s–', s)[0]
    s = s.replace('&', ' and ').replace('+', ' and ')
    s = re.sub(r"['`]", '', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    toks = [t for t in s.split() if t not in LEGAL]
    while toks and toks[0] == 'the':
        toks = toks[1:]
    # trailing branch suffixes: town/street words from this outlet's own address, numbers, "branch"/"store"/"unit"
    while len(toks) > 1 and (toks[-1] in address_tokens or toks[-1].isdigit() or toks[-1] in {'branch', 'store', 'unit', 'no', 'shop'}):
        toks = toks[:-1]
    return ' '.join(toks)


GENERIC = set('''
red lion royal oak crown white hart swan black bull horse horses plough kings king queens queen head heads arms new old inn inns tavern
bar bars pub chinese takeaway take away fish chips chip chippy shop kebab kebabs pizza pizzas pizzeria cafe caffe coffee house garden golden dragon
china happy jade star express tandoori indian spice balti grill grills chicken fried kitchen bakery bakers snack snacks sandwich sandwiches canteen
restaurant hotel the and of a at on in bay palace city dynasty panda wok noodle noodles sushi thai curry peri piri burger burgers bistro
deli diner fast food foods hut station rose bell anchor ship plume feathers george dragon fox hounds hound green man star moon sun
wheatsheaf railway victoria albert prince princess cross keys globe angel bear eagle cock hart lamb flag rising stag castle chequers
tea room rooms tearoom tearooms corner village hall community kiosk van catering caterers services events mobile cuisine cottage
lounge sports social club ice cream creams cakes cake express plaice fryer friar tuck codfather codfathers fishery fisheries supper
spices garden gardens east west north south central wine wines market street lane road hill park view bridge mill farm house
tikka masala kebabish bites bite planet world best taste tasty tastes uk british english food hot kitchen kitchens oven ovens stone
fired wood wood-fired pasta italian grillhouse steak steakhouse lodge cafe-bar coffeehouse espresso juice bubble boba milk shake shakes
sweet sweets dessert desserts waffle waffles crepe crepes donut donuts doughnut pancake pancakes greek turkish mediterranean lebanese
persian afghan kurdish cantonese peking hong kong shanghai sichuan szechuan mandarin oriental asian asia japanese korean vietnamese
mexican spanish portuguese american caribbean african jamaican nigerian polish italia bella mama mamma nonna papa luigi mario
golden gate lucky fortune house's family friends one two three four five 1 2 3 4 5 24 7 24-7 express's
prince wales bulls nags horseshoes horseshoe hare butchers coach barley mow carpenters shoulder mutton travellers traveller rest
bricklayers commercial cricketers greyhound groom harrow waggon wagon bells halfway sportsman blacksmiths blacksmith bird hand blue
jockey vine vault grapes tree trees elm elms ash yew chestnut beehive volunteer wellington nelson marquis duke duchess earl lord
lady bishop abbey cottage cottages mitre ring rings bowl bowls cup sheaf fleece golden fighting cocks cockerel pheasant partridge
peacock falcon hawk owl ram ox oxen dog dun cow cows bull's boot boat ship's sloop mariners sailor sailors smugglers anchor jolly
farmers farmer miners millers miller weavers masons foresters woodman gardeners plasterers shipwrights brewery brewers brew
tap taphouse alehouse ale house cellar cellars lamb lion lions lambs tigers tiger unicorn griffin wyvern talbot hop pole hops
plume feathers six seven eight nine ten bells half moon rising sun star garter crossed keys junction station hotel inn arms head
pig whistle bugle hunter huntsman hunters hunt fox foxes goat goats sheep stag stags deer hart harts buck white horse hope anchor
spread eagle dragon swan's mermaid neptune trident hall inn's tavern's pied bull black boy boys girl girls feathers kings arms
queens arms railway tavern'''.split())
INSTITUTION = re.compile(r'\b(club|clubs|legion|church|chapel|methodist|baptist|parish|hall|school|schools|primary|academy|college|university|'
                         r'nursery|preschool|pre school|hospital|care|council|association|society|trust|charity|scouts|guides|brownies|'
                         r'rugby|cricket|football|golf|bowls|bowling club|tennis|leisure centre|community|village|ymca|mosque|temple|gurdwara|'
                         r'masonic|freemasons|lodge no|working mens|conservative|labour|liberal|miners|welfare|students union|union bar|'
                         r'prison|hmp|barracks|raf|army|navy|nhs|surgery|pharmacy|chemist|day centre|playgroup|childminder|creche|'
                         r'home|homes|residential|nursing|hospice|camp|holiday park|caravan park|school meals|catering services)\b')

# Contract caterers run staff/school/hospital canteens under the client's name: not chains the public orders from.
CONTRACT = re.compile(r'\b(baxterstorey|baxter storey|aramark|gather and gather|compass|eurest|sodexo|elior|ch and co|wsh|'
                      r'restaurant associates|levy|chartwells|medirest|bm caterers|harbour and jones|thomas franks|fooditude|'
                      r'vacherin|lexington|holroyd howe|caterlink|taylor shaw|accent catering|olive dining|nourish|alliance in partnership|'
                      r'brakes|bidfood|edwards and ward|genuine dining|sv uk|searcys|portico|camden food|cucina|innovate|'
                      r'mitie|iss|engie|amey|serco|interserve|ocs|churchill|atalian|dine contract|blue apple|aspens|'
                      r'principal catering|nicholson catering|absolutely catering|delaware north|centerplate|ssp|wh smith|whsmith)\b')

auth_region = {}
counts = collections.defaultdict(lambda: {'postcodes': set(), 'ids': 0, 'types': collections.Counter(), 'raw': collections.Counter(),
                                          'auths': set(), 'regions': collections.Counter(), 'ni': set()})
n = 0
with open('/tmp/fsa-cache/establishments.tsv', encoding='utf-8') as f:
    for r in csv.DictReader(f, delimiter='\t'):
        n += 1
        t = r['BusinessTypeID']
        name = r['BusinessName']
        if t in FOOD_TYPES:
            kind = FOOD_TYPES[t]
        elif t == '4613' and BAKERY_WORDS.search(ascii_lower(name)):
            kind = 'bakery_retail'
        else:
            continue
        # town words only (address lines 2-4 and the council's name), never words also in line 1 (which often repeats
        # the business's own name, e.g. "Royal Oak")
        addr = ' '.join(r[k] for k in ('AddressLine2', 'AddressLine3', 'AddressLine4', 'LocalAuthorityName'))
        line1 = set(re.sub(r'[^a-z0-9]+', ' ', ascii_lower(r['AddressLine1'])).split())
        address_tokens = set(re.sub(r'[^a-z0-9]+', ' ', ascii_lower(addr)).split()) - line1
        st = stem(name, address_tokens)
        if not st:
            continue
        c = counts[st]
        pc = re.sub(r'\s+', '', r['PostCode'].upper()) or ('id' + r['FHRSID'])
        if r['Region'] == 'Northern Ireland':
            c['ni'].add(pc)
        else:
            c['postcodes'].add(pc)
            c['regions'][r['Region']] += 1
            c['auths'].add(r['LocalAuthorityName'])
        c['ids'] += 1
        c['types'][kind] += 1
        c['raw'][name] += 1

known_names = set(KNOWN['names'])
corpus = KNOWN['corpus']


def known_status(st):
    ns = norm_simple(st)
    if not ns:
        return 'empty'
    if ns in known_names or ns.replace(' ', '') in {k.replace(' ', '') for k in ()}:
        return 'known-name'
    return ''


known_compact = {k.replace(' ', ''): k for k in known_names}
known_first2 = {}
known_first1 = {}
for k in sorted(known_names):
    kt = k.split()
    if len(kt) >= 2 and not all(t in GENERIC for t in kt[:2]):
        known_first2.setdefault(' '.join(kt[:2]), k)
    if kt and len(kt[0]) >= 6 and kt[0] not in GENERIC:
        known_first1.setdefault(kt[0], k)
rows = []
for st, c in counts.items():
    gb = len(c['postcodes'])
    if gb < 3:
        continue
    ns = norm_simple(st)
    status = ''
    if not ns:
        status = 'empty'
    elif ns in known_names or ns.replace(' ', '') in known_compact:
        status = 'known'
    else:
        toks = ns.split()
        # a known name followed by more words (e.g. "costa coffee" for known "costa") or the first words of a known name
        for i in range(len(toks), 0, -1):
            pre = ' '.join(toks[:i])
            if (pre in known_names or pre.replace(' ', '') in known_compact) and len(pre.replace(' ', '')) >= 4:
                status = 'known-prefix:' + pre
                break
        if not status and len(ns) >= 6 and (' ' + ns + ' ') in corpus:
            status = 'mentioned'
        # same first two words as a known name ("david lloyd leisure" ~ known "david lloyd clubs"), or the same distinctive
        # first word ("grosvenor casino" ~ "grosvenor casinos"); such rows are checked by eye before being dropped
        if not status and len(toks) >= 2 and ' '.join(toks[:2]) in known_first2:
            status = 'known-similar:' + known_first2[' '.join(toks[:2])]
        if not status and toks and len(toks[0]) >= 6 and toks[0] not in GENERIC and toks[0] in known_first1:
            kt = known_first1[toks[0]].split()
            # the same first word, and the second words (if any) start alike: "grosvenor casino" ~ "grosvenor casinos"
            if len(toks) == 1 or len(kt) == 1 or toks[1][:4] == kt[1][:4]:
                status = 'known-similar:' + known_first1[toks[0]]
        if not status and len(toks) >= 2 and (' ' + ' '.join(toks[:2]) + ' ') in corpus and not all(t in GENERIC for t in toks[:2]):
            status = 'mentioned-similar'
    generic = all(t in GENERIC or t.isdigit() for t in st.split())
    inst = 'institution' if INSTITUTION.search(st) else 'contract caterer' if CONTRACT.search(st) else ''
    rows.append({'stem': st, 'gb_outlets': gb, 'ni_outlets': len(c['ni']), 'records': c['ids'],
                 'authorities': len(c['auths']), 'regions': len(c['regions']),
                 'types': ' '.join(f'{k}:{v}' for k, v in c['types'].most_common()),
                 'known': status, 'generic': 'yes' if generic else '', 'institution': inst,
                 'top_names': ' | '.join(k for k, _ in c['raw'].most_common(3))})
rows.sort(key=lambda r: (-r['gb_outlets'], r['stem']))
fields = list(rows[0].keys())
with open(os.path.join(OUT, 'counts.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)
short = [r for r in rows if not r['known'] and not r['generic'] and not r['institution']]
with open(os.path.join(OUT, 'shortlist_raw.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(short)
print(n, 'establishments read;', len(counts), 'distinct names;', len(rows), 'with 3+ GB outlets;',
      sum(1 for r in rows if r['known']), 'known;', len(short), 'left after known/generic/institution')
