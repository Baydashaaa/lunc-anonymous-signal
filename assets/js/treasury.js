// ─── TREASURY MODULE · terra-oracle ──────────────────────────
const T_WALLETS = {
  treasury: 'terra1549z8zd9hkggzlwf0rcuszhc9rs9fxqfy2kagt',
  daily:    'terra1amp68zg7vph3nq84ummnfma4dz753ezxfqa9px',
  weekly:   'terra1p5l6q95kfl3hes7edy76tywav9f79n6xlkz6qz',
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
async function tLoadRecentTxs() {
  const el = document.getElementById('t-recent-txs');
  if (!el) return;
  try {
    const url = `${T_LCD[0]}/cosmos/tx/v1beta1/txs?events=transfer.recipient%3D%27${T_WALLETS.treasury}%27&pagination.limit=8&order_by=ORDER_BY_DESC`;
    const r = await fetch(url);
    if (!r.ok) throw new Error();
    const data = await r.json();
    if (!data.txs||!data.txs.length) {
      el.innerHTML='<div style="text-align:center;color:var(--muted);padding:20px;font-size:12px;">No transactions yet</div>';
      return;
    }
    el.innerHTML = data.txs.map(tx => {
      const ts   = tx.timestamp ? new Date(tx.timestamp).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
      const memo = tx.tx?.body?.memo || tx.tx?.value?.memo || '';
      const hash = tx.txhash || '';
      const msgs = tx.tx?.body?.messages || tx.tx?.value?.msg || [];
      let amount = '';
      for (const msg of msgs) {
        const coins = msg.amount||[];
        const lunc = Array.isArray(coins)?coins.find(c=>c.denom==='uluna'):null;
        if (lunc) { amount = tFmt(parseInt(lunc.amount)); break; }
      }
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);gap:12px;">
        <div style="min-width:0;flex:1;">
          <div style="font-size:11px;color:var(--text);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${memo||'Transfer'}</div>
          <div style="font-size:10px;color:var(--muted);">${ts}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
          ${amount?`<span style="font-size:11px;font-weight:700;color:#66ffaa;font-family:'Rajdhani',sans-serif;">+${amount}</span>`:''}
          <a href="https://finder.terraclassic.community/columbus-5/tx/${hash}" target="_blank"
            style="font-size:9px;color:var(--accent);text-decoration:none;background:rgba(84,147,247,0.08);border:1px solid rgba(84,147,247,0.2);border-radius:5px;padding:3px 8px;white-space:nowrap;">
            🔗 ${hash.slice(0,8)}...</a>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML='<div style="text-align:center;color:var(--muted);padding:20px;font-size:12px;">Could not load transactions</div>';
  }
}
async function loadTreasuryData() {
  const btn = document.getElementById('t-refresh-btn');
  if (btn) { btn.textContent='⏳ Loading...'; btn.disabled=true; }
  const [price, tB, dB, wB] = await Promise.all([
    tFetchPrice(), tFetchBal(T_WALLETS.treasury),
    tFetchBal(T_WALLETS.daily), tFetchBal(T_WALLETS.weekly),
  ]);
  const setWallet = (balId, usdId, bal) => {
    if (bal!==null) { tSet(balId,tFmt(bal)); tSet(usdId,tFmtUsd(bal,price)); }
    else { tSet(balId,'Error'); tSet(usdId,'Node unreachable'); }
  };
  setWallet('t-oracle-bal','t-oracle-usd',tB);
  setWallet('t-draw-bal',  't-draw-usd',  dB);
  setWallet('t-weekly-bal','t-weekly-usd',wB);
  const total = (tB||0)+(dB||0)+(wB||0);
  tSet('t-total-tvl', tFmt(total));
  tSet('t-total-usd', tFmtUsd(total,price));
  tSet('t-last-updated','Updated '+new Date().toLocaleTimeString());
  if (btn) { btn.textContent='↻ Refresh'; btn.disabled=false; }
  tLoadRecentTxs();
}
function showPage_treasury(e) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  const pg = document.getElementById('page-treasury');
  if (pg) pg.classList.add('active');
  if (history.replaceState) history.replaceState(null,'','#treasury');
  if (typeof smoothScrollTop==='function') smoothScrollTop();
  loadTreasuryData();
  tStartCountdowns();
}
