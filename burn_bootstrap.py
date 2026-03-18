#!/usr/bin/env python3
"""
burn_bootstrap.py — одноразовый скрипт для сбора исторических данных burn.
Пагинирует FCD назад, собирает tax_payment events, группирует по дням и часам.
Поддерживает checkpoint — можно запускать несколько раз, продолжает с места остановки.

Запуск: python3 burn_bootstrap.py [days=365]
"""

import json, os, time, urllib.request, sys
from datetime import datetime, timezone, timedelta
from collections import defaultdict

# --- конфиг ---
FCD_URL = 'https://fcd.terra-classic.hexxagon.io/v1/txs'
HISTORY_PATH = 'assets/data/burn_history.json'
CHECKPOINT_PATH = '/tmp/burn_checkpoint.json'
DAYS_BACK = int(sys.argv[1]) if len(sys.argv) > 1 else 365
DELAY = 0.15        # сек между запросами
LIMIT = 100         # tx за запрос (10 или 100)
MAX_RUNTIME = 5 * 3600  # 5 часов макс (GitHub Actions лимит 6ч)

def fetch_txs(before_id=None):
    url = f'{FCD_URL}?limit={LIMIT}'
    if before_id:
        url += f'&before={before_id}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def extract_burn(tx):
    """Извлечь суммарный burn (uluna) из одной транзакции."""
    total = 0
    try:
        for log in tx.get('logs', []):
            for event in log.get('events', []):
                if event.get('type') == 'tax_payment':
                    for attr in event.get('attributes', []):
                        if attr.get('key') == 'tax_amount':
                            val = attr['value']
                            # формат: "12345uluna" или "12345uusd"
                            if 'uluna' in val:
                                total += int(val.replace('uluna', ''))
    except:
        pass
    return total

def ts_to_hour_key(ts_str):
    """2026-03-18T19:55:16Z → '2026-03-18T19'"""
    return ts_str[:13]

def ts_to_day_key(ts_str):
    """2026-03-18T19:55:16Z → '2026-03-18'"""
    return ts_str[:10]

def parse_ts(ts_str):
    return datetime.strptime(ts_str, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)

def load_existing():
    if os.path.exists(HISTORY_PATH):
        try:
            return json.loads(open(HISTORY_PATH).read())
        except:
            pass
    return {'daily': [], 'hourly': [], 'updated': '', 'bootstrap_done': False}

def load_checkpoint():
    if os.path.exists(CHECKPOINT_PATH):
        try:
            return json.loads(open(CHECKPOINT_PATH).read())
        except:
            pass
    return None

def save_checkpoint(data):
    open(CHECKPOINT_PATH, 'w').write(json.dumps(data))

