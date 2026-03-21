// ─── LUNC STATS ───────────────────────────────────────────────
let statsAutoRefreshInterval = null, statsCountdownInterval = null, statsNextRefresh = 0, statsBlockInterval = null, lastBlockNum = 0;

async function refreshLiveBlock() {
  const pg = document.getElementById('page-stats'); if (!pg || !pg.classList.contains('active')) return;
  try { const blockH = await fetchBlockS(); const num = Number(blockH); const el = document.getElementById('live-block'); if (!el) return; if (num !== lastBlockNum) { el.style.color='#ffffff'; el.textContent='⬡ Block #'+num.toLocaleString(); setTimeout(()=>{el.style.color='var(--green)';},200); lastBlockNum=num; } } catch(e) {}
}

function startStatsAutoRefresh() {
  stopStatsAutoRefresh(); statsNextRefresh = Date.now() + 30000; startStatsAutoRefresh._valTick = 0;
  statsBlockInterval = setInterval(refreshLiveBlock, 6000);
  statsCountdownInterval = setInterval(() => { const el=document.getElementById('updated-time'); if(!el) return; const s=Math.max(0,Math.round((statsNextRefresh-Date.now())/1000)); el.textContent=(el.dataset.lastUpdate||'')+(s>0?' · 🔄 '+s+'s':' · updating...'); }, 1000);
  statsAutoRefreshInterval = setInterval(() => { const pg=document.getElementById('page-stats'); if(!pg||!pg.classList.contains('active')) return; statsNextRefresh=Date.now()+30000; loadStatsData(); loadOraclePoolS(); startStatsAutoRefresh._valTick=(startStatsAutoRefresh._valTick||0)+1; if(startStatsAutoRefresh._valTick%2===0) loadValidatorsS(); const el=document.getElementById('updated-time'); if(el) el.dataset.lastUpdate='Updated '+new Date().toLocaleTimeString(); }, 30000);
}
function stopStatsAutoRefresh() { if(statsAutoRefreshInterval){clearInterval(statsAutoRefreshInterval);statsAutoRefreshInterval=null;} if(statsCountdownInterval){clearInterval(statsCountdownInterval);statsCountdownInterval=null;} if(statsBlockInterval){clearInterval(statsBlockInterval);statsBlockInterval=null;} }

function showPage_stats(e) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-stats').classList.add('active');
  if (history.replaceState) history.replaceState(null, '', '#stats');
  smoothScrollTop(); loadValidatorsS(); loadAllStats(); startStatsAutoRefresh(); startBinanceCountdown();
}

const LCD_S  = 'https://lcd.terra-classic.hexxagon.io';
const LCD_S2 = 'https://terra-classic-lcd.publicnode.com';
// FIX 3: ORACLE_POOL_ADDR исправлен — теперь совпадает с ORACLE_WALLET
const ORACLE_POOL_ADDR = 'terra1jgp27m8fykex4e4jtt0l7ze8q528ux2lh4zh0f'; // oracle module

let allValidators = [], valFilter = 'active', valPage = 1;
const VAL_PER_PAGE = 20;

function fmtS(n) { if(n>=1e12) return (n/1e12).toFixed(3)+'T'; if(n>=1e9) return (n/1e9).toFixed(2)+'B'; if(n>=1e6) return (n/1e6).toFixed(2)+'M'; if(n>=1e3) return (n/1e3).toFixed(1)+'K'; return n.toFixed(0); }
function fmtFull(n) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function setTxt(id, val) { const el=document.getElementById(id); if(el){el.textContent=val;el.classList.remove('pulse');} }

async function tryFetchS(url, timeout=5000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
  try { const r = await fetch(url, { signal: controller.signal }); clearTimeout(timer); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }
  catch(e) { clearTimeout(timer); throw e; }
}
async function lcdS(path) { return Promise.any([tryFetchS(LCD_S+path,7000), tryFetchS(LCD_S2+path,7000)]); }

async function fetchSupplyS() {
  const [luncData, ustcData] = await Promise.all([lcdS('/cosmos/bank/v1beta1/supply/by_denom?denom=uluna'), lcdS('/cosmos/bank/v1beta1/supply/by_denom?denom=uusd')]);
  return { lunc: luncData.amount ? Number(luncData.amount.amount)/1e6 : 0, ustc: ustcData.amount ? Number(ustcData.amount.amount)/1e6 : 0 };
}
async function fetchStakingS() { const data = await lcdS('/cosmos/staking/v1beta1/pool'); return { bonded: data.pool ? Number(data.pool.bonded_tokens)/1e6 : 0 }; }
async function fetchBlockS() { const data = await lcdS('/cosmos/base/tendermint/v1beta1/blocks/latest'); return data.block?.header?.height || '—'; }

