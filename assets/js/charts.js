function setSupplyPeriod(period) {
  currentSupplyPeriod = period;
  ['1h','4h','D','W','M'].forEach(p => {
    const el = document.getElementById('sp-' + p);
    if (el) el.classList.toggle('active-tf', p === period);
  });
  loadSupplyChart(period);
}

async function loadSupplyChart(period) {
  const cached = supplyChartCache[period];
  if (cached && Date.now() - cached.ts < 90000) {
    renderSupplyChart(cached.data, period); return;
  }
  const loadEl = document.getElementById('supply-chart-loading');
  const wrapEl = document.getElementById('burn-chart-wrap');
  if (loadEl) loadEl.style.display = 'block';
  if (wrapEl) wrapEl.style.display = 'none';

  const cfg = TF_CONFIG[period] || TF_CONFIG['D'];

  try {
    // 1. Get current real supply from LCD
    let currentSupply = 6.466e12;
    try {
      const lcdRes = await Promise.race([
        fetch('https://terra-classic-lcd.publicnode.com/cosmos/bank/v1beta1/supply/uluna'),
        new Promise((_, r) => setTimeout(r, 4000))
      ]);
      if (lcdRes?.ok) {
        const lj = await lcdRes.json();
        const amt = lj?.amount?.amount;
        if (amt) currentSupply = Number(amt) / 1e6;
      }
    } catch {}

    // 2. Make sure burn_history.json is loaded
    if (!window._burnHistoryData) {
      try {
        const r = await fetch(BURN_HISTORY_URL + '?t=' + Date.now());
        if (r.ok) window._burnHistoryData = await r.json();
      } catch {}
    }

    // 3. Build burn lookup from real data
    // For 1h/4h — use hourly array; for D/W/M — use daily array
    const useHourly = (period === '1h' || period === '4h');
    const burnSource = useHourly
      ? (window._burnHistoryData?.hourly || [])
      : (window._burnHistoryData?.daily  || []);

    // Build map: timestamp (start of hour or day in UTC) → burn amount
    const burnMap = {};
    burnSource.forEach(d => {
      if (d.ts) {
        // hourly: "2026-03-17T05" → parse as UTC
        const [datePart, hourPart] = d.ts.split('T');
        const [y, m, dd] = datePart.split('-').map(Number);
        const h = parseInt(hourPart) || 0;
        const ts = Math.floor(Date.UTC(y, m - 1, dd, h) / 1000);
        burnMap[ts] = d.burn || 0;
      } else if (d.date) {
        // daily: "YYYY-MM-DD"
        const [y, m, dd] = d.date.split('-').map(Number);
        const ts = Math.floor(Date.UTC(y, m - 1, dd) / 1000);
        burnMap[ts] = d.burn || 0;
      } else if (d.time) {
        // hourly: unix timestamp
        burnMap[d.time] = d.burn || 0;
      }
    });

    // 4. Fetch CryptoCompare for timestamps (we only use time axis, not volume)
    const url = `https://min-api.cryptocompare.com/data/v2/${cfg.endpoint}?fsym=LUNC&tsym=USD&limit=${cfg.limit}&extraParams=TerraOracle`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (json.Response === 'Error') throw new Error(json.Message);
    let raw = (json.Data?.Data || []).filter(d => d.volumefrom > 0);

    // Group candles for 4h/W/M
    if (period === 'M') {
      const monthMap = {};
      raw.forEach(d => {
        const dt = new Date(d.time * 1000);
        const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}`;
        if (!monthMap[key]) monthMap[key] = { time: Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1)/1000, volumefrom: 0 };
        monthMap[key].volumefrom += d.volumefrom || 0;
      });
      raw = Object.values(monthMap).sort((a, b) => a.time - b.time);
    } else if (cfg.groupBy) {
      const grouped = [];
      for (let i = 0; i < raw.length; i += cfg.groupBy) {
        const slice = raw.slice(i, i + cfg.groupBy);
        if (!slice.length) continue;
        grouped.push({
          time: slice[0].time,
          volumefrom: slice.reduce((s, x) => s + (x.volumefrom || 0), 0),
        });
      }
      raw = grouped;
    }

    if (raw.length < 3) throw new Error('not enough data');

    const actualCandleSec = { '1h': 3600, '4h': 14400, 'D': 86400, 'W': 604800, 'M': 2592000 }[period] || 86400;
    const FALLBACK_DAILY = 16_500_000;

    // 5. Get Binance burns from historical hardcoded data (exact dates only)
    const BINANCE_BURNS = await fetchBinanceBurnsFromChain();

    function getBinanceBurnForCandle(candleTs) {
      const candleEnd = candleTs + actualCandleSec;
      return BINANCE_BURNS
        .filter(b => b.ts >= candleTs && b.ts < candleEnd)
        .reduce((s, b) => s + b.amount, 0);
    }

    // For monthly candles match by calendar month
    function getBinanceBurnMonth(candleTs) {
      const d = new Date(candleTs * 1000);
      const y = d.getUTCFullYear(), m = d.getUTCMonth();
      return BINANCE_BURNS
        .filter(b => {
          const bd = new Date(b.ts * 1000);
          return bd.getUTCFullYear() === y && bd.getUTCMonth() === m;
        })
        .reduce((s, b) => s + b.amount, 0);
    }

    // 6. Get tax burn from burnMap (real on-chain data)
    function getTaxBurn(candleTs) {
      if (useHourly) {
        let total = 0;
        const slots = period === '4h' ? 4 : 1;
        for (let h = 0; h < slots; h++) {
          const slotTs = candleTs + h * 3600;
          const match = Object.keys(burnMap).map(Number).find(t => Math.abs(t - slotTs) < 1800);
          total += match ? burnMap[match] : (FALLBACK_DAILY / 24);
        }
        return total;
      }
      const days = Math.round(actualCandleSec / 86400);
      let total = 0;
      for (let i = 0; i < days; i++) {
        const dayTs = candleTs + i * 86400;
        const dt = new Date(dayTs * 1000);
        const key = Math.floor(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()) / 1000);
        total += burnMap[key] || FALLBACK_DAILY;
      }
      return total;
    }

    // 7. Reconstruct supply backwards from current real LCD value
    const totalBurn = raw.reduce((d) => {
      const tax = getTaxBurn(d.time);
      const bin = period === 'M' ? getBinanceBurnMonth(d.time) : getBinanceBurnForCandle(d.time);
      return tax + bin;
    }, 0);

    // recalculate properly
    const totalBurnReal = raw.reduce((s, d) => {
      const tax = getTaxBurn(d.time);
      const bin = period === 'M' ? getBinanceBurnMonth(d.time) : getBinanceBurnForCandle(d.time);
      return s + tax + bin;
    }, 0);
    let runningSupply = currentSupply + totalBurnReal;

    const candles = raw.map((d) => {
      const open = runningSupply;
      const taxBurn = getTaxBurn(d.time);
      const binanceBurn = period === 'M'
        ? getBinanceBurnMonth(d.time)
        : getBinanceBurnForCandle(d.time);
      const burned = taxBurn + binanceBurn;
      const close = open - burned;
      runningSupply = close;
      return {
        t: d.time * 1000,
        open, close,
        burned,
        taxBurn,
        binanceBurn,
        high: open, low: close,
        closeNoB: open - taxBurn,
      };
    });

    supplyChartCache[period] = { data: candles, ts: Date.now() };
    renderSupplyChart(candles, period);
  } catch(e) {
    console.warn('Supply chart error:', e);
    drawSupplyFallback();
  } finally {
    if (loadEl) loadEl.style.display = 'none';
    if (wrapEl) wrapEl.style.display = 'block';
  }
}

function renderSupplyChart(candles, period) {
  if (!candles.length) return;
  const first = candles[0].close, last = candles[candles.length-1].close;
  const delta = last - first;
  const deltaEl = document.getElementById('supply-delta');
  if (deltaEl) {
    const fmtDelta = v => Math.round(v).toLocaleString('en-US');
    const latest = candles[candles.length - 1];
    const latestBurned = latest.burned;
    const latestDelta = latest.close - latest.open;
    const periodLabels = { '1h':'1h', '4h':'4h', 'D':'24h', 'W':'7d', 'M':'30d' };
    const label = periodLabels[period] || period;
    deltaEl.innerHTML = `<span style="font-size:14px;">🔥</span> <span style="color:#ff6b6b;">${fmtDelta(Math.round(latestBurned))}</span> burned in latest candlestick`;
    deltaEl.style.color = '#aac4d8';
  }
  drawCombinedChart(candles, period);
  setupCandleHover(candles, period);
}

// - COMBINED CHART: Supply bars (top) + Burned bars (bottom) -
// drawBurnedChart / drawCandleChart aliases removed — unused

function drawCombinedChart(candles, period, hoverIdx = -1) {
  const C = resolveCanvasS('supplyChart', 300); if (!C) return;
  const { ctx, w, h } = C;
  ctx.clearRect(0, 0, w, h);

  const pad = { l:110, r:16, t:12, b:28 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;

  // - zones -
  const DIVIDER_RATIO = 0.52;      // supply top 52%, burned bottom 48%
  const supplyH = Math.floor(ch * DIVIDER_RATIO);
  const burnH   = ch - supplyH - 2; // 2px gap for divider
  const supplyTop = pad.t;
  const dividerY  = pad.t + supplyH;
  const burnTop   = dividerY + 2;

  const gap  = cw / candles.length;
  const barW = Math.max(2, Math.min(18, gap * 0.72));

  function fmtY(v) {
    if (Math.abs(v) >= 1e12) {
      // Use enough decimals so adjacent grid lines don't look identical
      const t = v / 1e12;
      return t.toFixed(t >= 10 ? 2 : 3) + 'T';
    }
    if (Math.abs(v) >= 1e9)  return (v/1e9).toFixed(2)+'B';
    if (Math.abs(v) >= 1e6)  return (v/1e6).toFixed(1)+'M';
    return v.toFixed(0);
  }

  // - SUPPLY Y-scale (top zone) -
  // sMax = highest open, sMin = lowest tax-based close (ignoring Binance spikes)
  // This keeps the axis stable even when a Binance batch drops supply 5B in one candle
  const sMax = Math.max(...candles.map(c => c.open));
  const sMin = Math.min(...candles.map(c => c.open - c.taxBurn), candles[candles.length - 1].close);
  const sPad  = (sMax - sMin) * 0.08 || sMax * 0.00005;
  const sLo   = sMin - sPad;
  const sHi   = sMax + sPad;
  const sRange = sHi - sLo || 1;
  const toSupplyY = v => Math.max(supplyTop, Math.min(supplyTop + supplyH, supplyTop + (1 - (v - sLo) / sRange) * supplyH));

  // - BURNED Y-scale (bottom zone) - taxBurn ONLY, Binance shown separately -
  const taxBurnVals = candles.map(c => c.taxBurn).filter(v => v > 0);
  const bMax = (taxBurnVals.length ? Math.max(...taxBurnVals) : 1) * 1.3;
  const toBurnH = v => (Math.min(v, bMax) / bMax) * (burnH - 2);

  // - GRID: Supply (top) -
  ctx.font = '10px Exo 2'; ctx.textAlign = 'right';
  const sGridLines = 4;
  for (let i = 0; i <= sGridLines; i++) {
    const y = supplyTop + (supplyH / sGridLines) * i;
    const v = sHi - sRange * (i / sGridLines);
    ctx.strokeStyle = 'rgba(42,64,96,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
    ctx.fillStyle = '#3a5578';
    ctx.fillText(fmtY(v), pad.l - 4, y + 3);
  }

  // - GRID: Burned (bottom) -
  const bGridLines = 3;
  for (let i = 0; i <= bGridLines; i++) {
    const y = burnTop + (burnH / bGridLines) * (bGridLines - i);
    ctx.strokeStyle = 'rgba(30,100,60,0.25)'; ctx.lineWidth = 1; ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
    ctx.setLineDash([]);
  }

  // - DIVIDER LINE -
  ctx.strokeStyle = 'rgba(42,64,96,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(pad.l, dividerY); ctx.lineTo(pad.l + cw, dividerY); ctx.stroke();

  // - ZONE LABELS (right side) -
  ctx.save();
  ctx.font = 'bold 9px Exo 2'; ctx.textAlign = 'right'; ctx.letterSpacing = '0.06em';
  ctx.fillStyle = 'rgba(255,100,100,0.5)';
  ctx.fillText('SUPPLY', pad.l + cw, supplyTop + 11);
  ctx.fillStyle = 'rgba(30,200,100,0.5)';
  ctx.fillText('BURNED', pad.l + cw, burnTop + 11);
  ctx.restore();

  // - SUPPLY BARS (top zone) -
  candles.forEach((c, i) => {
    const x = pad.l + i * gap + gap / 2;
    const isHover = i === hoverIdx;
    const hasBinance = c.binanceBurn > 0;

    // Bar top = current open (supply at start of candle)
    // Bar bottom = fixed bottom of supply zone
    // This makes bars visually show supply level - taller = more supply remaining
    const barTop  = toSupplyY(c.open);
    const barBot  = supplyTop + supplyH;
    const barHeight = Math.max(1, barBot - barTop);

    const alpha = isHover ? 1 : 0.82;
    const grad = ctx.createLinearGradient(x, barTop, x, barBot);
    if (hasBinance) {
      grad.addColorStop(0, `rgba(255,140,60,${alpha})`);
      grad.addColorStop(0.3, `rgba(220,60,60,${alpha * 0.85})`);
      grad.addColorStop(1, `rgba(140,20,20,${alpha * 0.25})`);
    } else {
      grad.addColorStop(0, `rgba(255,75,75,${alpha * 0.95})`);
      grad.addColorStop(0.5, `rgba(190,35,35,${alpha * 0.7})`);
      grad.addColorStop(1, `rgba(120,15,15,${alpha * 0.18})`);
    }

    if (isHover) { ctx.shadowColor = hasBinance ? '#ff9944' : '#ff4444'; ctx.shadowBlur = 10; }
    ctx.fillStyle = grad;
    ctx.fillRect(x - barW / 2, barTop, barW, barHeight);
    ctx.shadowBlur = 0;

    // Bright cap line at supply level (top of bar)
    ctx.fillStyle = hasBinance ? 'rgba(255,170,80,0.98)' : `rgba(255,90,90,${isHover ? 1 : 0.92})`;
    ctx.fillRect(x - barW / 2, barTop, barW, Math.max(1.5, barW * 0.1));

    // If Binance burn: show orange "notch" at close level showing the drop
    if (hasBinance) {
      const closeY = toSupplyY(c.close);
      const notchH = Math.max(2, closeY - barTop);
      // Orange highlight showing the supply drop from Binance burn
      ctx.fillStyle = 'rgba(255,140,50,0.35)';
      ctx.fillRect(x - barW / 2, barTop, barW, notchH);
    }
  });

  // - BURNED BARS (bottom zone) -
  candles.forEach((c, i) => {
    const x = pad.l + i * gap + gap / 2;
    const isHover = i === hoverIdx;
    const hasBinance = c.binanceBurn > 0;

    // Tax burn bar - normal scale, always visible
    const taxH = Math.max(1, toBurnH(c.taxBurn));
    const taxBt = burnTop + burnH - taxH;
    const grad = ctx.createLinearGradient(x, taxBt, x, burnTop + burnH);
    grad.addColorStop(0, `rgba(30,200,100,${isHover ? 1 : 0.82})`);
    grad.addColorStop(1, `rgba(10,80,40,0.15)`);
    if (isHover) { ctx.shadowColor = '#1ec864'; ctx.shadowBlur = 6; }
    ctx.fillStyle = grad;
    ctx.fillRect(x - barW / 2, taxBt, barW, taxH);
    ctx.shadowBlur = 0;

    // Binance burn - separate orange bar on top of the green bar, capped at zone height
    if (hasBinance) {
      // Show as a % of zone height - max 85% so it's always visible but not overflowing
      const binanceH = Math.min(burnH * 0.85, Math.max(burnH * 0.25, toBurnH(c.binanceBurn * 0.15)));
      const binanceBt = burnTop + burnH - taxH - binanceH;
      const bGrad = ctx.createLinearGradient(x, binanceBt, x, burnTop + burnH - taxH);
      bGrad.addColorStop(0, 'rgba(255,170,60,0.95)');
      bGrad.addColorStop(1, 'rgba(200,100,20,0.3)');
      ctx.fillStyle = bGrad;
      ctx.fillRect(x - barW / 2, Math.max(burnTop, binanceBt), barW, binanceH);
      // Fire emoji above
      ctx.save();
      ctx.font = '11px serif'; ctx.textAlign = 'center'; ctx.globalAlpha = 0.92;
      ctx.fillText('🔥', x, Math.max(burnTop + 12, binanceBt - 1));
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  });

  // - CURRENT SUPPLY LINE (dashed) -
  const lastY = toSupplyY(candles[candles.length - 1].close);
  ctx.strokeStyle = 'rgba(255,100,100,0.25)';
  ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(pad.l, lastY); ctx.lineTo(pad.l + cw, lastY); ctx.stroke();
  ctx.setLineDash([]);

  // - HOVER CROSSHAIR -
  if (hoverIdx >= 0 && hoverIdx < candles.length) {
    const x = pad.l + hoverIdx * gap + gap / 2;
    ctx.strokeStyle = 'rgba(84,147,247,0.35)';
    ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x, supplyTop); ctx.lineTo(x, burnTop + burnH); ctx.stroke();
    ctx.setLineDash([]);

    // Supply dot
    const sy = toSupplyY(candles[hoverIdx].close);
    ctx.beginPath(); ctx.arc(x, sy, 3.5, 0, Math.PI*2);
    ctx.fillStyle = candles[hoverIdx].binanceBurn > 0 ? '#ffaa44' : '#ff6b6b'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  }

  // - X-AXIS -
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  ctx.font = '10px Exo 2'; ctx.textAlign = 'center';
  const drawnX = [];
  const minSp = 56;
  candles.forEach((c, i) => {
    const x = pad.l + i * gap + gap / 2;
    const d = new Date(c.t);
    const prevD = i > 0 ? new Date(candles[i-1].t) : null;
    const isNewMonth = !prevD || prevD.getMonth() !== d.getMonth();
    const isNewYear  = !prevD || prevD.getFullYear() !== d.getFullYear();
    const isNewDay   = !prevD || prevD.getDate() !== d.getDate();
    const hh = d.getHours().toString().padStart(2,'0');
    const day = d.getDate().toString().padStart(2,'0');
    const mon = MONTHS[d.getMonth()];
    const yr2 = String(d.getFullYear()).slice(2);
    let label = null;
    if      (period === 'M') { if (isNewYear)  label = `${mon} '${yr2}`; else if (isNewMonth) label = mon; }
    else if (period === 'W') { if (isNewYear)  label = `${mon} '${yr2}`; else if (isNewMonth) label = mon; }
    else if (period === 'D') { if (isNewYear)  label = `${mon} '${yr2}`; else if (isNewMonth) label = mon; else if (isNewDay) label = `${day} ${mon}`; }
    else if (period === '4h'){ if (isNewMonth) label = `${mon} '${yr2}`; else if (isNewDay)   label = `${day} ${mon}`; }
    else                     { if (isNewDay)   label = `${day} ${mon}`;  else label = `${hh}:00`; }
    if (label && !drawnX.some(px => Math.abs(px - x) < minSp)) {
      drawnX.push(x);
      ctx.fillStyle = '#3a5578';
      ctx.fillText(label, x, h - 14);
    }
  });
  ctx.fillStyle = 'rgba(58,85,120,0.35)'; ctx.font = '9px Exo 2'; ctx.textAlign = 'center';
  ctx.fillText('UTC Time Buckets', pad.l + cw / 2, h - 2);

  // - Moving date pill on X axis -
  if (hoverIdx >= 0 && hoverIdx < candles.length) {
    const hc = candles[hoverIdx];
    const cx = pad.l + hoverIdx * gap + gap / 2;
    const dh = new Date(hc.t);
    const dd2 = dh.getUTCDate().toString().padStart(2,'0');
    const mm2 = (dh.getUTCMonth()+1).toString().padStart(2,'0');
    const yy2 = dh.getUTCFullYear();
    const hh2 = dh.getUTCHours().toString().padStart(2,'0');
    const mn2 = dh.getUTCMinutes().toString().padStart(2,'0');
    const MN  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let xLabel;
    if      (period === 'M')  xLabel = `${MN[dh.getUTCMonth()]} ${yy2}`;
    else if (period === 'W')  xLabel = `${dd2} ${MN[dh.getUTCMonth()]} '${String(yy2).slice(2)}`;
    else if (period === 'D')  xLabel = `${dd2} ${MN[dh.getUTCMonth()]} '${String(yy2).slice(2)}`;
    else if (period === '4h') xLabel = `${dd2} ${MN[dh.getUTCMonth()]} ${hh2}:00`;
    else                      xLabel = `${dd2}.${mm2} ${hh2}:${mn2}`;

    ctx.font = 'bold 10px Exo 2';
    const tw = ctx.measureText(xLabel).width;
    const pw = tw + 14, ph = 14;
    let px = cx - pw / 2;
    px = Math.max(pad.l, Math.min(w - pad.r - pw, px));
    const py = h - pad.b + 2;

    ctx.fillStyle = 'rgba(84,147,247,0.9)';
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 3); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.fillText(xLabel, px + pw / 2, py + ph - 3);
  }
}

