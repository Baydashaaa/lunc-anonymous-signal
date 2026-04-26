// ─── TREASURY MODULE · terra-oracle ──────────────────────────
const T_WALLETS = {
  treasury:  'terra1549z8zd9hkggzlwf0rcuszhc9rs9fxqfy2kagt', // Main Treasury
  daily:     'terra1amp68zg7vph3nq84ummnfma4dz753ezxfqa9px', // Daily Draw Pool
  weekly:    'terra1p5l6q95kfl3hes7edy76tywav9f79n6xlkz6qz', // Weekly Draw Pool
  rewards:   'terra1ty6fxd9u0jzae5lpzcs56rfclxg4q32hw5x4ce', // REP Rewards 20%
  reserve:   'terra10q6syec2e27x8g76a0mvm3frgvarl5dz27a2jz', // Reserve 20%
  liquidity: 'terra1gukarslv6c8n0s2259822l7059putpqxz405su', // Liquidity 50%
  dev:       'terra17g55uzkm6cr5fcl3vzcrmu73v8as4yvf2kktzr', // Development 10%
};
const T_LCD = [
  'https://terra-classic-lcd.publicnode.com',
  'https://lcd.terraclassic.community',
];
function tFmt(uluna) {
  const n = uluna / 1_000_000;
  if (n >= 1_000_000) return (n/1_000_000).toFixed(2) + 'M LUNC';
  if (n >= 1_000)     return (n/1_000).toFixed(1) + 'K LUNC';
  return n.toLocaleString(undefined,{maximumFractionDigits:0}) + ' LUNC';
}
function tFmtUsd(uluna, price) {
  const usd = (uluna/1_000_000)*price;
  if (usd >= 1000) return '≈ $'+(usd/1000).toFixed(2)+'K USD';
  return '≈ $'+usd.toFixed(2)+' USD';
}
function tSet(id, val) { const e=document.getElementById(id); if(e) e.textContent=val; }
async function tFetchBal(addr) {
  for (const lcd of T_LCD) {
    try {
      const r = await fetch(`${lcd}/cosmos/bank/v1beta1/balances/${addr}`);
      if (!r.ok) continue;
      const d = await r.json();
      const amt = d.balances?.find(b=>b.denom==='uluna')?.amount||'0';
      return parseInt(amt);
    } catch(e) { continue; }
  }
  return null;
}
async function tFetchPrice() {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=terra-luna&vs_currencies=usd');
    const d = await r.json();
    return d['terra-luna']?.usd || 0.00009;
  } catch(e) { return 0.00009; }
}
let _countdownTimer = null;
function tStartCountdowns() {
  if (_countdownTimer) clearInterval(_countdownTimer);
  function tick() {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),20,0,0));
    if (d <= now) d.setUTCDate(d.getUTCDate()+1);
    const dd = d - now;
    tSet('t-daily-countdown',
      String(Math.floor(dd/3600000)).padStart(2,'0')+':'+
      String(Math.floor((dd%3600000)/60000)).padStart(2,'0')+':'+
      String(Math.floor((dd%60000)/1000)).padStart(2,'0'));
    const w = new Date(now);
    const days = (1-w.getUTCDay()+7)%7||7;
    w.setUTCDate(w.getUTCDate()+days); w.setUTCHours(20,0,0,0);
    if (w<=now) w.setUTCDate(w.getUTCDate()+7);
    const wd = w-now;
    const wD = Math.floor(wd/86400000);
    const wH = String(Math.floor((wd%86400000)/3600000)).padStart(2,'0');
    const wM = String(Math.floor((wd%3600000)/60000)).padStart(2,'0');
    tSet('t-weekly-countdown', wD>0 ? `${wD}d ${wH}:${wM}` : `${wH}:${wM}`);
  }
  tick(); _countdownTimer = setInterval(tick, 1000);
}
async function tLoadRecentTxs(retries = 5) {
  const el = document.getElementById('t-recent-txs');
  if (!el) {
    if (retries > 0) setTimeout(() => tLoadRecentTxs(retries - 1), 200);
    return;
  }
  el.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-size:12px;">Loading transactions...</div>';

  // Helper: fetch txs for one wallet — tries FCD first, falls back to LCD
  const T_FCD = [
    'https://fcd.terra-classic.hexxagon.io',
    'https://terra-classic-fcd.publicnode.com',
  ];

  async function fetchTxsFor(wallet, limit) {
    let txs = [];

    // Try FCD first (returns richer tx data with old format)
    for (const fcd of T_FCD) {
      try {
        const url = `${fcd}/v1/txs?account=${wallet}&limit=${limit}`;
        const r = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) continue;
        const data = await r.json();
        txs = data.txs || [];
        if (txs.length) break;
      } catch(e) { continue; }
    }

    // Fallback to LCD if FCD failed
    if (!txs.length) {
      for (const lcd of T_LCD) {
        try {
          const url = `${lcd}/cosmos/tx/v1beta1/txs?events=transfer.recipient%3D%27${wallet}%27&pagination.limit=${limit}&order_by=ORDER_BY_DESC`;
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!r.ok) continue;
          const data = await r.json();
          // Convert LCD format to FCD-like format
          const bodies = data.txs || [];
          const metas  = data.tx_responses || [];
          txs = metas.map((meta, i) => ({
            txhash:    meta.txhash,
            timestamp: meta.timestamp,
            tx: {
              value: {
                memo: bodies[i]?.body?.memo || '',
                msg:  (bodies[i]?.body?.messages || []).map(m => ({
                  type:  m['@type'] || '',
                  value: { amount: m.amount, from_address: m.from_address, to_address: m.to_address },
                })),
              },
            },
          }));
          if (txs.length) break;
        } catch(e) { continue; }
      }
    }

    const results = [];
    const CHAT_AMT      = 5000   * 1e6;
    const QA_AMT        = 100000 * 1e6;
    const DRAW_NFT_MIN  = 24750  * 1e6;
    const TOL = 0.05;

    for (const tx of txs) {
      const tsRaw = tx.timestamp ? new Date(tx.timestamp) : null;
      const ts = tsRaw
        ? tsRaw.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + tsRaw.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
        : '';
      const tsMs = tsRaw ? tsRaw.getTime() : 0;
      const hash = tx.txhash || '';
      const memo = tx.tx?.value?.memo || tx.tx?.body?.memo || '';
      const msgs = tx.tx?.value?.msg  || tx.tx?.body?.messages || [];

      let rawUluna = 0;
      for (const msg of msgs) {
        // FCD format
        const coins = msg.value?.coins || msg.value?.amount || msg.amount || [];
        const lunc = Array.isArray(coins) ? coins.find(c => c.denom === 'uluna') : null;
        if (lunc) { rawUluna = parseInt(lunc.amount); break; }
      }
      if (!rawUluna) continue;

      const QA_WEEKLY_AMT   = QA_AMT;
      const QA_TREASURY_AMT = QA_AMT;

      // Classify by destination wallet + amount
      let label;
      if (wallet === T_WALLETS.treasury) {
        if (rawUluna >= CHAT_AMT*(1-TOL) && rawUluna <= CHAT_AMT*(1+TOL))
          label = 'Chat';
        else if (rawUluna >= QA_TREASURY_AMT*(1-TOL) && rawUluna <= QA_TREASURY_AMT*(1+TOL))
          label = 'Q&A — Treasury';
        else if (memo && memo.toLowerCase().includes('daily'))
          label = 'Oracle Draw — Daily (10%)';
        else if (memo && memo.toLowerCase().includes('weekly'))
          label = 'Oracle Draw — Weekly (10%)';
        else
          label = memo || 'Transfer';
      } else if (wallet === T_WALLETS.weekly) {
        if (rawUluna >= QA_WEEKLY_AMT*(1-TOL) && rawUluna <= QA_WEEKLY_AMT*(1+TOL))
          label = 'Q&A — Weekly Pool';
        else if (rawUluna >= DRAW_NFT_MIN)
          label = 'Oracle Draw — Weekly NFT';
        else
          label = memo || 'Transfer';
      } else if (wallet === T_WALLETS.daily) {
        if (rawUluna >= DRAW_NFT_MIN)
          label = 'Oracle Draw — Daily NFT';
        else
          label = memo || 'Transfer';
      } else {
        label = memo || 'Transfer';
      }

      results.push({ label, amount: tFmt(rawUluna), hash, ts, tsMs });
    }
    return results;
  }

  try {
    // Fetch from Treasury, Weekly Pool and Daily Pool in parallel
    const [treasuryTxs, weeklyTxs, dailyTxs] = await Promise.all([
      fetchTxsFor(T_WALLETS.treasury, 8),
      fetchTxsFor(T_WALLETS.weekly, 8),
      fetchTxsFor(T_WALLETS.daily, 8),
    ]);

    // Merge and sort by time descending, show latest 10
    const allTxs = [...treasuryTxs, ...weeklyTxs, ...dailyTxs]
      .sort((a, b) => b.tsMs - a.tsMs)
      .slice(0, 10);

    if (!allTxs.length) {
      el.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-size:12px;">No transactions yet</div>';
      return;
    }

    el.innerHTML = allTxs.map(tx => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);gap:12px;">
        <div style="min-width:0;flex:1;">
          <div style="font-size:11px;color:var(--text);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tx.label}</div>
          <div style="font-size:10px;color:var(--muted);">${tx.ts}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
          <span style="font-size:11px;font-weight:700;color:#66ffaa;font-family:Rajdhani,sans-serif;">+${tx.amount}</span>
          <a href="https://finder.terraport.finance/classic/tx/${tx.hash}" target="_blank"
            style="font-size:9px;color:var(--accent);text-decoration:none;background:rgba(84,147,247,0.08);border:1px solid rgba(84,147,247,0.2);border-radius:5px;padding:3px 8px;white-space:nowrap;">
            🔗 ${tx.hash.slice(0,8)}...</a>
        </div>
      </div>`).join('');
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-size:12px;">Could not load transactions</div>';
  }
}
async function loadTreasuryData() {
  const btn = document.getElementById('t-refresh-btn');
  if (btn) { btn.textContent='⏳ Loading...'; btn.disabled=true; }

  const [price, tB, dB, wB, rB, resB, liqB, devB] = await Promise.all([
    tFetchPrice(),
    tFetchBal(T_WALLETS.treasury),
    tFetchBal(T_WALLETS.daily),
    tFetchBal(T_WALLETS.weekly),
    tFetchBal(T_WALLETS.rewards),
    tFetchBal(T_WALLETS.reserve),
    tFetchBal(T_WALLETS.liquidity),
    tFetchBal(T_WALLETS.dev),
  ]);

  const setWallet = (balId, usdId, bal) => {
    if (bal!==null) { tSet(balId,tFmt(bal)); tSet(usdId,tFmtUsd(bal,price)); }
    else { tSet(balId,'Error'); tSet(usdId,'Node unreachable'); }
  };

  setWallet('t-oracle-bal',   't-oracle-usd',   tB);
  setWallet('t-draw-bal',     't-draw-usd',     dB);
  setWallet('t-weekly-bal',   't-weekly-usd',   wB);
  setWallet('t-rewards-bal',  't-rewards-usd',  rB);
  setWallet('t-reserve-bal',  't-reserve-usd',  resB);
  setWallet('t-liquidity-bal','t-liquidity-usd',liqB);
  setWallet('t-dev-bal',      't-dev-usd',      devB);

  const total = (tB||0)+(dB||0)+(wB||0)+(rB||0)+(resB||0)+(liqB||0)+(devB||0);
  tSet('t-total-tvl', tFmt(total));
  tSet('t-total-usd', tFmtUsd(total,price));
  tSet('t-last-updated','Updated '+new Date().toLocaleTimeString());

  if (btn) { btn.textContent='↻ Refresh'; btn.disabled=false; }
  tLoadRecentTxs();
}
function showPage_treasury(e, _unused, skipHistory) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  const pg = document.getElementById('page-treasury');
  if (pg) pg.classList.add('active');
  if (!skipHistory && history.pushState) history.pushState({ page: 'treasury' }, '', '#treasury');
  try { sessionStorage.setItem('currentPage', 'treasury'); } catch(e) {}
  if (typeof smoothScrollTop==='function') smoothScrollTop();
  loadTreasuryData();
  tStartCountdowns();
}