async function loadStatsData() {
  try {
    const [supply, staking, blockH] = await Promise.all([fetchSupplyS(), fetchStakingS(), fetchBlockS()]);
    const ratio = supply.lunc > 0 ? (staking.bonded / supply.lunc * 100).toFixed(2) : '0';
    setTxt('sc-lunc', fmtS(supply.lunc)); setTxt('sc-lunc-note', '↓ Burn tax active');
    setTxt('sc-ustc', fmtS(supply.ustc)); setTxt('sc-ustc-note', '↓ Arb burn');
    setTxt('sc-staked', fmtS(staking.bonded)); setTxt('sc-staked-note', 'bonded & earning');
    setTxt('sc-ratio', ratio+'%'); setTxt('sc-blocktime', '5.97');
    setTxt('lunc-big', fmtFull(supply.lunc)+' LUNC'); setTxt('staked-cur', fmtFull(staking.bonded)); setTxt('staked-ratio-cur', ratio+'%');
    setTxt('live-block', '⬡ Block #'+Number(blockH).toLocaleString());
    drawSupplyChartS(supply.lunc, supply.ustc); drawStakedChartS(staking.bonded, parseFloat(ratio));
  } catch(e) { setTxt('live-block', '⚠ LCD unavailable'); }
}

async function loadOraclePoolS() {
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/Baydashaaa/lunc-anonymous-signal/main/assets/data/oracle-pool.json?t=' + Date.now()
    );
    if (!res.ok) return;
    const data = await res.json();
    const luncVal = data.lunc || 0;
    const ustcVal = data.ustc || 0;

    // Use prices from JSON (updated by GitHub Actions) or fallback
    const luncPrice = data.lunc_price || 0.000042;
    const ustcPrice = data.ustc_price || 0.005;
    const luncUSD = luncVal * luncPrice;
    const ustcUSD = ustcVal * ustcPrice;

    if (luncVal > 0) {
      setTxt('oracle-lunc', fmtFull(luncVal));
      setTxt('oracle-lunc-pie', fmtFull(luncVal) + ' LUNC');
      setTxt('oracle-lunc-usd', '≈ $' + fmtFull(Math.round(luncUSD)));
    }
    if (ustcVal > 0) {
      setTxt('oracle-ustc', fmtFull(ustcVal));
      setTxt('oracle-ustc-pie', fmtFull(ustcVal) + ' USTC');
      setTxt('oracle-ustc-usd', '≈ $' + fmtFull(Math.round(ustcUSD)));
      setTxt('oracle-total-pie', '≈ $' + fmtFull(Math.round(luncUSD + ustcUSD)));
    }
    drawOracleChartS(luncUSD, ustcUSD);
    loadPoolHistory();
  } catch {}
}

let _poolHistoryPeriod = '7d';

function setPoolHistoryPeriod(p) {
  _poolHistoryPeriod = p;
  ['7d','1m','all'].forEach(id => {
    const el = document.getElementById('ph-' + id);
    if (el) el.classList.toggle('active-tf', id === p);
  });
  drawPoolHistoryChart();
}

async function loadPoolHistory() {
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/Baydashaaa/lunc-anonymous-signal/main/assets/data/oracle-pool.json?t=' + Date.now()
    );
    if (!res.ok) return;
    const data = await res.json();
    window._poolHistory = data.history || [];
    drawPoolHistoryChart();
  } catch {}
}

