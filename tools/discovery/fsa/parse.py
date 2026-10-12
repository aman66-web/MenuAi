"""Parse every cached FSA XML file into one compact TSV (establishments.tsv) for counting."""
import csv, glob, json, os, sys
import xml.etree.ElementTree as ET

auth = json.load(open('/tmp/fsa-cache/authorities.json'))['authorities']
region = {a['LocalAuthorityIdCode']: a['RegionName'] for a in auth}
FIELDS = ['FHRSID', 'BusinessName', 'BusinessType', 'BusinessTypeID', 'AddressLine1', 'AddressLine2', 'AddressLine3',
          'AddressLine4', 'PostCode', 'RatingValue', 'LocalAuthorityCode', 'LocalAuthorityName', 'SchemeType']
out = open('/tmp/fsa-cache/establishments.tsv', 'w', newline='', encoding='utf-8')
w = csv.writer(out, delimiter='\t')
w.writerow(FIELDS + ['Region'])
n = 0
for path in sorted(glob.glob('/tmp/fsa-cache/xml/*.xml')):
    for ev, el in ET.iterparse(path):
        if el.tag != 'EstablishmentDetail':
            continue
        row = [(el.findtext(k) or '').strip().replace('\t', ' ').replace('\n', ' ') for k in FIELDS]
        row.append(region.get(row[FIELDS.index('LocalAuthorityCode')], ''))
        w.writerow(row)
        n += 1
        el.clear()
out.close()
print(n, 'establishments')
