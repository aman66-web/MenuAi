"""Show sample FSA records for business names matching a regex: python3 -I where.py REGEX [N]"""
import csv, re, sys, collections
pat = re.compile(sys.argv[1], re.I)
n = int(sys.argv[2]) if len(sys.argv) > 2 else 8
rows = [r for r in csv.DictReader(open('/tmp/fsa-cache/establishments.tsv', encoding='utf-8'), delimiter='\t') if pat.search(r['BusinessName'])]
pcs = {r['PostCode'] for r in rows}
print(len(rows), 'records,', len(pcs), 'postcodes;', collections.Counter(r['Region'] for r in rows).most_common(12))
print('types', collections.Counter(r['BusinessType'] for r in rows).most_common(5))
print('line1', collections.Counter(r['AddressLine1'].split(',')[0][:25] for r in rows).most_common(6))
for r in rows[:n]:
    print('  ', r['BusinessName'], '|', r['AddressLine1'], '|', r['AddressLine2'], '|', r['AddressLine3'], '|', r['AddressLine4'], '|', r['PostCode'], '|', r['RatingValue'])
