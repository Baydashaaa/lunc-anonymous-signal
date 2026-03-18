import json, os, time, urllib.request
from datetime import datetime, timezone, timedelta
from collections import defaultdict

# --- Oracle Pool ---
d = json.loads(open('/tmp/balance.json').read())
bals = d.get('balances', [])
lunc = next((b for b in bals if b['denom'] == 'uluna'), None)
ustc = next((b for b in bals if b['denom'] == 'uusd'), None)
lunc_val = int(lunc['amount']) / 1e6 if lunc else 0
ustc_val = int(ustc['amount']) / 1e6 if ustc else 0
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
today = datetime.now(timezone.utc).strftime('%Y-%m-%d')

# Fetch prices from CoinGecko
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
print(f"Oracle Pool: lunc={lunc_val:.0f} ustc={ustc_val:.0f} history={len(history)}d")

# --- Incremental Burn Collection ---
FCD_URL = 'https://fcd.terra-classic.hexxagon.io/v1/txs'
BURN_PATH = 'assets/data/burn_history.json'
LAST_ID_PATH = '/tmp/burn_last_id.txt'

def fetch_txs(before_id=None):
    url = f'{FCD_URL}?limit=100'
    if before_id:
        url += f'&before={before_id}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def extract_burn_uluna(tx):
    total = 0
    try:
        for log in tx.get('logs', []):
            for event in log.get('events', []):
                if event.get('type') == 'tax_payment':
                    for attr in event.get('attributes', []):
                        if attr.get('key') == 'tax_amount':
                            val = attr['value']
                            if 'uluna' in val:
                                total += int(val.replace('uluna', ''))
    except:
        pass
    return total

def ts_to_hour(ts_str):
    return ts_str[:13]  # '2026-03-18T19'

def ts_to_day(ts_str):
    return ts_str[:10]  # '2026-03-18'

# загружаем burn_history.json
burn_data = {'daily': [], 'hourly': [], 'updated': '', 'bootstrap_done': False}
if os.path.exists(BURN_PATH):
    try:
        burn_data = json.loads(open(BURN_PATH).read())
    except:
        pass

# читаем последний известный ID (чтобы не дублировать)
last_known_id = None
if os.path.exists(LAST_ID_PATH):
    try:
        last_known_id = int(open(LAST_ID_PATH).read().strip())
    except:
        pass

# собираем новые tx (идём вперёд от последнего ID)
daily_acc = defaultdict(int)
hourly_acc = defaultdict(int)
newest_id = None
pages = 0
MAX_PAGES = 20  # не более 2000 tx за один запуск (30 мин окно)
cutoff_dt = datetime.now(timezone.utc) - timedelta(hours=2)  # берём последние 2 часа с запасом

print(f"Burn: собираем новые tx с last_id={last_known_id}")

before_id = None
stop = False

while pages < MAX_PAGES and not stop:
    try:
        data = fetch_txs(before_id)
    except Exception as e:
        print(f"Burn fetch error: {e}")
        break

    txs = data.get('txs', [])
    if not txs:
        break

    if newest_id is None:
        newest_id = txs[0].get('id')

    for tx in txs:
        tx_id = tx.get('id', 0)
        ts = tx.get('timestamp', '')

        # стоп если дошли до уже известного ID
        if last_known_id and tx_id <= last_known_id:
            stop = True
            break

        # стоп если tx старше 2 часов (на случай первого запуска без bootstrap)
        if ts and datetime.strptime(ts, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc) < cutoff_dt:
            stop = True
            break

        burn = extract_burn_uluna(tx)
        if burn > 0:
            daily_acc[ts_to_day(ts)] += burn
            hourly_acc[ts_to_hour(ts)] += burn

    before_id = data.get('next')
    pages += 1

    if not before_id:
        break

    time.sleep(0.2)

print(f"Burn: собрано {pages} страниц, новых дней={len(daily_acc)}, часов={len(hourly_acc)}")

# мержим daily
daily_map = {d['date']: d['burn'] for d in burn_data.get('daily', [])}
for date_key, burn in daily_acc.items():
    daily_map[date_key] = daily_map.get(date_key, 0) + burn
daily_list = sorted(
    [{'date': k, 'burn': v} for k, v in daily_map.items()],
    key=lambda x: x['date']
)

# мержим hourly — только последние 30 дней
cutoff_30d = (datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%dT%H')
hourly_map = {h['ts']: h['burn'] for h in burn_data.get('hourly', []) if h['ts'] >= cutoff_30d}
for hour_key, burn in hourly_acc.items():
    if hour_key >= cutoff_30d:
        hourly_map[hour_key] = hourly_map.get(hour_key, 0) + burn
hourly_list = sorted(
    [{'ts': k, 'burn': v} for k, v in hourly_map.items()],
    key=lambda x: x['ts']
)

burn_data['daily'] = daily_list
burn_data['hourly'] = hourly_list
burn_data['updated'] = now

os.makedirs(os.path.dirname(BURN_PATH), exist_ok=True)
open(BURN_PATH, 'w').write(json.dumps(burn_data, separators=(',', ':')))
print(f"Burn saved: {len(daily_list)} дней, {len(hourly_list)} часов")

# сохраняем последний ID
if newest_id:
    open(LAST_ID_PATH, 'w').write(str(newest_id))
    print(f"Last tx ID сохранён: {newest_id}")
