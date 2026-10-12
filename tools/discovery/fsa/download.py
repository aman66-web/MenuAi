"""Download every FSA FHRS/FHIS bulk XML file (English language) once, politely."""
import json, os, sys, time, urllib.request, urllib.error
CACHE = '/tmp/fsa-cache/xml'
os.makedirs(CACHE, exist_ok=True)
auth = json.load(open('/tmp/fsa-cache/authorities.json'))['authorities']
UA = 'Mozilla/5.0 (compatible; MenuMacros chain discovery; open data bulk download)'
for a in auth:
    url = a['FileName']
    name = url.rsplit('/', 1)[1]
    path = os.path.join(CACHE, name)
    if os.path.exists(path) and os.path.getsize(path) > 200:
        continue
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        print('HTTP', e.code, url, flush=True)
        if e.code in (401, 403, 429):
            sys.exit('stopping on ' + str(e.code))
        time.sleep(1)
        continue
    except Exception as e:
        print('ERR', e, url, flush=True)
        time.sleep(2)
        continue
    open(path + '.tmp', 'wb').write(data)
    os.replace(path + '.tmp', path)
    print('ok', name, len(data), flush=True)
    time.sleep(1)
print('DONE')