function drawPoolHistoryChart() {
  const canvas = document.getElementById('poolHistoryChart');
  const msg = document.getElementById('pool-history-msg');
  if (!canvas) return;

  let history = window._poolHistory || [];

  const now = new Date();
  if (_poolHistoryPeriod === '7d') {
    const cutoff = new Date(now - 7 * 86400000).toISOString().slice(0,10);
    history = history.filter(h => h.date >= cutoff);
  } else if (_poolHistoryPeriod === '1m') {
    const cutoff = new Date(now - 30 * 86400000).toISOString().slice(0,10);
    history = history.filter(h => h.date >= cutoff);
  }

  if (history.length < 2) {
    if (msg) msg.style.display = 'block';
    canvas.style.display = 'none';
    return;
  }
  if (msg) msg.style.display = 'none';
  canvas.style.display = 'block';

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.parentElement.clientWidth || 600;
  const h = 140;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const pad = { l: 62, r: 62, t: 14, b: 28 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const n = history.length;

  const luncData = history.map(h => h.lunc);
  const ustcData = history.map(h => h.ustc);

  // Dual Y-axis ranges
  const lMin = Math.min(...luncData) * 0.997;
  const lMax = Math.max(...luncData) * 1.003;
  const uMin = Math.min(...ustcData) * 0.997;
  const uMax = Math.max(...ustcData) * 1.003;

  const toX = i => pad.l + (i / (n - 1)) * cw;
  const toLY = v => pad.t + (1 - (v - lMin) / (lMax - lMin + 0.001)) * ch;
  const toUY = v => pad.t + (1 - (v - uMin) / (uMax - uMin + 0.001)) * ch;

  // Grid
  ctx.strokeStyle = 'rgba(30,51,88,0.5)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = pad.t + (ch / 3) * i;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
  }

  // LUNC fill
  ctx.beginPath();
  luncData.forEach((v, i) => { i === 0 ? ctx.moveTo(toX(i), toLY(v)) : ctx.lineTo(toX(i), toLY(v)); });
  ctx.lineTo(toX(n-1), pad.t + ch);
  ctx.lineTo(toX(0), pad.t + ch);
  ctx.closePath();
  const lGrad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
  lGrad.addColorStop(0, 'rgba(102,255,170,0.18)');
  lGrad.addColorStop(1, 'rgba(102,255,170,0)');
  ctx.fillStyle = lGrad; ctx.fill();

  // LUNC line
  ctx.beginPath();
  luncData.forEach((v, i) => { i === 0 ? ctx.moveTo(toX(i), toLY(v)) : ctx.lineTo(toX(i), toLY(v)); });
  ctx.strokeStyle = '#66ffaa'; ctx.lineWidth = 2;
  ctx.shadowColor = '#66ffaa'; ctx.shadowBlur = 5;
  ctx.stroke(); ctx.shadowBlur = 0;

  // USTC fill
  ctx.beginPath();
  ustcData.forEach((v, i) => { i === 0 ? ctx.moveTo(toX(i), toUY(v)) : ctx.lineTo(toX(i), toUY(v)); });
  ctx.lineTo(toX(n-1), pad.t + ch);
  ctx.lineTo(toX(0), pad.t + ch);
  ctx.closePath();
  const uGrad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
  uGrad.addColorStop(0, 'rgba(84,147,247,0.15)');
  uGrad.addColorStop(1, 'rgba(84,147,247,0)');
  ctx.fillStyle = uGrad; ctx.fill();

  // USTC line
  ctx.beginPath();
  ustcData.forEach((v, i) => { i === 0 ? ctx.moveTo(toX(i), toUY(v)) : ctx.lineTo(toX(i), toUY(v)); });
  ctx.strokeStyle = '#5493f7'; ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.shadowColor = '#5493f7'; ctx.shadowBlur = 5;
  ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;

  // Y axis left — LUNC
  ctx.fillStyle = '#66ffaa'; ctx.font = '9px Exo 2'; ctx.textAlign = 'right';
  ctx.fillText(fmtS(lMax), pad.l - 4, pad.t + 8);
  ctx.fillText(fmtS(lMin), pad.l - 4, pad.t + ch);

  // Y axis right — USTC
  ctx.fillStyle = '#5493f7'; ctx.textAlign = 'left';
  ctx.fillText(fmtS(uMax), pad.l + cw + 4, pad.t + 8);
  ctx.fillText(fmtS(uMin), pad.l + cw + 4, pad.t + ch);

  // X axis labels
  ctx.fillStyle = 'rgba(122,158,196,0.5)'; ctx.textAlign = 'center'; ctx.font = '9px Exo 2';
  const step = Math.max(1, Math.floor(n / 5));
  for (let i = 0; i < n; i += step) {
    ctx.fillText(history[i].date.slice(5), toX(i), h - 6);
  }

  // ── Tooltip on hover ──
  canvas._phHistory = history;
  canvas._phToX = toX;
  canvas._phToLY = toLY;
  canvas._phToUY = toUY;
  canvas._phPad = pad;
  canvas._phN = n;
  canvas._phW = w;
  canvas._phCW = cw;

  if (drawPoolHistoryChart._redrawOnly) return;

  if (!canvas._phBound) {
    canvas._phBound = true;

    function drawCrosshair(mx) {
      const history = canvas._phHistory;
      const pad = canvas._phPad;
      const cw = canvas._phCW;
      const n = canvas._phN;
      if (!history || !n) return;

      const idx = Math.round(Math.max(0, Math.min(n-1, (mx - pad.l) / cw * (n-1))));
      const d = history[idx];
      if (!d) return;

      // Redraw chart
      drawPoolHistoryChart._redrawOnly = true;
      drawPoolHistoryChart();
      drawPoolHistoryChart._redrawOnly = false;

      const dpr = window.devicePixelRatio || 1;
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.scale(dpr, dpr);

      const x = pad.l + (idx / (n-1)) * cw;
      const h = canvas.height / dpr;

      // Vertical crosshair line
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, h - pad.b);
      ctx.stroke();
      ctx.setLineDash([]);

      // LUNC dot
      const ly = canvas._phToLY(d.lunc);
      ctx.beginPath();
      ctx.arc(x, ly, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#66ffaa';
      ctx.shadowColor = '#66ffaa';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // USTC dot
      const uy = canvas._phToUY(d.ustc);
      ctx.beginPath();
      ctx.arc(x, uy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#5493f7';
      ctx.shadowColor = '#5493f7';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.restore();

      // Tooltip
      const tip = document.getElementById('pool-tooltip');
      if (tip) {
        tip.innerHTML = `<span style="color:var(--muted)">${d.date}</span> &nbsp;
          <span style="color:#66ffaa">LUNC: ${d.lunc.toLocaleString('en-US', {maximumFractionDigits:0})}</span> &nbsp;
          <span style="color:#5493f7">USTC: ${d.ustc.toLocaleString('en-US', {maximumFractionDigits:0})}</span>`;
      }
    }

    canvas.addEventListener('mousemove', function(e) {
      const rect = canvas.getBoundingClientRect();
      drawCrosshair(e.clientX - rect.left);
    });

    canvas.addEventListener('mouseleave', function() {
      drawPoolHistoryChart._redrawOnly = true;
      drawPoolHistoryChart();
      drawPoolHistoryChart._redrawOnly = false;
      const tip = document.getElementById('pool-tooltip');
      if (tip) tip.innerHTML = '';
    });
  }
}


// ============================================================
// BURN HISTORY CHART
// ============================================================
const BURN_HISTORY_URL = 'https://raw.githubusercontent.com/Baydashaaa/lunc-anonymous-signal/main/assets/data/burn_history.json';

window._burnHistoryData = null;
let _burnPeriod = '30d';

async function loadBurnHistory() {
  const canvas = document.getElementById('burnHistoryChart');
  const msg = document.getElementById('burnHistoryMsg');
  const tabs = document.querySelectorAll('.burn-tab');
  if (!canvas) return;

  try {
    if (!_burnHistoryData) {
      const res = await fetch(BURN_HISTORY_URL + '?t=' + Date.now());
      if (!res.ok) throw new Error('not found');
      _burnHistoryData = await res.json();
    }
    drawBurnHistoryChart(_burnPeriod);
  } catch(e) {
    if (msg) { msg.style.display = 'block'; msg.textContent = 'Burn history not available yet — bootstrap in progress'; }
    canvas.style.display = 'none';
  }
}

function setBurnPeriod(p) {
  _burnPeriod = p;
  document.querySelectorAll('.burn-tab').forEach(t => {
    const isActive = t.dataset.period === p;
    t.classList.toggle('active-tf', isActive);
    t.classList.toggle('active', isActive);
  });
  if (_burnHistoryData) drawBurnHistoryChart(p);
}

let _burnChart = null;        // lightweight-charts instance
let _burnSeries = null;       // histogram series
let _burnCapLine = null;      // optional marker line for capped outliers

function drawBurnHistoryChart(period) {
  // ── container ──────────────────────────────────────────────────────────────
  const wrap = document.getElementById('burnHistoryWrap');   // outer div
  const container = document.getElementById('burnHistoryChart'); // chart div
  if (!container || !wrap) return;

  // ── filter data by period ─────────────────────────────────────────────────
  const now = Math.floor(Date.now() / 1000);
  // support both lower and upper case period keys
  const cutoffs = { '7d': 7, '30d': 30, '3m': 90, '6m': 180, 'all': 99999,
                    '7D': 7, '30D': 30, '3M': 90, '6M': 180, 'ALL': 99999 };
  const days = cutoffs[period] || 99999;
  const since = now - days * 86400;

  const raw = (_burnHistoryData?.daily || window.burnHistoryData || []).filter(d => {
    // parse "YYYY-MM-DD" safely without timezone issues
    const [y, m, dd] = d.date.split('-').map(Number);
    const ts = Math.floor(Date.UTC(y, m - 1, dd) / 1000);
    return ts >= since;
  });

  if (!raw.length) {
    container.innerHTML = '<p style="color:#666;padding:20px">No data for period</p>';
    return;
  }

  // ── outlier cap (Binance spike etc.) ──────────────────────────────────────
  const values = raw.map(d => d.burn).sort((a, b) => a - b);
  const p99idx = Math.floor(values.length * 0.99);
  const cap    = values[p99idx] * 1.5;
  const outliers = raw.filter(d => d.burn > cap);

  // ── build lightweight-charts data ─────────────────────────────────────────
  // lightweight-charts Day format expects "YYYY-MM-DD" string directly
  const chartData = raw.map(d => ({
    time:  d.date,                       // "YYYY-MM-DD" — correct Day format
    value: Math.min(d.burn, cap),
    color: d.burn > cap ? '#ff4444' : undefined,
  }));

  // ── destroy & recreate chart on period change ─────────────────────────────
  if (_burnChart) {
    _burnChart.remove();
    _burnChart = null;
    _burnSeries = null;
  }

  container.style.position = 'relative';
  container.innerHTML = '';   // clear any old content

  // ── chart options ─────────────────────────────────────────────────────────
  _burnChart = LightweightCharts.createChart(container, {
    width:  container.clientWidth  || 600,
    height: container.clientHeight || 260,
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor:  '#8ab4d0',
    },
    grid: {
      vertLines:  { color: '#1a2e44', style: 1 },
      horzLines:  { color: '#1a2e44', style: 1 },
    },
    rightPriceScale: {
      borderColor: '#1e3a55',
      scaleMargins: { top: 0.08, bottom: 0.02 },
    },
    timeScale: {
      borderColor:      '#1e3a55',
      timeVisible:      true,
      secondsVisible:   false,
      tickMarkFormatter: (time) => {
        // time is "YYYY-MM-DD" string in Day mode
        const [y, m, d] = String(time).split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Magnet,
      vertLine: { color: '#ff6b2b', width: 1, style: 2 },
      horzLine: { color: '#ff6b2b', width: 1, style: 2 },
    },
    localization: {
      priceFormatter: (v) => fmtLUNC(v),  // see helper below
    },
    handleScroll:  { mouseWheel: false, pressedMouseMove: true },
    handleScale:   { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
  });

  // ── histogram series ──────────────────────────────────────────────────────
  _burnSeries = _burnChart.addHistogramSeries({
    color:           '#ff6b2b',   // default bar colour (overridden per-bar if needed)
    priceFormat: {
      type:      'custom',
      formatter: (v) => fmtLUNC(v),
    },
    priceLineVisible: false,
    lastValueVisible: false,
  });

  _burnSeries.setData(chartData);

  // ── outlier marker lines ──────────────────────────────────────────────────
  if (outliers.length) {
    // Add a price-line at the cap value so user sees where bars are clipped
    _burnSeries.createPriceLine({
      price:     cap,
      color:     '#ff4444',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      title:     `⚡ spike capped (${outliers.map(o => o.date).join(', ')})`,
      axisLabelVisible: false,
    });
  }

  // ── tooltip ───────────────────────────────────────────────────────────────
  const tooltip = document.createElement('div');
  tooltip.style.cssText = `
    position:absolute;top:8px;left:12px;z-index:10;
    background:rgba(10,20,40,0.92);border:1px solid #1e4060;
    border-radius:6px;padding:6px 10px;font-size:12px;color:#8ab4d0;
    pointer-events:none;display:none;line-height:1.6;
  `;
  container.appendChild(tooltip);

  _burnChart.subscribeCrosshairMove((param) => {
    if (!param.time || !param.seriesData) {
      tooltip.style.display = 'none';
      return;
    }
    const val = param.seriesData.get(_burnSeries);
    if (!val) { tooltip.style.display = 'none'; return; }

    const timeStr = String(param.time); // "YYYY-MM-DD"
    const [y, m, dd] = timeStr.split('-').map(Number);
    const label = new Date(Date.UTC(y, m - 1, dd))
      .toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
    const real = raw.find(r => r.date === timeStr) || { burn: val.value };
    const isOut = real.burn > cap;

    tooltip.innerHTML = `
      <span style="color:#ff6b2b">🔥 ${label}</span><br>
      <b style="color:#fff">${fmtLUNC(real.burn)} LUNC</b>
      ${isOut ? '<br><span style="color:#ff4444;font-size:11px">⚡ outlier — bar capped</span>' : ''}
    `;
    tooltip.style.display = 'block';
  });

  // ── responsive resize ─────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    if (_burnChart) {
      _burnChart.applyOptions({ width: container.clientWidth });
    }
  });
  ro.observe(container);

  // ── visible range: show last N bars by default ────────────────────────────
  _burnChart.timeScale().fitContent();

  // ── summary stats ─────────────────────────────────────────────────────────
  const totalBurned = raw.reduce((s, d) => s + d.burn, 0);
  const el = document.getElementById('burn-history-total');
  if (el) el.textContent = `🔥 Total burned (${period}): ${fmtLUNC(totalBurned)} LUNC`;
}

