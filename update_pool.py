import json, os, urllib.request
from datetime import datetime, timezone

d = json.loads(open('/tmp/balance.json').read())
bals = d.get('balances', [])
lunc = next((b for b in bals if b['denom'] == 'uluna'), None)
ustc = next((b for b in bals if b['denom'] == 'uusd'), None)
lunc_val = int(lunc['amount']) / 1e6 if lunc else 0
ustc_val = int(ustc['amount']) / 1e6 if ustc else 0
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
today = datetime.now(timezone.utc).strftime('%Y-%m-%d')

# Fetch prices from CoinGecko (server-side, no CORS issues)
lunc_price = 0.000042
ustc_price = 0.005
try:
    url = 'https://api.coingecko.com/api/v3/simple/price?ids=terra-luna-classic,terraclassicusd&vs_currencies=usd'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=10) as r:
        prices = json.loads(r.read())
        lunc_price = prices.get('terra-luna-classic', {}).get('usd', lunc_price)
        ustc_price = prices.get('terraclassicusd', {}).get('usd', ustc_price)
    print(f"Prices: LUNC=${lunc_price} USTC=${ustc_price}")
except Exception as e:
    print(f"Price fetch failed: {e}, using fallback")

path = 'assets/data/oracle-pool.json'
existing = {}
if os.path.exists(path):
    try:
        existing = json.loads(open(path).read())
    except:
        existing = {}

history = existing.get('history', [])
history = [h for h in history if h.get('date') != today]
history.append({'date': today, 'lunc': lunc_val, 'ustc': ustc_val})
history = sorted(history, key=lambda x: x['date'])
if len(history) > 400:
    history = history[-400:]

output = {
    'lunc': lunc_val,
    'ustc': ustc_val,
    'lunc_price': lunc_price,
    'ustc_price': ustc_price,
    'updated': now,
    'history': history
}
open(path, 'w').write(json.dumps(output, separators=(',', ':')))
print(f"Done: lunc={lunc_val:.0f} ustc={ustc_val:.0f} history={len(history)}d")
