"""Write data/candidates/fsa/counts.csv and shortlist.csv from count.py's output, with the by-eye review of the shortlist.
python3 -I shortlist.py <outdir of count.py> <repo>/data/candidates/fsa"""
import csv, os, sys
SRC, DST = sys.argv[1], sys.argv[2]

CHAIN = '''yo to go|sushi gourmet|sushi co|mai sushi|urban baristas|bird and blend tea co|bird and blend tea|peri peri original|selekt chicken|
smoke and pepper|wok u like|b kitchen|gourmet coffee bar and kitchen|archies|cha cha chai|geek retreat|mr pretzels|poppins restaurant|poppins|
92 degrees|cupp|cupp bubble tea|howe and co fish and chips|usa chicken|metros fried chicken|freddys chicken and pizza|usa fried chicken|cheatmeals|
crispy dosa|chennai dosa|tgf pizza|craft burger|love churros london|love churros|hagen espresso bar|mak halal|kebabish original|mr rice|marinis|
bunsik|chango empanadas|chai green|belgian waffle company|coffi lab|smoky boys|toros steakhouse|big juicy burgers|safis desserts|badiani|
bbs coffee and muffins|scooperb|ohannes burger|chesters chicken|chick king|chunky chicken|tennessee express|slamburger|sushi handroll|
super whippy ice cream|super whippy|mister softee|mr softee|cafe2u|perfect chicken|rvs cafe'''
# chains under 10 outlets, picked out by eye but not triaged (small chains rarely publish figures; England's calorie-labelling law
# covers businesses with 250+ employees)
SMALL_CHAIN = '''tigerbite|bao now|biryani guys|boulangerie jade|burrito kitchen|cube desserts|german swing grill|gourmet sushi|hitea|rhode island coffee|
sambal express|tsujiri|zumuku sushi|sushi point|coqfighter|change please|inamo sukoshi|little bao boy|mi chaii|mowchi|okome|straight outta nashville|
teddy bear bubble tea|three uncles|yuzu street food|cafe de nata|bold street coffee|saint espresso|fuel juice bars|go falafel|kibou|eugreeka|hotville|
chaaye paani|matchado|le bab|kulcha express|rayu|rayu pan asian|house of momo|garbanzos falafel and hummus bar|hola guacamole|emilias crafted pasta|
pasta di piazza|momo king|utea|olong bubble and fruit teas|pearls bubble tea|yano cha|cotti coffee|souvlaki franchise|side street burgers|
urban fresh burgers and fries|its all greek to me|roti king|hoxton bakehouse|acropolis street food|argentinian grill|band of burgers|bun buddies|
smash bros|french tacos|canadian charcoal pit|dial a roti|samosa haus|biryaniwala|kauai|wrap it up|jays chicken|chicken guys|burger bros|shakedown'''
KNOWN_OTHER = {'panku': 'panku-streetfood (discovery list)', 'cafe pausa': 'dunelm (Pausa cafes, triaged NO-DATA)', 'pausa': 'dunelm',
               'caffe pausa': 'dunelm', 'pausa cafe': 'dunelm', 'cafe w': 'waterstones (Waterstones cafes)', 'ivy': 'The Ivy Collection',
               'yo': 'yo-sushi (published)', 'gdk': 'german-doner-kebab (published)', 'ask': 'ask-italian (published)',
               'eggfree cake box': 'cake-box', 'egg free cake box': 'cake-box', 'eggfree cakebox': 'cake-box',
               'moon under water': 'a Wetherspoon pub name (wetherspoon, published)', 'merkur cashino': ''}
NOT_FOOD = '''merkur slots|merkur cashino|admiral casino|admiral amusements|slimming world|slimming world franchise|age|age concern|foodcycle|food cycle|
rapid relief team|william hill|sports direct|edmundson electrical|royal mail|emmaus|inflata nation|360 play|jump|jumpin fun|planet play|play|
si5 spy missions|psycle|climbing hangar|junior adventures group|vita student|housing services|mediclean|warehouse demo services|londis|one stop|
country markets|real junk food project|free cakes for kids|food bank|st mungos|hope centre|league of friends|alzheimer scotland|wework barista station|
staff canteen|officers mess|sergeants mess|everlast gyms|reel cinema|savoy cinema|vagabond wines|grosvenor casino|genting casino|home bargains|
bristol sport foundation|street trader|bus yard|cook stars|next thing education camps|premier education|active future south oxfordshire'''
CONTRACT = '''impact food group|dolce|dolce education catering|caterplus|olive catering|abm catering|14forty|bennett hay|pabulum|entier|tns catering|
taylorshaw|ess|ess catering|ess government services|graysons restaurants|graysons restaurant|graysons hospitality|bon appetit|legends global services|
connect catering|celtic catering|celtic catering partnership|coombs catering partnership|company of cooks|talkington bates|wilson vale catering|
lunchtime company|good eating company|colicci|colicci ecsi|simply catering|premier catering|elite catering|supreme catering|quality catering|
just perfect catering|hcl|etc venues|cm sports|am sports|active future|south west norse|bartlett mitchell|make lunch|mack opco|lynwood and co|
dannys event catering|piccadilly whip catering|caterlink'''
HOTEL = '''hampton by hilton|ibis hotel|ibis|ibis styles|doubletree by hilton|double tree by hilton|hotel indigo|express by holiday inn|moxy hotel|
courtyard by marriott|delta hotels by marriott|clayton hotel|travel lodge|premier travel inn|bed and breakfast|hilton garden inn|novotel|days inn'''


def split(s):
    return {x.strip() for x in s.replace('\n', '').split('|') if x.strip()}


chain, small, notfood, contract, hotel = map(split, (CHAIN, SMALL_CHAIN, NOT_FOOD, CONTRACT, HOTEL))
rows = list(csv.DictReader(open(os.path.join(SRC, 'counts.csv'), encoding='utf-8')))
os.makedirs(DST, exist_ok=True)
fields = ['stem', 'gb_outlets', 'ni_outlets', 'authorities', 'regions', 'types', 'known', 'generic', 'institution', 'top_names']
with open(os.path.join(DST, 'counts.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
    w.writeheader()
    w.writerows(rows)
short = []
for r in rows:
    if r['known'] or r['generic'] or r['institution']:
        continue
    st, g = r['stem'], int(r['gb_outlets'])
    if st in KNOWN_OTHER:
        kind = 'known under another name: ' + (KNOWN_OTHER[st] or 'see notes')
    elif st in chain:
        kind = 'chain: triaged in data/candidates/triage7/b.csv'
    elif st in small:
        kind = 'small chain (under 10 outlets): not triaged'
    elif st in notfood:
        kind = 'not a restaurant chain (leisure, retail, charity, gym or workplace; food incidental)'
    elif st in contract:
        kind = 'contract caterer or construction-site/workplace canteen (not a public chain)'
    elif st in hotel:
        kind = 'hotel brand (rooms with breakfast or a bar): not triaged'
    elif g >= 10:
        kind = 'several unrelated businesses share this name'
    else:
        kind = 'not reviewed (under 10 outlets)'
    r = dict(r)
    r['kind'] = kind
    short.append(r)
with open(os.path.join(DST, 'shortlist.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=fields[:6] + ['kind', 'top_names'], extrasaction='ignore')
    w.writeheader()
    w.writerows(short)
import collections
print(len(rows), 'names with 3+ GB outlets;', len(short), 'on the shortlist')
print(collections.Counter(r['kind'].split(':')[0] for r in short))
missing = (chain | small) - {r['stem'] for r in short}
print('picked but not on shortlist:', sorted(missing))