def merge_into_existing(existing, daily_acc, hourly_acc):
    """Смержить накопленные данные с существующими."""
    # daily
    daily_map = {d['date']: d['burn'] for d in existing.get('daily', [])}
    for date_key, burn in daily_acc.items():
        if date_key in daily_map:
            daily_map[date_key] += burn
        else:
            daily_map[date_key] = burn
    daily_list = sorted(
        [{'date': k, 'burn': v} for k, v in daily_map.items()],
        key=lambda x: x['date']
    )

    # hourly — только последние 30 дней
    cutoff_30d = (datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%dT%H')
    hourly_map = {h['ts']: h['burn'] for h in existing.get('hourly', []) if h['ts'] >= cutoff_30d}
    for hour_key, burn in hourly_acc.items():
        if hour_key >= cutoff_30d:
            if hour_key in hourly_map:
                hourly_map[hour_key] += burn
            else:
                hourly_map[hour_key] = burn
    hourly_list = sorted(
        [{'ts': k, 'burn': v} for k, v in hourly_map.items()],
        key=lambda x: x['ts']
    )

    return daily_list, hourly_list

def main():
    start_time = time.time()
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=DAYS_BACK)
    cutoff_str = cutoff_dt.strftime('%Y-%m-%dT%H:%M:%SZ')

    print(f"Bootstrap: собираем данные с {cutoff_str} ({DAYS_BACK} дней назад)")

    # загружаем checkpoint
    cp = load_checkpoint()
    before_id = cp['next_before'] if cp else None
    daily_acc = defaultdict(int, cp.get('daily_acc', {}) if cp else {})
    hourly_acc = defaultdict(int, cp.get('hourly_acc', {}) if cp else {})
    pages = cp.get('pages', 0) if cp else 0
    total_burn = cp.get('total_burn', 0) if cp else 0

    if cp:
        print(f"Продолжаем с checkpoint: before_id={before_id}, страниц={pages}")

    existing = load_existing()
    done = False

    try:
        while True:
            # проверяем лимит времени
            elapsed = time.time() - start_time
            if elapsed > MAX_RUNTIME:
                print(f"Достигнут лимит времени ({MAX_RUNTIME/3600:.1f}ч). Сохраняем checkpoint.")
                break

            try:
                data = fetch_txs(before_id)
            except Exception as e:
                print(f"Ошибка запроса: {e}, ждём 5 сек...")
                time.sleep(5)
                continue

            txs = data.get('txs', [])
            next_id = data.get('next')

            if not txs:
                print("Транзакции закончились.")
                done = True
                break

            for tx in txs:
                ts = tx.get('timestamp', '')
                if not ts:
                    continue

                # проверяем достигли ли нужной даты
                if parse_ts(ts) < cutoff_dt:
                    print(f"Достигли cutoff {cutoff_str}. Готово.")
                    done = True
                    break

                burn = extract_burn(tx)
                if burn > 0:
                    daily_acc[ts_to_day_key(ts)] += burn
                    hourly_acc[ts_to_hour_key(ts)] += burn
                    total_burn += burn

            pages += 1

            if pages % 100 == 0:
                elapsed = time.time() - start_time
                print(f"Страница {pages}, before_id={before_id}, "
                      f"total_burn={total_burn/1e6:.0f}M LUNC, "
                      f"дней накоплено={len(daily_acc)}, "
                      f"прошло={elapsed/60:.1f}мин")

            if done:
                break

            if not next_id:
                print("Нет next_id, конец данных.")
                done = True
                break

            before_id = next_id

            # сохраняем checkpoint каждые 500 страниц
            if pages % 500 == 0:
                save_checkpoint({
                    'next_before': before_id,
                    'daily_acc': dict(daily_acc),
                    'hourly_acc': dict(hourly_acc),
                    'pages': pages,
                    'total_burn': total_burn,
                })

            time.sleep(DELAY)

    except KeyboardInterrupt:
        print("Прервано пользователем.")

    # сохраняем финальный checkpoint если не закончили
    if not done:
        save_checkpoint({
            'next_before': before_id,
            'daily_acc': dict(daily_acc),
            'hourly_acc': dict(hourly_acc),
            'pages': pages,
            'total_burn': total_burn,
        })
        print(f"Checkpoint сохранён. Запусти скрипт снова для продолжения.")

    # мержим с существующими данными и сохраняем
    daily_list, hourly_list = merge_into_existing(existing, daily_acc, hourly_acc)

    output = {
        'daily': daily_list,
        'hourly': hourly_list,
        'updated': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'bootstrap_done': done,
        'total_days': len(daily_list),
    }

    os.makedirs(os.path.dirname(HISTORY_PATH), exist_ok=True)
    open(HISTORY_PATH, 'w').write(json.dumps(output, separators=(',', ':')))
    print(f"Сохранено: {len(daily_list)} дней, {len(hourly_list)} часов, "
          f"total_burn={total_burn/1e6:.1f}M LUNC")

    # удаляем checkpoint если bootstrap завершён
    if done and os.path.exists(CHECKPOINT_PATH):
        os.remove(CHECKPOINT_PATH)
        print("Checkpoint удалён — bootstrap завершён!")

if __name__ == '__main__':
    main()
