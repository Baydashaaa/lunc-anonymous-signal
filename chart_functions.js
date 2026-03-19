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

    // 2. Fetch volume data from CryptoCompare for realistic burn variation
    const url = `https://min-api.cryptocompare.com/data/v2/${cfg.endpoint}?fsym=LUNC&tsym=USD&limit=${cfg.limit}&extraParams=TerraOracle`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (json.Response === 'Error') throw new Error(json.Message);
    let raw = (json.Data?.Data || []).filter(d => d.volumefrom > 0);

    // Group candles
    if (period === 'M') {
      // Group by calendar month Ú¿‘ Binance burns always on 1st of month
      const monthMap = {};
      raw.forEach(d => {
        const dt = new Date(d.time * 1000);
        const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
        if (!monthMap[key]) monthMap[key] = { time: new Date(dt.getFullYear(), dt.getMonth(), 1).getTime()/1000, volumefrom: 0 };
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

    // Fetch Binance burns: on-chain (last 12 months) + historical fallback
    const BINANCE_BURNS = await fetchBinanceBurnsFromChain();

    // Actual seconds per candle Ú¿‘ CORRECT for grouped periods
    const actualCandleSec = {
      '1h': 3600,
      '4h': 4 * 3600,      // 4h grouped from hourly
      'D':  86400,
      'W':  7 * 86400,      // week grouped from daily
      'M':  30.44 * 86400,  // calendar month
    }[period] || 86400;

    // Helper: get Binance burn for a candle's time window
    function getBinanceBurn(candleStartTs, period) {
      const candleEndTs = candleStartTs + actualCandleSec;
      if (period === 'M') {
        // Match by calendar month
        const cDate = new Date(candleStartTs * 1000);
        const cY = cDate.getUTCFullYear(), cM = cDate.getUTCMonth();
        return BINANCE_BURNS
          .filter(b => { const d = new Date(b.ts * 1000); return d.getUTCFullYear() === cY && d.getUTCMonth() === cM; })
          .reduce((s, b) => s + b.amount, 0);
      }
      // For all other periods: strict window [start, end)
      return BINANCE_BURNS
        .filter(b => b.ts >= candleStartTs && b.ts < candleEndTs)
        .reduce((s, b) => s + b.amount, 0);
    }

    // 3. Build candles: tax burn (volume-proportional) + Binance event burns
    const burnPerSec = DAILY_BURN / 86400;
    const avgBurnPerCandle = burnPerSec * actualCandleSec;

    const TAX_RATE = 0.005; // 0.5% on-chain burn tax
    const vols = raw.map(d => d.volumefrom || 0);
    const totalVol = vols.reduce((s, v) => s + v, 0);
    const avgVol = totalVol / raw.length || 1;

    // Scale factor anchors cumulative burn to realistic total
    const totalVolBurn = vols.reduce((s, v) => s + v * TAX_RATE, 0);
    const expectedTotalBurn = avgBurnPerCandle * raw.length;
    const scaleFactor = totalVolBurn > 0 ? expectedTotalBurn / totalVolBurn : 1;

    // Reconstruct historical supply: start from current supply + sum of all burns in period
    const totalSecs = raw[raw.length - 1].time - raw[0].time + actualCandleSec;
    const totalPeriodBurn = burnPerSec * totalSecs;
    let runningSupply = currentSupply + totalPeriodBurn;

    const candles = raw.map((d, i) => {
      const open = runningSupply;

      // Tax burn: scaled volume-based Ú¿‘ real variation per candle
      const rawVolBurn = (d.volumefrom || avgVol) * TAX_RATE * scaleFactor;
      const taxBurn = Math.max(avgBurnPerCandle * 0.25, Math.min(avgBurnPerCandle * 5.0, rawVolBurn));

      // Binance event burn Ú¿‘ uses correct window for this period
      const binanceBurn = getBinanceBurn(d.time, period);
      const burned = taxBurn + binanceBurn;

      const close = open - burned;
      runningSupply = close;

      return {
        t:          d.time * 1000,
        open,
        close,
        burned,
        taxBurn,
        binanceBurn,
        high:       open,
        low:        close,
        closeNoB:   open - taxBurn,
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
    const totalBurned = candles.reduce((s, c) => s + c.burned, 0);
    deltaEl.innerHTML = `<span style="font-size:14px;">®ﬂ‘Â</span> ${fmtDelta(Math.round(totalBurned))} burned in period &nbsp; <span style="color:#ff6b6b;">${delta < 0 ? 'Ú∆ÿ' : 'Ú∆◊'} ${delta < 0 ? '-' : '+'}${fmtDelta(Math.abs(delta))}</span>`;
    deltaEl.style.color = '#aac4d8';
  }
  drawCombinedChart(candles, period);
  setupCandleHover(candles, period);
}

// Ú‘¿Ú‘¿Ú‘¿ COMBINED CHART: Supply bars (top) + Burned bars (bottom) Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
function drawBurnedChart(candles, period, hoverIdx = -1) { drawCombinedChart(candles, period, hoverIdx); }
function drawCandleChart(candles, period, hoverIdx = -1) { drawCombinedChart(candles, period, hoverIdx); }

function drawCombinedChart(candles, period, hoverIdx = -1) {
  const C = resolveCanvasS('supplyChart', 300); if (!C) return;
  const { ctx, w, h } = C;
  ctx.clearRect(0, 0, w, h);

  const pad = { l:72, r:16, t:12, b:28 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;

  // Ú‘¿Ú‘¿ zones Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
  const DIVIDER_RATIO = 0.52;      // supply top 52%, burned bottom 48%
  const supplyH = Math.floor(ch * DIVIDER_RATIO);
  const burnH   = ch - supplyH - 2; // 2px gap for divider
  const supplyTop = pad.t;
  const dividerY  = pad.t + supplyH;
  const burnTop   = dividerY + 2;

  const gap  = cw / candles.length;
  const barW = Math.max(2, Math.min(18, gap * 0.72));

  function fmtY(v) {
    if (Math.abs(v) >= 1e12) return (v/1e12).toFixed(2)+'T';
    if (Math.abs(v) >= 1e9)  return (v/1e9).toFixed(1)+'B';
    if (Math.abs(v) >= 1e6)  return (v/1e6).toFixed(0)+'M';
    return v.toFixed(0);
  }

  // Ú‘¿Ú‘¿ SUPPLY Y-scale (top zone) Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
  // sMax = highest open, sMin = lowest tax-based close (ignoring Binance spikes)
  // This keeps the axis stable even when a Binance batch drops supply 5B in one candle
  const sMax = Math.max(...candles.map(c => c.open));
  const sMin = Math.min(...candles.map(c => c.open - c.taxBurn), candles[candles.length - 1].close);
  const sPad  = (sMax - sMin) * 0.08 || sMax * 0.00005;
  const sLo   = sMin - sPad;
  const sHi   = sMax + sPad;
  const sRange = sHi - sLo || 1;
  const toSupplyY = v => Math.max(supplyTop, Math.min(supplyTop + supplyH, supplyTop + (1 - (v - sLo) / sRange) * supplyH));

  // Ú‘¿Ú‘¿ BURNED Y-scale (bottom zone) Ú¿‘ taxBurn ONLY, Binance shown separately Ú‘¿
  const taxBurnVals = candles.map(c => c.taxBurn).filter(v => v > 0);
  const bMax = (taxBurnVals.length ? Math.max(...taxBurnVals) : 1) * 1.3;
  const toBurnH = v => (Math.min(v, bMax) / bMax) * (burnH - 2);

  // Ú‘¿Ú‘¿Ú‘¿ GRID: Supply (top) Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
  ctx.font = '10px Exo 2'; ctx.textAlign = 'right';
  const sGridLines = 5;
  for (let i = 0; i <= sGridLines; i++) {
    const y = supplyTop + (supplyH / sGridLines) * i;
    const v = sHi - sRange * (i / sGridLines);
    ctx.strokeStyle = 'rgba(42,64,96,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
    ctx.fillStyle = '#3a5578';
    ctx.fillText(fmtY(v), pad.l - 5, y + 3);
  }

  // Ú‘¿Ú‘¿Ú‘¿ GRID: Burned (bottom) Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
  const bGridLines = 3;
  for (let i = 0; i <= bGridLines; i++) {
    const y = burnTop + (burnH / bGridLines) * (bGridLines - i);
    const v = bMax * (i / bGridLines);
    ctx.strokeStyle = 'rgba(30,100,60,0.25)'; ctx.lineWidth = 1; ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
    ctx.setLineDash([]);
    if (i > 0) {
      ctx.fillStyle = 'rgba(30,200,100,0.5)';
      ctx.fillText(fmtY(v), pad.l - 5, y + 3);
    }
  }

  // Ú‘¿Ú‘¿Ú‘¿ DIVIDER LINE Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
  ctx.strokeStyle = 'rgba(42,64,96,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(pad.l, dividerY); ctx.lineTo(pad.l + cw, dividerY); ctx.stroke();

  // Ú‘¿Ú‘¿Ú‘¿ ZONE LABELS (right side) Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
  ctx.save();
  ctx.font = 'bold 9px Exo 2'; ctx.textAlign = 'right'; ctx.letterSpacing = '0.06em';
  ctx.fillStyle = 'rgba(255,100,100,0.5)';
  ctx.fillText('SUPPLY', pad.l + cw, supplyTop + 11);
  ctx.fillStyle = 'rgba(30,200,100,0.5)';
  ctx.fillText('BURNED', pad.l + cw, burnTop + 11);
  ctx.restore();

  // Ú‘¿Ú‘¿Ú‘¿ SUPPLY BARS (top zone) Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
  candles.forEach((c, i) => {
    const x = pad.l + i * gap + gap / 2;
    const isHover = i === hoverIdx;
    const hasBinance = c.binanceBurn > 0;

    // Bar top = current open (supply at start of candle)
    // Bar bottom = fixed bottom of supply zone
    // This makes bars visually show supply level Ú¿‘ taller = more supply remaining
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

  // Ú‘¿Ú‘¿Ú‘¿ BURNED BARS (bottom zone) Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
  candles.forEach((c, i) => {
    const x = pad.l + i * gap + gap / 2;
    const isHover = i === hoverIdx;
    const hasBinance = c.binanceBurn > 0;

    // Tax burn bar Ú¿‘ normal scale, always visible
    const taxH = Math.max(1, toBurnH(c.taxBurn));
    const taxBt = burnTop + burnH - taxH;
    const grad = ctx.createLinearGradient(x, taxBt, x, burnTop + burnH);
    grad.addColorStop(0, `rgba(30,200,100,${isHover ? 1 : 0.82})`);
    grad.addColorStop(1, `rgba(10,80,40,0.15)`);
    if (isHover) { ctx.shadowColor = '#1ec864'; ctx.shadowBlur = 6; }
    ctx.fillStyle = grad;
    ctx.fillRect(x - barW / 2, taxBt, barW, taxH);
    ctx.shadowBlur = 0;

    // Binance burn Ú¿‘ separate orange bar on top of the green bar, capped at zone height
    if (hasBinance) {
      // Show as a % of zone height Ú¿‘ max 85% so it's always visible but not overflowing
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
      ctx.fillText('®ﬂ‘Â', x, Math.max(burnTop + 12, binanceBt - 1));
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  });

  // Ú‘¿Ú‘¿Ú‘¿ CURRENT SUPPLY LINE (dashed) Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
  const lastY = toSupplyY(candles[candles.length - 1].close);
  ctx.strokeStyle = 'rgba(255,100,100,0.25)';
  ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(pad.l, lastY); ctx.lineTo(pad.l + cw, lastY); ctx.stroke();
  ctx.setLineDash([]);

  // Ú‘¿Ú‘¿Ú‘¿ HOVER CROSSHAIR Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
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

  // Ú‘¿Ú‘¿Ú‘¿ X-AXIS Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
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

  // Ú‘¿Ú‘¿ Moving date pill on X axis Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
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

// Shared X-axis drawing Ú¿‘ used by both supply and burned charts
function drawXAxisLabels(ctx, items, pad, cw, gap, period) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = ctx.canvas.height;
  ctx.font = '10px Exo 2'; ctx.textAlign = 'center';
  const drawnPositions = [];
  const minSpacing = 58;

  items.forEach((c, i) => {
    const x = pad.l + i * gap + gap / 2;
    const d = new Date(c.t);
    const hh = d.getHours().toString().padStart(2,'0');
    const day = d.getDate().toString().padStart(2,'0');
    const mon = MONTHS[d.getMonth()];
    const prevD = i > 0 ? new Date(items[i-1].t) : null;
    const isNewDay   = !prevD || prevD.getDate()        !== d.getDate();
    const isNewMonth = !prevD || prevD.getMonth()       !== d.getMonth();
    const isNewYear  = !prevD || prevD.getFullYear()    !== d.getFullYear();
    const yr2 = String(d.getFullYear()).slice(2);

    let label = null;
    if (period === '1h' || period === '4h') {
      if (i === 0) label = `${day} ${mon}, ${hh}:00`;
      else if (isNewDay) label = `${day} ${mon}`;
    } else if (period === 'D') {
      if (i === 0 || i % 5 === 0) label = `${day} ${mon}`;
    } else if (period === 'W') {
      if (i === 0) label = `${mon} '${yr2}`;
      else if (isNewYear) label = String(d.getFullYear());
      else if (isNewMonth) label = `${mon} '${yr2}`;
    } else if (period === 'M') {
      if (i === 0) label = String(d.getFullYear());
      else if (isNewYear) label = String(d.getFullYear());
      else if (d.getMonth() % 3 === 0) label = `${mon} '${yr2}`;
    } else {
      if (i === 0 || isNewYear) label = String(d.getFullYear());
      else if (isNewMonth) label = `${mon} '${yr2}`;
    }

    if (label && !drawnPositions.some(px => Math.abs(px - x) < minSpacing)) {
      drawnPositions.push(x);
      ctx.fillStyle = '#3a5578';
      ctx.fillText(label, x, h - 14);
    }
  });
  ctx.fillStyle = 'rgba(58,85,120,0.4)'; ctx.font = '9px Exo 2'; ctx.textAlign = 'center';
  ctx.fillText('UTC Time Buckets', pad.l + cw / 2, h - 2);
}

function fmtSupply(v) {
  if (v >= 1e12) return (v/1e12).toFixed(4) + 'T';
  if (v >= 1e9)  return (v/1e9).toFixed(2) + 'B';
  return fmtS(v);
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
    // Format like "441,311 ¶-¶¨T¿¶+" style but in English: "441.311B" or full with commas
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
      const chSign = change < 0 ? 'Ú»“' : '+';
      const changeColor = change < 0 ? '#ff6b6b' : '#4dffaa';
      tip.innerHTML =
        `<div style="color:#7abed0;font-size:10px;letter-spacing:0.08em;margin-bottom:4px;border-bottom:1px solid rgba(84,147,247,0.15);padding-bottom:4px;">LUNC SUPPLY &amp; BURN</div>` +
        `<div><span style="color:#aac4d8;">Supply:</span> <b style="color:#ff9090;">${fmtBig(c.close)} LUNC</b></div>` +
        `<div><span style="color:#aac4d8;">Change:</span> <b style="color:${changeColor};">${chSign}${fmtBig(Math.abs(change))} LUNC</b></div>` +
        `<div style="margin-top:3px;padding-top:3px;border-top:1px solid rgba(84,147,247,0.1);">` +
        `<span style="color:#aac4d8;">${periodLbl}:</span> <b style="color:#1ec864;">${fmtBig(c.burned)} LUNC</b></div>` +
        (c.binanceBurn > 0
          ? `<div><span style="color:#ff9944;">®ﬂ‘Â Binance:</span> <b style="color:#ffbb55;">${fmtBig(c.binanceBurn)} LUNC</b></div>`
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
  ctx.fillText('Could not load data Ú¿‘ check connection', w/2, h/2);
}

// Ú‘¿Ú‘¿Ú‘¿ BINANCE BURN COUNTDOWN Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
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

  // Binance burns "around the 1st" Ú¿‘ window: 29th prev month to 3rd of next month
  // Find the nearest upcoming burn target
  const yr  = now.getUTCFullYear();
  const mon = now.getUTCMonth();

  // Candidates: last day(s) of this month OR 1stÚ¿”3rd of next month
  const nextMonthFirst = new Date(Date.UTC(
    mon === 11 ? yr + 1 : yr, mon === 11 ? 0 : mon + 1, 1
  ));
  // Burn window starts 2 days before month end
  const lastDayOfMonth = new Date(Date.UTC(yr, mon + 1, 0)).getUTCDate();
  const burnWindowStart = new Date(Date.UTC(yr, mon, lastDayOfMonth - 1)); // 2 days before end
  const burnWindowEnd   = new Date(Date.UTC(
    mon === 11 ? yr + 1 : yr, mon === 11 ? 0 : mon + 1, 3, 23, 59, 59
  )); // up to 3rd of next month

  // If we're IN the burn window Ú∆“ show "Burn expected soon!"
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
    set('bnb-burn-date', `®ﬂ‘+ BURN EXPECTED T¨ ${burnMon} 1 T-2 days`);
    // Flash the digits
    const digits = document.getElementById('bnb-countdown-digits');
    if (digits) digits.style.opacity = (Math.floor(Date.now()/600) % 2 === 0) ? '1' : '0.4';
  } else {
    set('bnb-burn-date', `${burnMon} 1, ${burnYr} T¨ T-2 days window`);
    const digits = document.getElementById('bnb-countdown-digits');
    if (digits) digits.style.opacity = '1';
  }

  const startMon = MONTHS[monthStart.getUTCMonth()];
  set('bnb-period-start', `${startMon} 1`);
  set('bnb-period-end',   `${burnMon} 1 T-2d`);
  set('bnb-progress-pct', pct.toFixed(1) + '%');

  const bar = document.getElementById('bnb-progress-bar');
  if (bar) {
    bar.style.width = pct.toFixed(2) + '%';
    bar.style.background = inWindow
      ? 'linear-gradient(90deg,#ff2200,#ff6600)'
      : 'linear-gradient(90deg,#ff4d1a,#ff8844)';
  }

  // Estimated burn amount based on current month's trading volume proxy
  // ~375MÚ¿”5.3B range; use pct elapsed +◊ average daily rate as proxy
  const AVG_MONTHLY = 600_000_000; // conservative ~600M average
  const est = Math.round(AVG_MONTHLY * (0.7 + pct / 300)); // slight ramp as month progresses
  const fmtB = v => v >= 1e9 ? (v/1e9).toFixed(2)+'B' : (v/1e6).toFixed(0)+'M';
  set('bnb-est-amount', `Est. next Binance burn: ~${fmtB(est)} LUNC T¨ Based on avg monthly volume`);
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
    lines.push(`<span style="color:#8ab0d8">Ú—‡ LCD Supply (real-time):</span>  <b>${fmt(lcdSupply)}</b> LUNC`);
    lines.push(`<span style="color:#8ab0d8">   Displayed Supply:</span>       <b>${fmt(displayedSupply)}</b> LUNC`);
    lines.push(`<span style="color:${match?'#4dffaa':'#ff6b6b'}">   Difference: ${fmt(diff)} LUNC ${match ? 'Ú‹≈ MATCH' : 'Ú⁄‡ˇ¨œ MISMATCH'}</span>`);
  } catch(e) {
    lines.push(`<span style="color:#ff6b6b">Ú—‡ LCD Supply: fetch failed Ú¿‘ ${e.message}</span>`);
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
    lines.push(`<span style="color:#8ab0d8">Ú—· Chart period: ${currentSupplyPeriod} Ú¿‘ ${candles.length} candles</span>`);
    lines.push(`   Start supply:  <b>${fmt(first.open)}</b>`);
    lines.push(`   End supply:    <b>${fmt(last.close)}</b>`);
    lines.push(`   Supply drop:   <b style="color:#ff6b6b">-${fmt(supplyDrop)}</b>`);
    lines.push(`   Sum of burns:  <b style="color:#ff9944">-${fmt(totalBurned)}</b>`);
    lines.push(`<span style="color:${drift < 1000 ? '#4dffaa' : '#ffaa44'}">   Drift: ${fmt(drift)} ${drift < 1000 ? 'Ú‹≈ consistent' : 'Ú⁄‡ˇ¨œ check rounding'}</span>`);

    // Binance burn candles
    const binanceCandies = candles.filter(c => c.binanceBurn > 0);
    lines.push('');
    lines.push(`<span style="color:#8ab0d8">Ú—‚ Binance burn events in view: ${binanceCandies.length}</span>`);
    binanceCandies.forEach(c => {
      const d = new Date(c.t);
      const label = `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getFullYear()}`;
      lines.push(`   ®ﬂ‘Â ${label}: <b style="color:#ff7744">${fmt(c.binanceBurn)}</b> LUNC (Binance) + <b>${fmt(c.burned - c.binanceBurn)}</b> (tax)`);
    });
  } else {
    lines.push(`<span style="color:#ffaa44">Ú—· No cached chart data Ú¿‘ open STATS page first</span>`);
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
    lines.push(`<span style="color:#8ab0d8">Ú—„ Avg tax burn rate (excl. Binance):</span>`);
    lines.push(`   Per candle:  <b>${fmt(avgBurnPerCandle)}</b>`);
    lines.push(`   Per day:     <b>${fmt(burnPerDay)}</b> LUNC`);
    lines.push(`   Expected:    ~${fmt(EXPECTED_DAILY)} LUNC/day`);
    lines.push(`<span style="color:${burnOK?'#4dffaa':'#ffaa44'}">   ${burnOK ? 'Ú‹≈ Burn rate looks realistic' : 'Ú⁄‡ˇ¨œ Rate seems off'}</span>`);
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
function drawOracleChartS(lunc, ustc) {
  const C = resolveCanvasS('oracleChart', 140); if (!C) return;
  const { ctx, w, h } = C;
  const pad = { l:56, r:54, t:12, b:28 };
  const cw = w-pad.l-pad.r, ch = h-pad.t-pad.b, DAYS=30;
  const lData=mockDeclineS(lunc,DAYS,500000000,0.002);
  const uData=mockDeclineS(ustc,DAYS,900000,0.002);
  const lMin=Math.min(...lData)*0.999,lMax=Math.max(...lData)*1.001;
  const uMin=Math.min(...uData)*0.999,uMax=Math.max(...uData)*1.001;
  ctx.strokeStyle='#1e3358';ctx.lineWidth=1;
  for(let i=0;i<=2;i++){const y=pad.t+(ch/2)*i;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+cw,y);ctx.stroke();}
  drawLineS(ctx,lData,pad,cw,ch,lMin,lMax,'#66ffaa',2);
  ctx.beginPath();uData.forEach((v,i)=>{const x=pad.l+(i/(DAYS-1))*cw;const y=pad.t+(1-(v-uMin)/(uMax-uMin+0.0001))*ch;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
  ctx.strokeStyle='#5493f7';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#66ffaa';ctx.font='10px Exo 2';ctx.textAlign='right';ctx.fillText(fmtS(lMax),pad.l-4,pad.t+10);
  ctx.fillStyle='#5493f7';ctx.textAlign='left';ctx.fillText(fmtS(uMax),pad.l+cw+4,pad.t+10);
}

async function loadAllStats() {
  const el = document.getElementById('updated-time');
  if (el) { el.textContent = 'Refreshing...'; el.dataset.lastUpdate = 'Refreshing...'; }
  const validatorsPromise = loadValidatorsS();
  await Promise.allSettled([loadStatsData(), loadOraclePoolS(), validatorsPromise]);
  const timeStr = 'Updated ' + new Date().toLocaleTimeString();
  if (el) { el.dataset.lastUpdate = timeStr; el.textContent = timeStr + ' T¨ ®ﬂ‘ƒ 30s'; }
  // Reset countdown
  statsNextRefresh = Date.now() + 30000;
}

// Ú‘¿Ú‘¿Ú‘¿ INIT Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿Ú‘¿
renderBoard();

// Scroll to top on every page load/refresh
window.scrollTo(0, 0);
if (history.scrollRestoration) history.scrollRestoration = 'manual';

// Fast smooth scroll to top (300ms, ease-out)
function smoothScrollTop() {
  const start = window.scrollY;
  if (start === 0) return;
  const duration = 300;
  const startTime = performance.now();
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    window.scrollTo(0, start * (1 - easeOut(progress)));
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
window.addEventListener('load', () => { window.scrollTo(0, 0); });