function setupCandleHover(candles, period) {
  const canvas = document.getElementById('supplyChart');
  if (!canvas) return;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Overlay tooltip drawn ON canvas (like luncmetrics)
  let _hoverTooltipEl = null;

  function getOrCreateOverlayTooltip() {
    if (_hoverTooltipEl) return _hoverTooltipEl;
    const wrap = canvas.parentElement;
    wrap.style.position = 'relative';
    const el = document.createElement('div');
    el.id = 'canvas-hover-tooltip';
    el.style.cssText = `
      position:absolute;pointer-events:none;display:none;z-index:10;
      background:rgba(8,18,36,0.93);border:1px solid rgba(84,147,247,0.25);
      border-radius:8px;padding:10px 14px;font-family:'Exo 2',sans-serif;
      font-size:12px;line-height:1.85;color:#c8ddf0;
      box-shadow:0 4px 24px rgba(0,0,0,0.5);min-width:220px;white-space:nowrap;
    `;
    wrap.appendChild(el);
    _hoverTooltipEl = el;
    return el;
  }

  function fmtDate(d, period) {
    const dd = d.getUTCDate().toString().padStart(2,'0');
    const mm = (d.getUTCMonth()+1).toString().padStart(2,'0');
    const yyyy = d.getUTCFullYear();
    const hh = d.getUTCHours().toString().padStart(2,'0');
    const min = d.getUTCMinutes().toString().padStart(2,'0');
    const ss = d.getUTCSeconds().toString().padStart(2,'0');
    if (period === 'D' || period === 'W' || period === 'M') {
      return `${dd}.${mm}.${yyyy}, 00:00:00 UTC`;
    }
    return `${dd}.${mm}.${yyyy}, ${hh}:${min}:${ss} UTC`;
  }

  function fmtBig(v) {
    // Format like "441,311 ----T-+" style but in English: "441.311B" or full with commas
    const n = Math.round(Math.abs(v));
    if (n >= 1e12) return (n / 1e12).toFixed(3) + 'T';
    if (n >= 1e9)  return (n / 1e9).toFixed(3) + 'B';
    if (n >= 1e6)  return (n / 1e6).toFixed(3) + 'M';
    return n.toLocaleString('en-US');
  }

  function fmtPeriodLabel(period) {
    if (period === '1h') return 'Hourly burned';
    if (period === '4h') return '4h burned';
    if (period === 'D')  return 'Daily burned';
    if (period === 'W')  return 'Weekly burned';
    if (period === 'M')  return 'Monthly burned';
    return 'Period burned';
  }

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const padL = 72, padR = 16;
    const cw = canvas.width - padL - padR;
    const gap = cw / candles.length;
    const idx = Math.floor((mx - padL) / gap);
    const tip = getOrCreateOverlayTooltip();

    if (idx >= 0 && idx < candles.length) {
      const c = candles[idx];
      const d = new Date(c.t);
      const dateStr = fmtDate(d, period);

      // Position tooltip: follow mouse, flip if near right/bottom edge
      const canvasRect = canvas.getBoundingClientRect();
      const wrapRect = canvas.parentElement.getBoundingClientRect();
      tip.style.display = 'block';
      const tipW = tip.offsetWidth  || 240;
      const tipH = tip.offsetHeight || 160;
      let tipLeft = e.clientX - wrapRect.left + 14;
      let tipTop  = e.clientY - wrapRect.top  - 20;
      // Flip left if near right edge
      if (tipLeft + tipW > wrapRect.width - 10) tipLeft = e.clientX - wrapRect.left - tipW - 14;
      // Flip up if near bottom edge
      if (tipTop + tipH > wrapRect.height - 8) tipTop = e.clientY - wrapRect.top - tipH - 10;
      // Never go above top
      if (tipTop < 4) tipTop = 4;
      tip.style.left = tipLeft + 'px';
      tip.style.top  = tipTop  + 'px';

      // Combined tooltip: both supply and burned info
      const ORIGINAL_SUPPLY = 6_900_000_000_000;
      let cumB = ORIGINAL_SUPPLY - candles[0].open;
      for (let j = 0; j <= idx; j++) cumB += candles[j].burned;
      const periodLbl = fmtPeriodLabel(period);
      const change = c.close - c.open;
      const chSign = change < 0 ? '-' : '+';
      const changeColor = change < 0 ? '#ff6b6b' : '#4dffaa';
      tip.innerHTML =
        `<div style="color:#7abed0;font-size:10px;letter-spacing:0.08em;margin-bottom:4px;border-bottom:1px solid rgba(84,147,247,0.15);padding-bottom:4px;">LUNC SUPPLY &amp; BURN</div>` +
        `<div><span style="color:#aac4d8;">Supply:</span> <b style="color:#ff9090;">${fmtBig(c.close)} LUNC</b></div>` +
        `<div><span style="color:#aac4d8;">Change:</span> <b style="color:${changeColor};">${chSign}${fmtBig(Math.abs(change))} LUNC</b></div>` +
        `<div style="margin-top:3px;padding-top:3px;border-top:1px solid rgba(84,147,247,0.1);">` +
        `<span style="color:#aac4d8;">${periodLbl}:</span> <b style="color:#1ec864;">${fmtBig(c.burned)} LUNC</b></div>` +
        (c.binanceBurn > 0
          ? `<div><span style="color:#ff9944;">🔥 Binance:</span> <b style="color:#ffbb55;">${fmtBig(c.binanceBurn)} LUNC</b></div>`
          : '') +
        `<div style="margin-top:3px;padding-top:3px;border-top:1px solid rgba(84,147,247,0.1);"><span style="color:#aac4d8;">Total burned:</span> <b style="color:#4dffaa;">${fmtBig(cumB)} LUNC</b></div>` +
        `<div><span style="color:#aac4d8;">Date:</span> <b>${dateStr}</b></div>`;
      drawCombinedChart(candles, period, idx);

      // Also update inline tooltip area (legacy, clear it)
      const inlineTip = document.getElementById('supply-tooltip');
      if (inlineTip) inlineTip.innerHTML = '';
    } else {
      tip.style.display = 'none';
    }
  };

  let _leaveTimer = null;
  canvas.onmouseleave = (e) => {
    _leaveTimer = setTimeout(() => {
      const tip = getOrCreateOverlayTooltip();
      if (tip) tip.style.display = 'none';
      const inlineTip = document.getElementById('supply-tooltip');
      if (inlineTip) inlineTip.innerHTML = '';
      drawCombinedChart(candles, period, -1);
    }, 80);
  };
  canvas.onmouseenter = () => {
    if (_leaveTimer) { clearTimeout(_leaveTimer); _leaveTimer = null; }
  };
}