// ── HELPER: Y-axis / tooltip formatter ────────────────────────────────────────
// Produces "276.6M", "1.23B", "45.2K" — no "KM" bug
function fmtLUNC(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9)  return (v / 1e9).toFixed(2)  + 'B';
  if (abs >= 1e6)  return (v / 1e6).toFixed(1)  + 'M';
  if (abs >= 1e3)  return (v / 1e3).toFixed(1)  + 'K';
  return v.toFixed(0);
}

async function loadValidatorsS() {
  try {
    const BASE = 'https://lcd.terra-classic.hexxagon.io';
    let all = [], nextKey = null, attempts = 0;
    do {
      let url = `${BASE}/cosmos/staking/v1beta1/validators?pagination.limit=100`;
      if (nextKey) url += `&pagination.key=${encodeURIComponent(nextKey)}`;
      const r = await Promise.race([fetch(url), new Promise((_,rej) => setTimeout(()=>rej(new Error('timeout')),8000))]);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      all = all.concat(d.validators || []);
      nextKey = d.pagination?.next_key || null;
      attempts++;
    } while (nextKey && attempts < 10);
    if (!all.length) throw new Error('empty');
    allValidators = all.sort((a,b) => Number(b.tokens)-Number(a.tokens));
    setTxt('sc-vals', allValidators.filter(v => v.status==='BOND_STATUS_BONDED').length);
    renderValidatorsS();
  } catch(e) { const tb=document.getElementById('validators-tbody'); if(tb) tb.innerHTML='<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--muted);">Could not load validators</td></tr>'; }
}

