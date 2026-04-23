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
  'https://rest.cosmos.directory/terra',
  'https://terra-classic-lcd.hexxagon.io',
];
// Nodes that support tx search by events (tx indexer enabled)
// publicnode returns 500 on /cosmos/tx/v1beta1/txs?events=... so excluded
const T_LCD_TX = [
  'https://terra-classic-lcd.hexxagon.io',
  'https://rest.cosmos.directory/terra',
  'https://lcd.terraclassic.community',
];
// FCD nodes — more reliable for tx history queries
const T_FCD = [
  'https://terra-classic-fcd.publicnode.com',
  'https://fcd.terra-classic.hexxagon.io',
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

  // Helper: fetch txs for one wallet and parse into unified rows
  async function fetchTxsFor(wallet, limit) {
    // Try all LCD nodes with timeout fallback
    // Also try both old (events=) and new (query=) parameter formats
    // for SDK 0.47+ compatibility
    let data = null;
    const paramVariants = [
      `events=transfer.recipient%3D%27${wallet}%27`,  // SDK <0.47
      `query=transfer.recipient%3D%27${wallet}%27`,   // SDK >=0.47
    ];
    outer: for (const lcd of T_LCD_TX) {
      for (const params of paramVariants) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          const url = `${lcd}/cosmos/tx/v1beta1/txs?${params}&pagination.limit=${limit}&order_by=2`;
          const r = await fetch(url, { signal: ctrl.signal });
          clearTimeout(timer);
          if (!r.ok) {
            console.warn(`Treasury txs: ${lcd} returned ${r.status} for params=${params.slice(0,6)}`);
            continue;
          }
          const body = await r.json();
          // If the API rejected the query format, body will have error field or be empty
          if (body.code || body.message) {
            console.warn(`Treasury txs: ${lcd} error:`, body.message || body.code);
            continue;
          }
          data = body;
          break outer; // success — stop trying
        } catch(e) {
          console.warn(`Treasury txs: ${lcd} failed:`, e.message);
          continue;
        }
      }
    }
    if (!data) {
      // Fallback to FCD — different API format but more reliable for tx history
      for (const fcd of T_FCD) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          const url = `${fcd}/v1/txs?account=${wallet}&limit=${limit}`;
          const r = await fetch(url, { signal: ctrl.signal });
          clearTimeout(timer);
          if (!r.ok) continue;
          const body = await r.json();
          if (!body.txs) continue;
          // Convert FCD format to LCD format
          data = {
            txs: body.txs.map(tx => ({
              body: { memo: tx.tx?.value?.memo || '', messages: (tx.tx?.value?.msg || []).map(m => ({
                '@type': m.type === 'bank/MsgSend' ? '/cosmos.bank.v1beta1.MsgSend' : m.type,
                from_address: m.value?.from_address || '',
                to_address: m.value?.to_address || '',
                amount: m.value?.amount || [],
              })) }
            })),
            tx_responses: body.txs.map(tx => ({
              txhash: tx.txhash || tx.id || '',
              timestamp: tx.timestamp || '',
              code: tx.code || 0,
            })),
          };
          console.log(`Treasury txs: FCD fallback ${fcd} success`);
          break;
        } catch(e) {
          console.warn(`Treasury txs: FCD ${fcd} failed:`, e.message);
        }
      }
    }
    if (!data) return [];
    const txBodies    = data.txs || [];
    const txResponses = data.tx_responses || [];
    const results = [];
    const count = Math.max(txBodies.length, txResponses.length);

    const CHAT_AMT = 5000 * 1e6;
    const QA_WEEKLY_AMT = 100000 * 1e6; // Q&A → Weekly Pool
    const QA_TREASURY_AMT = 100000 * 1e6; // Q&A → Treasury
    const DRAW_NFT_MIN = 24750 * 1e6; // ~25k LUNC (Common NFT with tax)
    const TOL = 0.05;

    for (let i = 0; i < count; i++) {
      const txBody = txBodies[i];
      const txMeta = txResponses[i];
      if (!txMeta) continue;

      const tsRaw = txMeta.timestamp ? new Date(txMeta.timestamp) : null;
      const ts = tsRaw
        ? tsRaw.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' + tsRaw.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
        : '';
      const tsMs = tsRaw ? tsRaw.getTime() : 0;
      const hash = txMeta.txhash || '';
      const memo = txBody?.body?.memo || '';
      const msgs = txBody?.body?.messages || [];

      let rawUluna = 0;
      for (const msg of msgs) {
        const coins = msg.amount || [];
        const lunc = Array.isArray(coins) ? coins.find(c => c.denom === 'uluna') : null;
        if (lunc) { rawUluna = parseInt(lunc.amount); break; }
      }
      if (!rawUluna) continue;

      // Classify by destination wallet + amount
      let label;
      if (wallet === T_WALLETS.treasury) {
        if (rawUluna >= CHAT_AMT*(1-TOL) && rawUluna <= CHAT_AMT*(1+TOL))
          label = 'Chat';
        else if (rawUluna >= QA_TREASURY_AMT*(1-TOL) && rawUluna <= QA_TREASURY_AMT*(1+TOL))
          label = 'Q&A - Treasury';
        else if (memo && memo.toLowerCase().includes('daily'))
          label = 'Oracle Draw - Daily (10%)';
        else if (memo && memo.toLowerCase().includes('weekly'))
          label = 'Oracle Draw - Weekly (10%)';
        else
          label = memo || 'Transfer';
      } else if (wallet === T_WALLETS.weekly) {
        if (rawUluna >= QA_WEEKLY_AMT*(1-TOL) && rawUluna <= QA_WEEKLY_AMT*(1+TOL))
          label = 'Q&A - Weekly Pool';
        else if (rawUluna >= DRAW_NFT_MIN)
          label = 'Oracle Draw - Weekly NFT';
        else
          label = memo || 'Transfer';
      } else if (wallet === T_WALLETS.daily) {
        if (rawUluna >= DRAW_NFT_MIN)
          label = 'Oracle Draw - Daily NFT';
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
          <a href="https://finder.terraclassic.community/columbus-5/tx/${tx.hash}" target="_blank"
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