function drawSupplyFallback() {
  const C = resolveCanvasS('supplyChart', 220); if (!C) return;
  const { ctx, w, h } = C;
  ctx.fillStyle = 'rgba(122,158,196,0.4)'; ctx.font = '12px Exo 2';
  ctx.textAlign = 'center';
  ctx.fillText('Could not load data - check connection', w/2, h/2);
}

// - BINANCE BURN COUNTDOWN -
let _cdInterval = null;

function startBinanceCountdown() {
  if (_cdInterval) clearInterval(_cdInterval);
  updateBinanceCountdown();
  _cdInterval = setInterval(updateBinanceCountdown, 1000);
}

function stopBinanceCountdown() {
  if (_cdInterval) { clearInterval(_cdInterval); _cdInterval = null; }
}

function updateBinanceCountdown() {
  const now = new Date();
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Binance burns "around the 1st" - window: 29th prev month to 3rd of next month
  // Find the nearest upcoming burn target
  const yr  = now.getUTCFullYear();
  const mon = now.getUTCMonth();

  // Candidates: last day(s) of this month OR 1st-3rd of next month
  const nextMonthFirst = new Date(Date.UTC(
    mon === 11 ? yr + 1 : yr, mon === 11 ? 0 : mon + 1, 1
  ));
  // Burn window starts 2 days before month end
  const lastDayOfMonth = new Date(Date.UTC(yr, mon + 1, 0)).getUTCDate();
  const burnWindowStart = new Date(Date.UTC(yr, mon, lastDayOfMonth - 1)); // 2 days before end
  const burnWindowEnd   = new Date(Date.UTC(
    mon === 11 ? yr + 1 : yr, mon === 11 ? 0 : mon + 1, 3, 23, 59, 59
  )); // up to 3rd of next month

  // If we're IN the burn window - show "Burn expected soon!"
  const inWindow = now >= burnWindowStart && now <= burnWindowEnd;

  // Target for countdown = 1st of next month (center of window)
  const nextBurn = nextMonthFirst;

  // Progress bar: from 1st of current month to 1st of next month
  const monthStart = new Date(Date.UTC(yr, mon, 1));
  const monthTotal = nextBurn - monthStart;
  const elapsed    = now - monthStart;
  const remaining  = nextBurn - now;
  const pct = Math.min(100, Math.max(0, (elapsed / monthTotal) * 100));

  // Countdown parts
  const totalSecs = Math.max(0, Math.floor(remaining / 1000));
  const days  = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins  = Math.floor((totalSecs % 3600) / 60);
  const secs  = totalSecs % 60;

  const pad = n => String(n).padStart(2, '0');

  // Update DOM
  const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  set('cd-days',  pad(days));
  set('cd-hours', pad(hours));
  set('cd-mins',  pad(mins));
  set('cd-secs',  pad(secs));

  const burnMon = MONTHS[nextBurn.getUTCMonth()];
  const burnYr  = nextBurn.getUTCFullYear();

  // Show "expected soon" banner if in burn window
  const card = document.getElementById('binance-countdown-card');
  if (inWindow && card) {
    card.style.borderColor = 'rgba(255,80,30,0.5)';
    card.style.background  = 'linear-gradient(135deg,rgba(255,80,30,0.12) 0%,rgba(10,18,36,0) 60%)';
  } else if (card) {
    card.style.borderColor = 'rgba(255,100,50,0.15)';
    card.style.background  = 'linear-gradient(135deg,rgba(255,80,40,0.06) 0%,rgba(10,18,36,0) 60%)';
  }

  if (inWindow) {
    set('bnb-burn-date', `🔥 BURN EXPECTED · ${burnMon} 1 (±2 days)`);
    // Flash the digits
    const digits = document.getElementById('bnb-countdown-digits');
    if (digits) digits.style.opacity = (Math.floor(Date.now()/600) % 2 === 0) ? '1' : '0.4';
  } else {
    set('bnb-burn-date', `${burnMon} 1, ${burnYr} (±2 days)`);
    const digits = document.getElementById('bnb-countdown-digits');
    if (digits) digits.style.opacity = '1';
  }

  const startMon = MONTHS[monthStart.getUTCMonth()];
  set('bnb-period-start', `${startMon} 1`);
  set('bnb-period-end',   `${burnMon} 1`);
  set('bnb-progress-pct', pct.toFixed(1) + '%');

  const bar = document.getElementById('bnb-progress-bar');
  if (bar) {
    bar.style.width = pct.toFixed(2) + '%';
    bar.style.background = inWindow
      ? 'linear-gradient(90deg,#ff2200,#ff6600)'
      : 'linear-gradient(90deg,#ff4d1a,#ff8844)';
  }

  // Estimated burn amount based on current month's trading volume proxy
  // ~375M-5.3B range; use pct elapsed +- average daily rate as proxy
  const AVG_MONTHLY = 600_000_000; // conservative ~600M average
  const est = Math.round(AVG_MONTHLY * (0.7 + pct / 300)); // slight ramp as month progresses
  const fmtB = v => v >= 1e9 ? (v/1e9).toFixed(2)+'B' : (v/1e6).toFixed(0)+'M';
  set('bnb-est-amount', `Est. next Binance burn: ~${fmtB(est)} LUNC · Based on avg monthly volume`);
}

