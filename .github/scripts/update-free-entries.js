// .github/scripts/update-free-entries.js
// Runs hourly via GitHub Actions
// Reads on-chain tx history → updates free-entries.json

import fetch from 'node-fetch';
import fs    from 'fs';
import path  from 'path';

// ── Constants ────────────────────────────────────────────────────────────────
const ORACLE_WALLET  = 'terra1549z8zd9hkggzlwf0rcuszhc9rs9fxqfy2kagt'; // Q&A fees
const WEEKLY_WALLET  = 'terra1p5l6q95kfl3hes7edy76tywav9f79n6xlkz6qz'; // Weekly draw
const CHAT_MIN_ULUNA = 5_000_000_000;   // 5,000 LUNC in uluna (chat message fee)
const Q_MIN_ULUNA    = 200_000_000_000; // 200,000 LUNC (question fee)
const CHAT_ENTRIES_PER_10 = 1;          // entries per 10 chat messages
const CHAT_MAX_PER_DAY    = 2;          // max chat entries per wallet per day
const QUESTION_ENTRIES    = 2;          // entries per question
const WEEKLY_WINDOW_SEC   = 7 * 86400;  // 7 days lookback

const LCD_NODES = [
  'https://terra-classic-lcd.publicnode.com',
  'https://api-terra-ia.cosmosia.notional.ventures',
];

const JSON_PATH = path.resolve('free-entries.json');

// ── LCD fetch with fallback ──────────────────────────────────────────────────
async function lcdFetch(endpoint) {
  for (const base of LCD_NODES) {
    try {
      const res = await fetch(base + endpoint, { timeout: 10000 });
      if (res.ok) return res.json();
    } catch(e) {
      console.warn(`LCD ${base} failed:`, e.message);
    }
  }
  throw new Error('All LCD nodes failed for: ' + endpoint);
}

// ── Fetch all txs TO a wallet since cutoff ──────────────────────────────────
async function fetchTxsTo(wallet, cutoffSec) {
  const txs = [];
  let nextKey = null;
  do {
    let url = `/cosmos/tx/v1beta1/txs?events=transfer.recipient%3D%27${wallet}%27&pagination.limit=100&order_by=ORDER_BY_DESC`;
    if (nextKey) url += `&pagination.key=${encodeURIComponent(nextKey)}`;
    const data = await lcdFetch(url);
    if (!data?.txs?.length) break;
    let done = false;
    for (const tx of data.txs) {
      const ts = Math.floor(new Date(tx.timestamp).getTime() / 1000);
      if (ts < cutoffSec) { done = true; break; }
      txs.push({ tx, ts });
    }
    nextKey = data.pagination?.next_key || null;
    if (done) break;
  } while (nextKey);
  return txs;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const now     = Math.floor(Date.now() / 1000);
  const cutoff  = now - WEEKLY_WINDOW_SEC;
  const todayUTC = new Date().toISOString().slice(0, 10);

  // Load current JSON
  let data = { _meta: {}, entries: {} };
  if (fs.existsSync(JSON_PATH)) {
    try { data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')); } catch(e) {}
  }

  // ── 1. Process chat messages (txs to ORACLE_WALLET) ──────────────────────
  console.log('Fetching chat txs from ORACLE_WALLET...');
  const chatTxs = await fetchTxsTo(ORACLE_WALLET, cutoff);

  // Group by sender → count chat messages per day
  // { "terra1abc": { "2026-03-26": 14, "2026-03-27": 8 } }
  const chatByWallet = {};
  for (const { tx, ts } of chatTxs) {
    const msgs = tx.tx?.body?.messages || [];
    for (const msg of msgs) {
      if (msg['@type'] !== '/cosmos.bank.v1beta1.MsgSend') continue;
      if (msg.to_address !== ORACLE_WALLET) continue;
      const uluna = msg.amount?.find(c => c.denom === 'uluna')?.amount || '0';
      if (Number(uluna) < CHAT_MIN_ULUNA) continue; // not a chat tx

      const sender  = msg.from_address;
      const dayStr  = new Date(ts * 1000).toISOString().slice(0, 10);
      if (!chatByWallet[sender]) chatByWallet[sender] = {};
      chatByWallet[sender][dayStr] = (chatByWallet[sender][dayStr] || 0) + 1;
    }
  }

  // Calculate chat entries per wallet (this week)
  // Every 10 msgs = 1 entry, max 2 per day
  const chatEntries = {}; // { "terra1abc": 3 }
  for (const [wallet, days] of Object.entries(chatByWallet)) {
    let total = 0;
    for (const [day, count] of Object.entries(days)) {
      const dayEntries = Math.min(Math.floor(count / 10) * CHAT_ENTRIES_PER_10, CHAT_MAX_PER_DAY);
      total += dayEntries;
    }
    if (total > 0) chatEntries[wallet] = total;
  }

  // ── 2. Process Oracle questions (txs to ORACLE_WALLET, 200k LUNC) ────────
  console.log('Processing question entries...');
  const questionEntries = {};
  for (const { tx } of chatTxs) { // reuse same txs — same wallet
    const msgs = tx.tx?.body?.messages || [];
    for (const msg of msgs) {
      if (msg['@type'] !== '/cosmos.bank.v1beta1.MsgSend') continue;
      if (msg.to_address !== ORACLE_WALLET) continue;
      const uluna = Number(msg.amount?.find(c => c.denom === 'uluna')?.amount || '0');
      if (uluna < Q_MIN_ULUNA) continue; // not a question tx
      const sender = msg.from_address;
      questionEntries[sender] = (questionEntries[sender] || 0) + QUESTION_ENTRIES;
    }
  }

  // ── 3. Merge into entries object ─────────────────────────────────────────
  const allWallets = new Set([
    ...Object.keys(chatEntries),
    ...Object.keys(questionEntries),
  ]);

  const newEntries = {};
  for (const wallet of allWallets) {
    newEntries[wallet] = {
      chat:      chatEntries[wallet]     || 0,
      questions: questionEntries[wallet] || 0,
      total:     (chatEntries[wallet] || 0) + (questionEntries[wallet] || 0),
    };
  }

  // ── 4. Write JSON ─────────────────────────────────────────────────────────
  const roundStart = new Date(cutoff * 1000).toISOString();
  data._meta = {
    description:  'Free Weekly Draw entries earned via Terra Oracle protocol',
    sources: {
      chat:      '1 entry per 10 messages per day (max 2/day)',
      questions: '2 entries per Oracle question (200k LUNC)',
    },
    updated:     new Date().toISOString(),
    round_start: roundStart,
    window_days: 7,
  };
  data.entries = newEntries;

  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
  console.log(`✅ Updated free-entries.json — ${allWallets.size} wallets, ${Object.values(newEntries).reduce((s,e) => s + e.total, 0)} total entries`);
}

main().catch(e => { console.error(e); process.exit(1); });