function filterValidators(f) { valFilter=f; valPage=1; ['active','inactive','all'].forEach(id=>{const el=document.getElementById('vf-'+id);if(el)el.classList.toggle('active-vf',id===f);}); renderValidatorsS(); }

function renderValidatorsS() {
  let list = allValidators;
  if (valFilter==='active') list=allValidators.filter(v=>v.status==='BOND_STATUS_BONDED');
  if (valFilter==='inactive') list=allValidators.filter(v=>v.status!=='BOND_STATUS_BONDED');
  const searchVal=(document.getElementById('val-search')?.value||'').trim().toLowerCase();
  if (searchVal) list=list.filter(v=>(v.description?.moniker||'').toLowerCase().includes(searchVal));
  setTxt('val-title', list.length+' Validators ('+valFilter+')');
  const totalBonded=allValidators.filter(v=>v.status==='BOND_STATUS_BONDED').reduce((s,v)=>s+Number(v.tokens),0);
  const pages=Math.ceil(list.length/VAL_PER_PAGE), slice=list.slice((valPage-1)*VAL_PER_PAGE,valPage*VAL_PER_PAGE), offset=(valPage-1)*VAL_PER_PAGE;
  const tbody=document.getElementById('validators-tbody');
  if (!slice.length) { tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted);">No validators found</td></tr>'; return; }
  tbody.innerHTML = slice.map((v,i) => {
    const tokens=Number(v.tokens)/1e6, pct=totalBonded>0?(Number(v.tokens)/totalBonded*100).toFixed(2):'0.00';
    const commission=(Number(v.commission?.commission_rates?.rate||0)*100).toFixed(2);
    const name=(v.description?.moniker||'Unknown').slice(0,30), isActive=v.status==='BOND_STATUS_BONDED', isJailed=v.jailed;
    const avatarId='val-avatar-'+(offset+i);
    let badge, cls;
    if (isJailed){badge='⚠ Jailed';cls='badge-jailed';} else if (isActive){badge='● Active';cls='badge-active';} else {badge='× Inactive';cls='badge-inactive';}
    return `<tr class="val-row"><td style="color:var(--muted);font-size:11px;">${offset+i+1}</td><td class="val-name"><div style="display:flex;align-items:center;gap:9px;"><div style="width:28px;height:28px;border-radius:50%;overflow:hidden;flex-shrink:0;background:rgba(84,147,247,0.12);border:1px solid rgba(84,147,247,0.2);display:flex;align-items:center;justify-content:center;"><img id="${avatarId}" src="" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:none;" onerror="this.style.display='none';"><span style="font-size:11px;color:var(--muted);">${name.charAt(0).toUpperCase()}</span></div><span>${name}${name.length>=30?'…':''}</span></div></td><td class="val-power"><span style="color:var(--text);">${fmtS(tokens)}</span><br><span style="font-size:10px;color:var(--muted);">${pct}%</span></td><td class="val-comm">${commission}%</td><td class="val-status"><span class="${cls}">${badge}</span></td></tr>`;
  }).join('');
  slice.forEach((v,i) => { const identity=v.description?.identity||''; if(!identity) return; const imgEl=document.getElementById('val-avatar-'+(offset+i)); if(!imgEl) return; fetch(`https://keybase.io/_/api/1.0/user/lookup.json?key_suffix=${identity}&fields=pictures`).then(r=>r.json()).then(data=>{const url=data?.them?.[0]?.pictures?.primary?.url; if(url&&imgEl){imgEl.src=url;imgEl.style.display='block';const p=imgEl.nextElementSibling;if(p)p.style.display='none';}}).catch(()=>{}); });
  const pg=document.getElementById('val-pagination'); if(pages<=1){pg.innerHTML='';return;} let html=''; for(let p=1;p<=pages;p++) html+=`<button class="pg-btn${p===valPage?' active-pg':''}" onclick="setValPageS(${p})">${p}</button>`; pg.innerHTML=html;
}