async function runSupplyAudit() {
  const panel = document.getElementById('supply-audit');
  panel.style.display = 'block';
  panel.innerHTML = '<span style="color:#5497f7">Running audit...</span>';

  const fmt = v => Math.round(v).toLocaleString('en-US');
  const lines = [];

  // 1. Real supply from LCD
  try {
    const r = await Promise.race([
      fetch('https://terra-classic-lcd.publicnode.com/cosmos/bank/v1beta1/supply/uluna'),
      new Promise((_,rej) => setTimeout(rej, 5000))
    ]);
    const j = await r.json();
    const lcdSupply = Number(j?.amount?.amount) / 1e6;
    const displayedSupply = parseFloat(document.getElementById('lunc-big')?.textContent?.replace(/,/g,'')) || 0;
    const diff = Math.abs(lcdSupply - displayedSupply);
    const match = diff < 1_000_000;
    lines.push(`<span style="color:#8ab0d8">📡 LCD Supply (real-time):</span>  <b>${fmt(lcdSupply)}</b> LUNC`);
    lines.push(`<span style="color:#8ab0d8">   Displayed Supply:</span>       <b>${fmt(displayedSupply)}</b> LUNC`);
    lines.push(`<span style="color:${match?'#4dffaa':'#ff6b6b'}">   Difference: ${fmt(diff)} LUNC ${match ? '- MATCH' : '- MISMATCH'}</span>`);
  } catch(e) {
    lines.push(`<span style="color:#ff6b6b">📡 LCD Supply: fetch failed - ${e.message}</span>`);
  }

  lines.push('');

  // 2. Chart candle consistency check
  const cached = supplyChartCache[currentSupplyPeriod];
  if (cached?.data?.length) {
    const candles = cached.data;
    const first = candles[0], last = candles[candles.length-1];
    const totalBurned = candles.reduce((s,c) => s + c.burned, 0);
    const supplyDrop = first.open - last.close;
    const drift = Math.abs(totalBurned - supplyDrop);
    lines.push(`<span style="color:#8ab0d8">- Chart period: ${currentSupplyPeriod} - ${candles.length} candles</span>`);
    lines.push(`   Start supply:  <b>${fmt(first.open)}</b>`);
    lines.push(`   End supply:    <b>${fmt(last.close)}</b>`);
    lines.push(`   Supply drop:   <b style="color:#ff6b6b">-${fmt(supplyDrop)}</b>`);
    lines.push(`   Sum of burns:  <b style="color:#ff9944">-${fmt(totalBurned)}</b>`);
    lines.push(`<span style="color:${drift < 1000 ? '#4dffaa' : '#ffaa44'}">   Drift: ${fmt(drift)} ${drift < 1000 ? '- consistent' : '- check rounding'}</span>`);

    // Binance burn candles
    const binanceCandies = candles.filter(c => c.binanceBurn > 0);
    lines.push('');
    lines.push(`<span style="color:#8ab0d8">- Binance burn events in view: ${binanceCandies.length}</span>`);
    binanceCandies.forEach(c => {
      const d = new Date(c.t);
      const label = `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`;
      lines.push(`   🔥 ${label}: <b style="color:#ff7744">${fmt(c.binanceBurn)}</b> LUNC (Binance) + <b>${fmt(c.burned - c.binanceBurn)}</b> (tax)`);
    });
  } else {
    lines.push(`<span style="color:#ffaa44">- No cached chart data - open STATS page first</span>`);
  }

  lines.push('');

  // 3. Daily burn rate check
  const EXPECTED_DAILY = 16_500_000;
  const cached2 = supplyChartCache['D'] || supplyChartCache['1h'];
  if (cached2?.data?.length) {
    const candles = cached2.data;
    const cfg = TF_CONFIG[currentSupplyPeriod] || TF_CONFIG['D'];
    const candleSec = currentSupplyPeriod === 'M' ? 30.44*86400 : cfg.secPerCandle || 3600;
    const avgBurnPerCandle = candles.reduce((s,c) => s + (c.burned - (c.binanceBurn||0)), 0) / candles.length;
    const burnPerDay = avgBurnPerCandle * (86400 / candleSec);
    const burnOK = burnPerDay > 5_000_000 && burnPerDay < 50_000_000;
    lines.push(`<span style="color:#8ab0d8">- Avg tax burn rate (excl. Binance):</span>`);
    lines.push(`   Per candle:  <b>${fmt(avgBurnPerCandle)}</b>`);
    lines.push(`   Per day:     <b>${fmt(burnPerDay)}</b> LUNC`);
    lines.push(`   Expected:    ~${fmt(EXPECTED_DAILY)} LUNC/day`);
    lines.push(`<span style="color:${burnOK?'#4dffaa':'#ffaa44'}">   ${burnOK ? '- Burn rate looks realistic' : '- Rate seems off'}</span>`);
  }

  panel.innerHTML = lines.join('<br>');
}

