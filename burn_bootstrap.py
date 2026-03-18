#!/usr/bin/env python3
"""
burn_bootstrap.py — сбор исторических данных burn через FCD.
Использует account=BURN_WALLET для пагинации + before=ID.
Поддерживает checkpoint для многократных запусков.
"""

import json, os, time, urllib.request, urllib.error, sys
from datetime import datetime, timezone, timedelta
from collections import defaultdict

FCD = 'https://fcd.terra-classic.hexxagon.io/v1/txs'
BURN_WALLET = 'terra1sk06e3dyexuq4shw77y3dsv480xv42mq73anxu'
HISTORY_PATH = 'assets/data/burn_history.json'
CHECKPOINT_PATH = '/tmp/burn_checkpoint.json'
DAYS_BACK = int(sys.argv[1]) if len(sys.argv) > 1 else 365
DELAY = 0.3
LIMIT = 100
MAX_RUNTIME = 5 * 3600

def fetch_txs(before_id=None):
    url = f'{FCD}?account={BURN_WALLET}&limit={LIMIT}'
    if before_id:
        url += f'&before={before_id}'
    print(f"  GET ...before={before_id}")
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; burn-bootstrap/1.0)',
        'Accept': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def extract_burn(tx):
    """Извлечь полный burn (uluna) из tx — оба формата."""
    total = 0
    try:
        for log in tx.get('logs', []):
            # Формат 1: logs[].log.tax = "678633532uluna"
            log_obj = log.get('log', {})
            if isinstance(log_obj, dict):
                tax_str = log_obj.get('tax', '')
                if tax_str and 'uluna' in tax_str:
                    # может быть "678633532uluna" или "678633532uluna,123uusd"
                    parts = tax_str.split(',')
                    for p in parts:
                        if 'uluna' in p:
                            try:
                                total += int(p.replace('uluna', '').strip())
                            except:
                                pass

            # Формат 2: events[tax_payment].attributes[tax_amount]
            for event in log.get('events', []):
                if event.get('type') == 'tax_payment':
                    for attr in event.get('attributes', []):
                        if attr.get('key') == 'tax_amount':
                            val = attr['value']
                            if 'uluna' in val:
                                try:
                                    total += int(val.replace('uluna', '').strip())
                                except:
                                    pass
    except Exception as e:
        pass
    return total

def ts_to_hour(ts): return ts[:13]
def ts_to_day(ts): return ts[:10]
def parse_ts(ts): return datetime.strptime(ts, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)

def load_existing():
    if os.path.exists(HISTORY_PATH):
        try: return json.loads(open(HISTORY_PATH).read())
        except: pass
    return {'daily': [], 'hourly': [], 'updated': '', 'bootstrap_done': False}

def load_checkpoint():
    if os.path.exists(CHECKPOINT_PATH):
        try: return json.loads(open(CHECKPOINT_PATH).read())
        except: pass
    return None

def save_checkpoint(d): open(CHECKPOINT_PATH, 'w').write(json.dumps(d))

def merge(existing, daily_acc, hourly_acc):
    dm = {d['date']: d['burn'] for d in existing.get('daily', [])}
    for k, v in daily_acc.items(): dm[k] = dm.get(k, 0) + v
    daily = sorted([{'date': k, 'burn': v} for k, v in dm.items()], key=lambda x: x['date'])

    cut = (datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%dT%H')
    hm = {h['ts']: h['burn'] for h in existing.get('hourly', []) if h['ts'] >= cut}
    for k, v in hourly_acc.items():
        if k >= cut: hm[k] = hm.get(k, 0) + v
    hourly = sorted([{'ts': k, 'burn': v} for k, v in hm.items()], key=lambda x: x['ts'])
    return daily, hourly

def main():
    start = time.time()
    cutoff = datetime.now(timezone.utc) - timedelta(days=DAYS_BACK)
    print(f"Bootstrap: {DAYS_BACK} дней, cutoff={cutoff.strftime('%Y-%m-%d')}")
    print(f"Wallet: {BURN_WALLET}")

    cp = load_checkpoint()
    before_id = cp['next_before'] if cp else None
    daily_acc = defaultdict(int, cp.get('daily_acc', {}) if cp else {})
    hourly_acc = defaultdict(int, cp.get('hourly_acc', {}) if cp else {})
    pages = cp.get('pages', 0) if cp else 0
    total_burn = cp.get('total_burn', 0) if cp else 0
    consec_errors = 0

    if cp:
        print(f"Checkpoint: before={before_id}, стр={pages}, burn={total_burn/1e6:.1f}M")

    existing = load_existing()
    done = False

    try:
        while True:
            if time.time() - start > MAX_RUNTIME:
                print("Лимит времени. Сохраняем checkpoint.")
                break

            try:
                data = fetch_txs(before_id)
                consec_errors = 0
            except urllib.error.HTTPError as e:
                consec_errors += 1
                print(f"HTTP {e.code}: {e.reason} (before={before_id})")
                if consec_errors > 5:
                    print("Слишком много ошибок.")
                    break
                time.sleep(15)
                continue
            except Exception as e:
                consec_errors += 1
                print(f"Ошибка: {e}")
                if consec_errors > 5: break
                time.sleep(10)
                continue

            txs = data.get('txs', [])
            next_id = data.get('next')

            if not txs:
                print("Транзакции закончились.")
                done = True
                break

            for tx in txs:
                ts = tx.get('timestamp', '')
                if not ts: continue
                if parse_ts(ts) < cutoff:
                    print(f"Достигли cutoff. Готово.")
                    done = True
                    break
                burn = extract_burn(tx)
                if burn > 0:
                    daily_acc[ts_to_day(ts)] += burn
                    hourly_acc[ts_to_hour(ts)] += burn
                    total_burn += burn

            pages += 1

            if pages % 50 == 0:
                elapsed = (time.time() - start) / 60
                print(f"[{pages}] burn={total_burn/1e6:.1f}M LUNC days={len(daily_acc)} {elapsed:.1f}мин")

            if done: break
            if not next_id:
                print("Нет next_id.")
                done = True
                break

            before_id = next_id

            if pages % 200 == 0:
                save_checkpoint({'next_before': before_id, 'daily_acc': dict(daily_acc),
                    'hourly_acc': dict(hourly_acc), 'pages': pages, 'total_burn': total_burn})
                print(f"Checkpoint сохранён (стр {pages})")

            time.sleep(DELAY)

    except KeyboardInterrupt:
        print("Прервано.")

    if not done:
        save_checkpoint({'next_before': before_id, 'daily_acc': dict(daily_acc),
            'hourly_acc': dict(hourly_acc), 'pages': pages, 'total_burn': total_burn})
        print("Checkpoint сохранён. Запусти снова для продолжения.")

    daily, hourly = merge(existing, daily_acc, hourly_acc)
    output = {'daily': daily, 'hourly': hourly,
        'updated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'bootstrap_done': done, 'total_days': len(daily)}

    os.makedirs(os.path.dirname(HISTORY_PATH), exist_ok=True)
    open(HISTORY_PATH, 'w').write(json.dumps(output, separators=(',', ':')))
    print(f"Сохранено: {len(daily)} дней, {len(hourly)} часов, burn={total_burn/1e6:.1f}M LUNC")

    if done and os.path.exists(CHECKPOINT_PATH):
        os.remove(CHECKPOINT_PATH)
        print("Bootstrap завершён!")

if __name__ == '__main__':
    main()