function setValPageS(p) { valPage=p; renderValidatorsS(); }

// ─── CHARTS ───────────────────────────────────────────────────
function resolveCanvasS(id, h) {
  const el=document.getElementById(id); if(!el) return null;
  const dpr=window.devicePixelRatio||1, w=el.parentElement.clientWidth||800;
  el.width=w*dpr; el.height=h*dpr; el.style.width=w+'px'; el.style.height=h+'px';
  const ctx=el.getContext('2d'); ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);
  return {ctx,w,h};
}
function drawLineS(ctx, data, pad, cw, ch, min, max, color, lineW=2) {
  if (!data.length) return;
  ctx.beginPath();
  data.forEach((v,i)=>{ const x=pad.l+(i/(data.length-1))*cw, y=pad.t+(1-(v-min)/(max-min+0.0001))*ch; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
  ctx.strokeStyle=color; ctx.lineWidth=lineW; ctx.shadowColor=color; ctx.shadowBlur=8; ctx.stroke(); ctx.shadowBlur=0;
}

let currentSupplyPeriod='1h', supplyChartCache={}, currentChartMode='combined';
// setChartMode removed — unused

const TF_CONFIG = {
  '1h': { endpoint:'histohour', limit:48, secPerCandle:3600, label:'1h' },
  '4h': { endpoint:'histohour', limit:336, secPerCandle:3600, label:'4h', groupBy:4 },
  'D':  { endpoint:'histoday',  limit:30, secPerCandle:86400, label:'D' },
  'W':  { endpoint:'histoday',  limit:364, secPerCandle:86400, label:'W', groupBy:7 },
  'M':  { endpoint:'histoday',  limit:730, secPerCandle:86400, label:'M', groupBy:30 },
};

const DAILY_BURN = 16_500_000;
const BINANCE_BURN_DEST = 'terra1sk06e3dyexuq4shw77y3dsv480xv42mq73anxu';
const MIN_BINANCE_BURN_ULUNA = 50_000_000_000_000;
let _binanceBurnsCache = null, _binanceBurnsCacheTs = 0;
const BINANCE_BURN_CACHE_MS = 60 * 60 * 1000;

async function fetchBinanceBurnsFromChain() {
  if (_binanceBurnsCache && Date.now() - _binanceBurnsCacheTs < BINANCE_BURN_CACHE_MS) return _binanceBurnsCache;

  // Hardcoded historical data (fallback for dates before on-chain detection started)
  const HISTORICAL_BURNS = [
    { ts: new Date('2022-10-03').getTime()/1000, amount: 5_570_000_000 },
    { ts: new Date('2022-10-10').getTime()/1000, amount: 2_300_000_000 },
    { ts: new Date('2022-10-17').getTime()/1000, amount: 1_900_000_000 },
    { ts: new Date('2022-10-24').getTime()/1000, amount: 1_500_000_000 },
    { ts: new Date('2022-10-31').getTime()/1000, amount: 1_200_000_000 },
    { ts: new Date('2022-12-01').getTime()/1000, amount: 6_390_000_000 },
    { ts: new Date('2023-03-02').getTime()/1000, amount: 8_850_000_000 },
    { ts: new Date('2023-04-01').getTime()/1000, amount: 3_500_000_000 },
    { ts: new Date('2023-05-01').getTime()/1000, amount: 2_800_000_000 },
    { ts: new Date('2023-06-01').getTime()/1000, amount: 2_200_000_000 },
    { ts: new Date('2023-07-01').getTime()/1000, amount: 1_900_000_000 },
    { ts: new Date('2023-08-01').getTime()/1000, amount: 1_600_000_000 },
    { ts: new Date('2023-09-01').getTime()/1000, amount: 1_300_000_000 },
    { ts: new Date('2023-10-01').getTime()/1000, amount: 1_100_000_000 },
    { ts: new Date('2023-11-01').getTime()/1000, amount:   760_000_000 },
    { ts: new Date('2023-12-01').getTime()/1000, amount: 3_900_000_000 },
    { ts: new Date('2024-01-01').getTime()/1000, amount: 1_600_000_000 },
    { ts: new Date('2024-02-01').getTime()/1000, amount: 1_350_000_000 },
    { ts: new Date('2024-03-01').getTime()/1000, amount: 2_000_000_000 },
    { ts: new Date('2024-04-01').getTime()/1000, amount: 4_170_000_000 },
    { ts: new Date('2024-05-01').getTime()/1000, amount: 1_400_000_000 },
    { ts: new Date('2024-06-01').getTime()/1000, amount: 1_350_000_000 },
    { ts: new Date('2024-07-01').getTime()/1000, amount: 1_700_000_000 },
    { ts: new Date('2024-08-01').getTime()/1000, amount:   700_000_000 },
    { ts: new Date('2024-09-01').getTime()/1000, amount:   600_000_000 },
    { ts: new Date('2024-10-01').getTime()/1000, amount: 1_140_000_000 },
    { ts: new Date('2024-11-01').getTime()/1000, amount: 1_030_000_000 },
    { ts: new Date('2024-12-01').getTime()/1000, amount: 1_720_000_000 },
    { ts: new Date('2025-01-01').getTime()/1000, amount: 1_721_471_820 },
    { ts: new Date('2025-02-01').getTime()/1000, amount:   736_146_374 },
    { ts: new Date('2025-03-01').getTime()/1000, amount:   760_172_656 },
    { ts: new Date('2025-04-01').getTime()/1000, amount:   521_961_991 },
    { ts: new Date('2025-05-01').getTime()/1000, amount:   413_653_487 },
    { ts: new Date('2025-06-01').getTime()/1000, amount:   498_530_317 },
    { ts: new Date('2025-07-01').getTime()/1000, amount:   375_565_484 },
    { ts: new Date('2025-08-01').getTime()/1000, amount:   441_100_594 },
    { ts: new Date('2025-09-01').getTime()/1000, amount:   455_227_785 },
    { ts: new Date('2025-10-01').getTime()/1000, amount:   356_538_666 },
    { ts: new Date('2025-11-01').getTime()/1000, amount:   652_627_275 },
    { ts: new Date('2025-12-01').getTime()/1000, amount:   562_133_714 },
    { ts: new Date('2026-01-01').getTime()/1000, amount:   534_000_000 },
    { ts: new Date('2026-02-01').getTime()/1000, amount:   480_000_000 },
    { ts: new Date('2026-03-01').getTime()/1000, amount:   460_000_000 },
  ];

  // Try to load on-chain detected burns from burn_history.json
  try {
    if (_burnHistoryData?.binance_burns?.length) {
      // Build map from on-chain data: date "YYYY-MM-01" → amount
      const onChainMap = {};
      for (const b of _burnHistoryData.binance_burns) {
        onChainMap[b.date] = b.amount;
      }

      // Merge: on-chain overrides hardcode for matching months
      const hardcodeMap = {};
      for (const b of HISTORICAL_BURNS) {
        const d = new Date(b.ts * 1000);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-01`;
        hardcodeMap[key] = b;
      }

      // Override hardcode with on-chain where available
      for (const [date, amount] of Object.entries(onChainMap)) {
        if (hardcodeMap[date]) {
          hardcodeMap[date].amount = amount; // real on-chain value wins
        } else {
          // New month not in hardcode — add it
          const [y, m] = date.split('-').map(Number);
          hardcodeMap[date] = {
            ts: Math.floor(Date.UTC(y, m - 1, 1) / 1000),
            amount
          };
        }
      }

      const merged = Object.values(hardcodeMap).sort((a, b) => a.ts - b.ts);
      _binanceBurnsCache = merged;
      _binanceBurnsCacheTs = Date.now();
      return merged;
    }
  } catch(e) {
    console.warn('Binance burns merge error:', e);
  }

  // Fallback: hardcode only
  _binanceBurnsCache = HISTORICAL_BURNS;
  _binanceBurnsCacheTs = Date.now();
  return HISTORICAL_BURNS;
}