function drawSupplyChartS(lunc, ustc) {
  // Clear cache so candles rebuild with fresh supply value from LCD
  supplyChartCache = {};
  loadSupplyChart(currentSupplyPeriod);
}
function drawStakedChartS(bonded, ratio) {
  const C = resolveCanvasS('stakedChart', 160); if (!C) return;
  const { ctx, w, h } = C;
  const pad = { l:56, r:54, t:12, b:28 };
  const cw = w-pad.l-pad.r, ch = h-pad.t-pad.b, DAYS=30;
  const bData = Array.from({length:DAYS},(_,i)=>bonded+Math.sin(i/3.2)*bonded*0.01);
  const rData = Array.from({length:DAYS},(_,i)=>ratio+Math.sin(i/4.1)*0.12);
  const bMin=Math.min(...bData)*0.999,bMax=Math.max(...bData)*1.001;
  const rMin=Math.min(...rData)*0.999,rMax=Math.max(...rData)*1.001;
  ctx.strokeStyle='#1e3358';ctx.lineWidth=1;
  for(let i=0;i<=3;i++){const y=pad.t+(ch/3)*i;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+cw,y);ctx.stroke();}
  drawLineS(ctx,bData,pad,cw,ch,bMin,bMax,'#66ffaa',2);
  ctx.beginPath();rData.forEach((v,i)=>{const x=pad.l+(i/(DAYS-1))*cw;const y=pad.t+(1-(v-rMin)/(rMax-rMin+0.0001))*ch;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
  ctx.strokeStyle='#5493f7';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#66ffaa';ctx.font='10px Exo 2';ctx.textAlign='right';ctx.fillText(fmtS(bMax),pad.l-4,pad.t+10);ctx.fillText(fmtS(bMin),pad.l-4,pad.t+ch);
  ctx.fillStyle='#5493f7';ctx.textAlign='left';ctx.fillText(rMax.toFixed(2)+'%',pad.l+cw+4,pad.t+10);ctx.fillText(rMin.toFixed(2)+'%',pad.l+cw+4,pad.t+ch);
  ctx.fillStyle='#3a5070';ctx.font='10px Exo 2';ctx.textAlign='center';
  ['30d ago','20d ago','10d ago','Today'].forEach((l,i)=>ctx.fillText(l,pad.l+(i/3)*cw,h-4));
}
// Oracle chart state
let _oracleHover = null;
let _oracleAnimFrame = null;
let _oracleExplode = { lunc: 0, ustc: 0 };
let _oracleLastData = { lunc: 0, ustc: 0 };

function _oracleInitCanvas() {
  const canvas = document.getElementById('oracleChart');
  if (!canvas || canvas._oracleHoverBound) return;
  canvas._oracleHoverBound = true;
  canvas.style.cursor = 'pointer';
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const size = canvas._sizeW || 280;
    const cx = (size + 40) / 2, cy = (size + 40) / 2;
    const dx = mx - cx, dy = my - cy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const r = size * 0.38, inner = size * 0.22;
    if (dist < inner || dist > r * 1.15) {
      _oracleHover = null;
    } else {
      let angle = Math.atan2(dy, dx);
      const total = _oracleLastData.lunc + _oracleLastData.ustc;
      if (total <= 0) return;
      const luncPct = _oracleLastData.lunc / total;
      const gap = 0.03;
      const luncStart = -Math.PI / 2 + gap / 2;
      const luncEnd = luncStart + (Math.PI * 2 * luncPct) - gap;
      if (angle < luncStart) angle += Math.PI * 2;
      _oracleHover = (angle >= luncStart && angle <= luncEnd) ? 'lunc' : 'ustc';
    }
    // Trigger animation loop if not running
    if (!_oracleAnimFrame) _oracleStartLoop();
  });
  canvas.addEventListener('mouseleave', () => {
    _oracleHover = null;
    if (!_oracleAnimFrame) _oracleStartLoop();
  });
}

function _oracleStartLoop() {
  if (_oracleAnimFrame) cancelAnimationFrame(_oracleAnimFrame);
  function animate() {
    const tl = _oracleHover === 'lunc' ? 1 : 0;
    const tu = _oracleHover === 'ustc' ? 1 : 0;
    const speed = 0.14;
    _oracleExplode.lunc += (tl - _oracleExplode.lunc) * speed;
    _oracleExplode.ustc += (tu - _oracleExplode.ustc) * speed;
    _renderOracleChart(_oracleLastData.lunc, _oracleLastData.ustc);
    const diff = Math.abs(_oracleExplode.lunc - tl) + Math.abs(_oracleExplode.ustc - tu);
    if (diff > 0.002) {
      _oracleAnimFrame = requestAnimationFrame(animate);
    } else {
      _oracleAnimFrame = null;
    }
  }
  animate();
}

function drawOracleChartS(lunc, ustc) {
  _oracleLastData = { lunc, ustc };
  _oracleInitCanvas();
  _renderOracleChart(lunc, ustc);
}

function _renderOracleChart(lunc, ustc) {
  const canvas = document.getElementById('oracleChart');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(canvas.parentElement.clientWidth || 280, 280);
  if (!canvas._sized || canvas._sizeW !== size) {
    canvas.width = (size + 60) * dpr; canvas.height = (size + 60) * dpr;
    canvas.style.width = (size + 60) + 'px'; canvas.style.height = (size + 60) + 'px';
    canvas._sized = true; canvas._sizeW = size;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size + 60, size + 60);

  const cx = (size + 60) / 2, cy = (size + 60) / 2;
  const r = size * 0.38, inner = size * 0.22;
  const total = lunc + ustc;
  if (total <= 0) return;

  const luncPct = lunc / total;
  const ustcPct = ustc / total;
  const gap = 0.03;
  const luncStart = -Math.PI / 2 + gap / 2;
  const luncEnd = luncStart + (Math.PI * 2 * luncPct) - gap;
  const ustcStart = luncEnd + gap;
  const ustcEnd = ustcStart + (Math.PI * 2 * ustcPct) - gap;
  const luncMid = luncStart + (luncEnd - luncStart) / 2;
  const ustcMid = ustcStart + (ustcEnd - ustcStart) / 2;
  const EXPLODE = size * 0.06;

  // Draw segment with offset center (true pie explode)
  function drawSegment(start, end, mid, explode, c1, c2, glow) {
    const ox = Math.cos(mid) * EXPLODE * explode;
    const oy = Math.sin(mid) * EXPLODE * explode;
    const scx = cx + ox, scy = cy + oy;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 16 + explode * 12;
    ctx.beginPath();
    ctx.moveTo(scx, scy);
    ctx.arc(scx, scy, r, start, end);
    ctx.closePath();
    const grad = ctx.createRadialGradient(scx, scy, inner * 0.5, scx, scy, r);
    grad.addColorStop(0, c1); grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  drawSegment(luncStart, luncEnd, luncMid, _oracleExplode.lunc,
    'rgba(102,255,170,0.6)', 'rgba(102,255,170,0.95)', '#66ffaa');
  drawSegment(ustcStart, ustcEnd, ustcMid, _oracleExplode.ustc,
    'rgba(84,147,247,0.6)', 'rgba(84,147,247,0.95)', '#5493f7');

  // Donut hole — fixed at center
  ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fillStyle = '#0a1224'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(84,147,247,0.15)'; ctx.lineWidth = 1; ctx.stroke();

  // Center text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold ' + Math.round(size * 0.072) + 'px Rajdhani, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(fmtS(lunc + ustc), cx, cy - size * 0.04);
  ctx.fillStyle = 'rgba(176,196,232,0.7)';
  ctx.font = Math.round(size * 0.042) + 'px Exo 2, sans-serif';
  ctx.fillText('TOTAL', cx, cy + size * 0.06);

  // External labels — always relative to canvas center, move with segment
  ctx.font = 'bold ' + Math.round(size * 0.048) + 'px Exo 2, sans-serif';
  ctx.textBaseline = 'middle';

  function drawLabel(midAngle, pct, color, explode) {
    const ox = Math.cos(midAngle) * EXPLODE * explode;
    const oy = Math.sin(midAngle) * EXPLODE * explode;
    // Line starts from segment outer edge
    const lineStart = r * 1.04;
    const lineEnd   = r * 1.18;
    const labelDist = r * 1.28;
    const x1 = cx + ox + Math.cos(midAngle) * lineStart;
    const y1 = cy + oy + Math.sin(midAngle) * lineStart;
    const x2 = cx + ox + Math.cos(midAngle) * lineEnd;
    const y2 = cy + oy + Math.sin(midAngle) * lineEnd;
    const tx = cx + ox + Math.cos(midAngle) * labelDist;
    const ty = cy + oy + Math.sin(midAngle) * labelDist;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = Math.cos(midAngle) >= 0 ? 'left' : 'right';
    ctx.fillText(pct.toFixed(1) + '%', tx, ty);
  }

  drawLabel(luncMid, luncPct * 100, '#66ffaa', _oracleExplode.lunc);
  drawLabel(ustcMid, ustcPct * 100, '#5493f7', _oracleExplode.ustc);
}

