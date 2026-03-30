// ─── PROFILE SYSTEM ──────────────────────────────────────────

// CSS стили для профиля — добавляются динамически
(function injectProfileStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .wallet-profile-btn {
      display:block;width:100%;text-align:left;
      background:rgba(84,147,247,0.06);border:1px solid rgba(84,147,247,0.15);
      color:var(--accent);font-family:'Exo 2',sans-serif;font-size:11px;font-weight:700;
      letter-spacing:0.08em;padding:9px 14px;border-radius:8px;cursor:pointer;
      margin-bottom:8px;transition:all 0.2s;
    }
    .wallet-profile-btn:hover { background:rgba(84,147,247,0.12); border-color:rgba(84,147,247,0.35); }
    .title-row { display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border); }
    .title-row:last-child { border-bottom:none; }
    .title-progress-bar { flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden; }
    .title-progress-fill { height:100%;border-radius:3px;transition:width 0.6s ease; }
    .history-item { background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px; }
    .history-item-meta { font-size:10px;color:var(--muted);margin-bottom:6px;display:flex;gap:10px;align-items:center; }
    .history-item-text { font-size:12px;color:var(--text);line-height:1.7; }
    .history-item-votes { font-size:11px;color:var(--green);margin-top:8px; }
  `;
  document.head.appendChild(style);
})();

// ─── RANK SYSTEM (Oracle Ascension) ──────────────────────────
// Reputation = Action Score + Quality Score
// Action:  Ask question +40 | Vote +15 | Chat msg +2 | Join draw +10
// Quality: Upvote received on question/answer +10 | Answer activity +5
// Discount applies to question fee — pool always gets full amount

const RANKS = [
  {
    name: 'INITIATE',   icon: '◈',  minScore: 0,
    color: '#6b82a8',   bar: '#4a5c7a',   glow: 'rgba(107,130,168,0.3)',
    discount: 0,        questionPrice: 200000,
    discountLabel: 'No discount',
    multiplier: 1.0,
  },
  {
    name: 'SEEKER',     icon: '🌱', minScore: 500,
    color: '#66ffaa',   bar: '#1ec864',   glow: 'rgba(30,200,100,0.35)',
    discount: 0,        questionPrice: 200000,
    discountLabel: 'No discount',
    multiplier: 1.0,
  },
  {
    name: 'ADEPT',      icon: '🔵', minScore: 1500,
    color: '#7eb8ff',   bar: '#5493f7',   glow: 'rgba(84,147,247,0.4)',
    discount: 5,        questionPrice: 190000,
    discountLabel: '5% off — 190,000 LUNC',
    multiplier: 1.2,
  },
  {
    name: 'ANALYST',    icon: '🔮', minScore: 4000,
    color: '#c084fc',   bar: '#a855f7',   glow: 'rgba(168,85,247,0.4)',
    discount: 10,       questionPrice: 180000,
    discountLabel: '10% off — 180,000 LUNC',
    multiplier: 1.5,
  },
  {
    name: 'ORACLE',     icon: '⚡', minScore: 8000,
    color: '#ffd700',   bar: '#f5c518',   glow: 'rgba(245,197,24,0.45)',
    discount: 15,       questionPrice: 170000,
    discountLabel: '15% off — 170,000 LUNC',
    multiplier: 2.0,
  },
  {
    name: 'ARCHON',     icon: '🔥', minScore: 15000,
    color: '#ff8844',   bar: '#ff6600',   glow: 'rgba(255,102,0,0.45)',
    discount: 20,       questionPrice: 160000,
    discountLabel: '20% off — 160,000 LUNC',
    multiplier: 2.5,
  },
  {
    name: 'ASCENDED',   icon: '✦',  minScore: 30000,
    color: '#00ffff',   bar: '#00d4ff',   glow: 'rgba(0,212,255,0.55)',
    discount: 25,       questionPrice: 150000,
    discountLabel: '25% off — 150,000 LUNC',
    multiplier: 3.0,
  },
];

// Legacy alias so existing code using TITLES still works
const TITLES = RANKS.filter(r => r.minScore > 0).map(r => ({
  name: r.icon + ' ' + r.name,
  questionsNeeded: 1, upvotesNeeded: 0,
  color: r.color, bar: r.bar,
  discount: r.discount, questionPrice: r.questionPrice,
  discountLabel: r.discountLabel,
}));

// ── Reputation calculation ────────────────────────────────────
// qStats: { myQuestions, myAnswers, totalUpvotes }
// chatStats: { msgCount }
function calcReputation(qStats, chatStats) {
  const { myQuestions = [], myAnswers = [], totalUpvotes = 0 } = qStats;
  const msgCount = chatStats?.msgCount || 0;

  // Action Score
  const actionScore =
    myQuestions.length * 40 +   // Ask question
    myAnswers.length  * 15 +    // Answer (proxy for vote action)
    Math.min(msgCount, 20) * 2 + // Chat — first 20 msgs full reward
    Math.max(0, msgCount - 20) * Math.round(2 * 0.2); // rest 20%

  // Quality Score
  const qualityScore = totalUpvotes * 10;

  return actionScore + qualityScore;
}

// ── Get rank by reputation score ─────────────────────────────
function getRank(score) {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (score >= r.minScore) rank = r;
  }
  return rank;
}

// ── Get next rank ─────────────────────────────────────────────
function getNextRank(score) {
  for (const r of RANKS) {
    if (score < r.minScore) return r;
  }
  return null; // already at max
}

// ── Get rank badge HTML ───────────────────────────────────────
// score: reputation number | wallet: optional wallet address for cache
function getRankBadgeHTML(score) {
  if (score === undefined || score === null) return '';
  const rank = getRank(score);
  if (!rank) return '';
  const isInitiate = rank.name === 'INITIATE';
  return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;letter-spacing:0.08em;color:${rank.color};${isInitiate ? 'opacity:0.5;' : `text-shadow:0 0 6px ${rank.glow};`}background:rgba(0,0,0,0.2);border:1px solid ${rank.color}${isInitiate ? '55' : '88'};padding:1px 7px;border-radius:4px;">${rank.icon} ${rank.name}</span>`;
}

// Build a score map from allQuestions: wallet → {questions, answers, upvotes}
function buildScoreMap(allQuestions) {
  const map = {};
  for (const q of allQuestions) {
    if (!q.wallet) continue;
    if (!map[q.wallet]) map[q.wallet] = { questions: 0, answers: 0, upvotes: 0 };
    map[q.wallet].questions++;
    map[q.wallet].upvotes += q.votes || 0;
    for (const a of q.answers || []) {
      if (!a.wallet) continue;
      if (!map[a.wallet]) map[a.wallet] = { questions: 0, answers: 0, upvotes: 0 };
      map[a.wallet].answers++;
      map[a.wallet].upvotes += a.votes || 0;
    }
  }
  // Convert to score
  const scores = {};
  for (const [w, s] of Object.entries(map)) {
    scores[w] = s.questions * 40 + s.answers * 15 + s.upvotes * 10;
  }
  return scores;
}

// Global score map — populated after questions load
window._walletScores = {};

// Legacy function so existing calls don't break
function getUserTitleFromStats(qCount, upvotes) {
  // approximate reputation from old stats
  const approxScore = qCount * 40 + upvotes * 10;
  const rank = getRank(approxScore);
  return {
    name: rank.icon + ' ' + rank.name,
    color: rank.color, bar: rank.bar,
    discount: rank.discount, questionPrice: rank.questionPrice,
    discountLabel: rank.discountLabel,
  };
}

// ── On-chain chat stats fetch ────────────────────────────────────────────────
// Reads Treasury wallet txs for the connected wallet over last 7 days.
// Chat tx: 5,000 LUNC ±1% + non-empty memo → groups by UTC calendar day
// Free entries: every 10 msgs/day = 1 entry, max 2/day
// Also counts Q&A questions: each = +2 free entries
const TREASURY_WALLET = 'terra1549z8zd9hkggzlwf0rcuszhc9rs9fxqfy2kagt';
const PROFILE_LCD_NODES = [
  'https://terra-classic-lcd.publicnode.com',
  'https://lcd.terraclassic.community',
];
const PROFILE_FCD_NODES = [
  'https://terra-classic-fcd.publicnode.com',
  'https://fcd.terra-classic.hexxagon.io',
];
const CHAT_ULUNA    = 5000 * 1e6;
const QA_ULUNA      = 200000 * 1e6;
const TOLERANCE     = 0.01;

async function fetchChatStats(address) {
  if (!address) return { msgCount: 0, entriesEarned: 0, todayMsgs: 0, todayEntries: 0, days: {}, qaCount: 0 };

  const cutoff = Math.floor(Date.now() / 1000) - 7 * 86400;
  const days   = {};
  let   qaCount = 0;

  // FCD is primary — reliably indexes all tx types on columbus-5
  const allNodes = [
    { base: 'https://fcd.terra-classic.hexxagon.io',       type: 'fcd' },
    { base: 'https://terra-classic-fcd.publicnode.com',    type: 'fcd' },
    { base: 'https://terra-classic-lcd.publicnode.com',    type: 'lcd' },
    { base: 'https://lcd.terraclassic.community',          type: 'lcd' },
  ];

  for (const { base, type } of allNodes) {
    try {
      let offset = 0, done = false, found = false;
      while (!done) {
        let url;
        let data = null;
        if (type === 'fcd') {
          url = `${base}/v1/txs?account=${address}&limit=100&offset=${offset}`;
          const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) });
          if (!res.ok) break;
          data = await res.json();
        } else {
          url = `${base}/cosmos/tx/v1beta1/txs?events=transfer.sender=%27${address}%27&pagination.limit=50&order_by=2&pagination.offset=${offset}`;
          const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) });
          if (!res.ok) break;
          data = await res.json();
        }
        if (!data) break;

        // FCD: flat txs[] each with tx.tx.value.memo + timestamp
        // LCD: parallel txs[] (bodies) + tx_responses[] (metadata)
        let _entries = [];
        if (type === 'fcd') {
          const fcdTxs = data.txs || [];
          _entries = fcdTxs.map(tx => ({
            ts:        Math.floor(new Date(tx.timestamp).getTime() / 1000),
            memo:      tx.tx?.value?.memo || tx.tx?.body?.memo || '',
            msgs:      tx.tx?.value?.msg  || tx.tx?.body?.messages || [],
          }));
        } else {
          const _txBodies    = data.txs || [];
          const _txResponses = data.tx_responses || [];
          const _n = Math.max(_txBodies.length, _txResponses.length);
          for (let i = 0; i < _n; i++) {
            _entries.push({
              ts:   Math.floor(new Date(_txResponses[i]?.timestamp || 0).getTime() / 1000),
              memo: _txBodies[i]?.body?.memo || '',
              msgs: _txBodies[i]?.body?.messages || [],
            });
          }
        }
        if (!_entries.length) break;

        for (const _entry of _entries) {
          const ts   = _entry.ts;
          const memo = _entry.memo;
          const msgs = _entry.msgs;
          if (ts < cutoff) { done = true; break; }

          for (const msg of msgs) {
            const msgType  = msg['@type'] || msg.type || '';
            if (!msgType.includes('MsgSend')) continue;
            const val      = msg.value || msg;
            const toAddr   = val.to_address   || '';
            const fromAddr = val.from_address || '';
            if (toAddr   !== TREASURY_WALLET) continue;
            if (fromAddr !== address)         continue;

            const coins = val.amount || [];
            const lunc  = coins.find(c => c.denom === 'uluna');
            if (!lunc) continue;
            const amt = Number(lunc.amount);

            // Chat: ~5,000 LUNC + non-empty memo
            if (memo.trim().length > 0 &&
                amt >= CHAT_ULUNA * (1 - TOLERANCE) &&
                amt <= CHAT_ULUNA * (1 + TOLERANCE)) {
              const day = new Date(_entry.ts * 1000).toISOString().slice(0, 10);
              days[day] = (days[day] || 0) + 1;
            }

            // Q&A: ~200,000 LUNC
            if (amt >= QA_ULUNA * (1 - TOLERANCE) &&
                amt <= QA_ULUNA * (1 + TOLERANCE)) {
              qaCount++;
            }
          }
        }
        if (_entries.length < 50) break;
        offset += 50;
      }
      // If we got through without error, stop trying nodes
      break;
    } catch(e) {
      console.warn('fetchChatStats node failed:', e.message);
      continue;
    }
  }

  const msgCount = Object.values(days).reduce((s, n) => s + n, 0);

  let entriesEarned = qaCount * 2;
  for (const cnt of Object.values(days)) {
    entriesEarned += Math.min(Math.floor(cnt / 10), 2);
  }

  const todayKey     = new Date().toISOString().slice(0, 10);
  const todayMsgs    = days[todayKey] || 0;
  const todayEntries = Math.min(Math.floor(todayMsgs / 10), 2);

  return { msgCount, entriesEarned, todayMsgs, todayEntries, days, qaCount };
}

// Count upvotes received on answers
function getTotalUpvotesReceived(walletAddress) {
  if (!walletAddress) return 0;
  let total = 0;
  for (const q of questions) {
    for (const a of q.answers) {
      if ((a.fullAddr === walletAddress || a.walletAddr === walletAddress) && a.votes > 0) {
        total += a.votes;
      }
    }
  }
  return total;
}

function getTopAnswerCount(walletAddress) {
  if (!walletAddress) return 0;
  let count = 0;
  for (const q of questions) {
    for (const a of q.answers) {
      if ((a.fullAddr === walletAddress || a.walletAddr === walletAddress) && a.votes >= 3) count++;
    }
  }
  return count;
}

function getUserTitle(walletAddress) {
  if (!walletAddress) return null;
  // Uses local questions array — for real stats use getUserTitleFromStats
  const qCount = (typeof questions !== 'undefined' ? questions : [])
    .filter(q => q.wallet === walletAddress || q.fullAddr === walletAddress).length;
  const upvotes = getTotalUpvotesReceived(walletAddress);
  return getUserTitleFromStats(qCount, upvotes);
}

function getUserTitleFromStats(qCount, upvotes) {
  let current = null;
  for (const t of TITLES) {
    if (qCount >= t.questionsNeeded && upvotes >= t.upvotesNeeded) current = t;
  }
  return current;
}

// getMessageCount — kept as no-op shim so app.js sendChatMessage doesn't break
// Real stats come from fetchChatStats (on-chain)
function getMessageCount(address) { return 0; }
function incrementMessageCount(address) { return 0; }

// ─── PROFILE DATA ─────────────────────────────────────────────
function getProfileKey(address) { return 'profile_' + address; }

function loadProfile(address) {
  if (!address) return null;
  try { return JSON.parse(localStorage.getItem(getProfileKey(address)) || 'null'); } catch(e) { return null; }
}

function saveProfileData(address, data) {
  if (!address) return;
  localStorage.setItem(getProfileKey(address), JSON.stringify(data));
}

function getProfileNickname(address) {
  const p = loadProfile(address);
  return p?.nickname || null;
}

function getDisplayName(address) {
  if (!address) return 'Anonymous';
  const nick = getProfileNickname(address);
  if (nick) return nick;
  return 'Anonymous#' + address.slice(-4).toUpperCase();
}

// ─── OPEN PROFILE PAGE ────────────────────────────────────────
function openProfile() {
  document.getElementById('wallet-dropdown').classList.remove('open');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-profile').classList.add('active');
  try { sessionStorage.setItem('currentPage', 'profile'); } catch(e) {}
  renderProfilePage();
  smoothScrollTop();
}

// ── Fetch question stats from worker ─────────────────────────
async function fetchQuestionStats(address) {
  try {
    const res = await fetch(`${WORKER_URL}/questions`);
    if (!res.ok) throw new Error('Worker error');
    const data = await res.json();
    const allQuestions = data.questions || [];

    const myQuestions = allQuestions.filter(q => q.wallet === address);
    let totalUpvotes = 0;
    const myAnswers = [];

    // Count upvotes received on answers
    for (const q of allQuestions) {
      for (const a of q.answers || []) {
        if (a.wallet === address) {
          myAnswers.push({ ...a, questionId: q.id, questionText: q.text });
          totalUpvotes += a.votes || 0;
        }
      }
    }

    // Count upvotes received on own questions
    for (const q of myQuestions) {
      totalUpvotes += q.votes || 0;
    }

    const topAnswers = myAnswers.filter(a => a.votes >= 3).length;
    return { myQuestions, myAnswers, totalUpvotes, topAnswers, allQuestions };
  } catch(e) {
    console.warn('fetchQuestionStats failed:', e.message);
    return { myQuestions: [], myAnswers: [], totalUpvotes: 0, topAnswers: 0, allQuestions: [] };
  }
}

function renderProfilePage() {
  const address = globalWalletAddress;
  if (!address) return;

  const profile = loadProfile(address) || {};
  const topCount = getTopAnswerCount(address);
  // Wallet short
  document.getElementById('profile-wallet-short').textContent = address.slice(0,12) + '...' + address.slice(-6);

  // Display name
  document.getElementById('profile-display-name').textContent = profile.nickname || ('Anonymous#' + address.slice(-4).toUpperCase());

  // Title badge — show loading until real data arrives
  const titleEl = document.getElementById('profile-title-badge');
  if (titleEl) {
    titleEl.textContent = '…';
    titleEl.style.color = 'var(--muted)';
  }

  // Avatar
  const img = document.getElementById('profile-avatar-img');
  const placeholder = document.getElementById('profile-avatar-placeholder');
  if (profile.avatar) {
    img.src = profile.avatar;
    img.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    img.style.display = 'none';
    placeholder.style.display = 'block';
  }

  // Nickname input
  document.getElementById('profile-nickname-input').value = profile.nickname || '';

  // Stats — show loading state
  document.getElementById('stat-questions').textContent = '…';
  document.getElementById('stat-answers').textContent = '…';
  document.getElementById('stat-upvotes').textContent = '…';
  document.getElementById('stat-top-answers').textContent = '…';
  document.getElementById('stat-messages').textContent = '…';

  // Load question stats from worker + chat stats from chain in parallel
  Promise.all([
    fetchQuestionStats(address),
    fetchChatStats(address),
  ]).then(([qStats, chatStats]) => {
    const { myQuestions, myAnswers, totalUpvotes, topAnswers, allQuestions } = qStats;

    document.getElementById('stat-questions').textContent = myQuestions.length;
    document.getElementById('stat-answers').textContent = myAnswers.length;
    document.getElementById('stat-upvotes').textContent = totalUpvotes;
    document.getElementById('stat-top-answers').textContent = topAnswers;
    document.getElementById('stat-messages').textContent = chatStats.msgCount;

    // Calculate reputation + rank
    const reputation = calcReputation(qStats, chatStats);
    const rank       = getRank(reputation);
    const nextRank   = getNextRank(reputation);

    // Update title badge → now shows rank
    const titleEl = document.getElementById('profile-title-badge');
    if (titleEl) {
      titleEl.innerHTML = `<span style="color:${rank.color};text-shadow:0 0 12px ${rank.glow};">${rank.icon} ${rank.name}</span> <span style="font-size:10px;opacity:0.7;margin-left:6px;">${rank.discountLabel}</span>`;
      titleEl.style.color = rank.color;
    }

    // Render reputation block
    renderReputationBlock(reputation, rank, nextRank);

    renderMessageProgress(chatStats);
    renderRankProgress(reputation);
    renderHistoryTab(currentHistoryTab || 'answers', myAnswers, myQuestions);
  });
}

// ─── MESSAGE MILESTONE PROGRESS (on-chain stats) ─────────────
function renderMessageProgress(stats) {
  const el = document.getElementById('message-milestone-section');
  if (!el) return;

  const { msgCount, entriesEarned, todayMsgs, todayEntries } = stats;

  // Progress to next entry today: X/10 msgs
  const todayProgress = todayMsgs % 10;
  const pct = Math.round((todayProgress / 10) * 100);

  // Max daily entries info
  const maxedToday = todayEntries >= 2;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="font-size:11px;color:var(--muted);">💬 Chat messages → free Weekly lottery entries</span>
      <span style="font-size:11px;color:var(--green);font-weight:700;">${entriesEarned} ${entriesEarned === 1 ? 'entry' : 'entries'} earned this week</span>
    </div>
    <div style="background:rgba(255,255,255,0.06);border-radius:4px;height:6px;margin-bottom:10px;overflow:hidden;">
      <div style="height:100%;border-radius:4px;background:linear-gradient(90deg,#1ec864,#4ade80);width:${maxedToday ? 100 : pct}%;transition:width 0.6s ease;"></div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
      <div style="font-size:10px;padding:3px 10px;border-radius:20px;
        background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--muted);">
        Every 10 msgs/day = +1 entry · max 2/day
      </div>
      ${maxedToday
        ? `<div style="font-size:10px;padding:3px 10px;border-radius:20px;
            background:rgba(30,200,100,0.12);border:1px solid rgba(30,200,100,0.35);color:#4ade80;">
            ✓ Max entries today (${todayEntries}/2)
           </div>`
        : `<div style="font-size:10px;color:var(--muted);padding:3px 0;">
            Today: ${todayProgress}/10 to next entry
           </div>`
      }
    </div>
  `;
}

// ─── REPUTATION BLOCK ─────────────────────────────────────────
function renderReputationBlock(reputation, rank, nextRank) {
  const el = document.getElementById('reputation-block');
  if (!el) return;

  const pct = nextRank
    ? Math.round(((reputation - rank.minScore) / (nextRank.minScore - rank.minScore)) * 100)
    : 100;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div>
        <div style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">Oracle Reputation</div>
        <div style="font-family:'Rajdhani',sans-serif;font-size:32px;font-weight:800;color:${rank.color};text-shadow:0 0 18px ${rank.glow};line-height:1;">
          ${reputation.toLocaleString()}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">Current Rank</div>
        <div style="font-size:18px;font-weight:800;letter-spacing:0.1em;color:${rank.color};text-shadow:0 0 14px ${rank.glow};">
          ${rank.icon} ${rank.name}
        </div>
      </div>
    </div>
    ${nextRank ? `
      <div style="margin-bottom:6px;display:flex;justify-content:space-between;font-size:10px;color:var(--muted);">
        <span>Progress to <span style="color:${nextRank.color};font-weight:700;">${nextRank.icon} ${nextRank.name}</span></span>
        <span style="color:${rank.color};">${pct}%</span>
      </div>
      <div style="background:rgba(255,255,255,0.06);border-radius:6px;height:8px;overflow:hidden;margin-bottom:6px;">
        <div style="height:100%;border-radius:6px;width:${pct}%;background:linear-gradient(90deg,${rank.bar},${nextRank.bar});transition:width 0.8s ease;box-shadow:0 0 8px ${rank.glow};"></div>
      </div>
      <div style="font-size:10px;color:var(--muted);">
        ${reputation.toLocaleString()} / ${nextRank.minScore.toLocaleString()} REP · need <strong style="color:var(--text);">${(nextRank.minScore - reputation).toLocaleString()}</strong> more
      </div>
    ` : `
      <div style="font-size:11px;color:${rank.color};text-shadow:0 0 10px ${rank.glow};font-weight:700;letter-spacing:0.08em;">
        ✦ MAX RANK ACHIEVED — ASCENDED
      </div>
    `}
  `;
}

// ─── RANK PROGRESS LIST ───────────────────────────────────────
function renderRankProgress(reputation) {
  const el = document.getElementById('title-progress-list');
  if (!el) return;

  el.innerHTML = RANKS.map(r => {
    const achieved = reputation >= r.minScore;
    const isCurrent = getRank(reputation) === r;
    const pct = r.minScore === 0 ? 100 : Math.min(100, Math.round((reputation / r.minScore) * 100));

    return `
      <div class="title-row" style="${isCurrent ? `border-left:2px solid ${r.color};padding-left:10px;margin-left:-12px;` : ''}">
        <div style="width:110px;font-size:11px;font-weight:700;color:${r.color};opacity:${achieved ? 1 : 0.45};
          ${achieved ? `text-shadow:0 0 8px ${r.glow};` : ''}">
          ${r.icon} ${r.name}
          ${isCurrent ? '<span style="font-size:9px;opacity:0.7;"> ← you</span>' : ''}
        </div>
        <div style="flex:1;">
          <div class="title-progress-bar" style="margin-bottom:3px;">
            <div class="title-progress-fill" style="width:${pct}%;background:${achieved ? r.bar : 'rgba(255,255,255,0.12)'};
              ${achieved ? `box-shadow:0 0 6px ${r.glow};` : ''}"></div>
          </div>
          <div style="font-size:9px;color:var(--muted);">
            ${r.minScore === 0 ? 'Starting rank' : r.minScore.toLocaleString() + ' REP'}
          </div>
        </div>
        <div style="font-size:10px;color:${r.color};opacity:${achieved ? 1 : 0.45};min-width:80px;text-align:right;">
          ${achieved ? '✅ ' : ''}${r.discountLabel}
        </div>
      </div>`;
  }).join('');
}

// Legacy — kept so old calls don't break
function renderTitleProgress(qCount, upvotes) {
  const approxScore = qCount * 40 + upvotes * 10;
  renderRankProgress(approxScore);
}

let currentHistoryTab = 'answers';

function switchHistoryTab(tab) {
  currentHistoryTab = tab;
  document.getElementById('history-tab-answers').classList.toggle('active', tab === 'answers');
  document.getElementById('history-tab-questions').classList.toggle('active', tab === 'questions');
  const msgTabEl = document.getElementById('history-tab-messages');
  if (msgTabEl) msgTabEl.classList.toggle('active', tab === 'messages');

  const address = globalWalletAddress;
  fetchQuestionStats(address).then(({ myQuestions, myAnswers }) => {
    renderHistoryTab(tab, myAnswers, myQuestions);
  });
}

function renderHistoryTab(tab, myAnswers, myQuestions) {
  const el = document.getElementById('profile-history-list');
  if (tab === 'messages') {
    el.innerHTML = `
      <div class="history-item">
        <div class="history-item-meta">
          <span style="color:var(--green);">💬 DAO Chat Activity</span>
          <span style="font-size:10px;color:var(--muted);">Last 7 days · on-chain</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;" id="chat-stats-grid">
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;">
            <div style="font-family:'Rajdhani',sans-serif;font-size:26px;font-weight:800;color:var(--green);">…</div>
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-top:2px;">Messages sent</div>
          </div>
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;">
            <div style="font-family:'Rajdhani',sans-serif;font-size:26px;font-weight:800;color:#a78bfa;">…</div>
            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-top:2px;">Free Weekly entries</div>
          </div>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;" id="chat-stats-days"></div>
        <div style="margin-top:14px;font-size:11px;color:var(--muted);line-height:1.6;">
          Every <strong style="color:var(--text)">10 messages per day</strong> = 1 free Weekly Draw entry · max 2/day.
          Messages cost <strong style="color:var(--text)">5,000 LUNC</strong> each and go to the Protocol Treasury.
        </div>
      </div>`;
    // Async fill
    fetchChatStats(globalWalletAddress).then(stats => {
      const grid = document.getElementById('chat-stats-grid');
      if (!grid) return;
      grid.innerHTML = `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;">
          <div style="font-family:'Rajdhani',sans-serif;font-size:26px;font-weight:800;color:var(--green);">${stats.msgCount}</div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-top:2px;">Messages sent</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;">
          <div style="font-family:'Rajdhani',sans-serif;font-size:26px;font-weight:800;color:#a78bfa;">${stats.entriesEarned}</div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-top:2px;">Free Weekly entries</div>
        </div>`;
      // Per-day breakdown
      const daysEl = document.getElementById('chat-stats-days');
      if (daysEl && Object.keys(stats.days).length) {
        const sorted = Object.entries(stats.days).sort((a,b) => b[0].localeCompare(a[0]));
        daysEl.innerHTML = sorted.map(([day, cnt]) => {
          const entries = Math.min(Math.floor(cnt / 10), 2);
          const label   = new Date(day).toLocaleDateString([], {month:'short',day:'numeric'});
          return `<div style="font-size:10px;padding:3px 10px;border-radius:20px;
            background:${entries > 0 ? 'rgba(30,200,100,0.1)' : 'rgba(255,255,255,0.04)'};
            border:1px solid ${entries > 0 ? 'rgba(30,200,100,0.3)' : 'var(--border)'};
            color:${entries > 0 ? '#4ade80' : 'var(--muted)'};">
            ${label}: ${cnt} msgs${entries > 0 ? ' · +'+entries+' entr'+(entries>1?'ies':'y') : ''}
          </div>`;
        }).join('');
      }
    });
    return;
  }
  if (tab === 'answers') {
    if (!myAnswers.length) { el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:30px;">No answers yet — go to the Board and share your knowledge!</div>'; return; }
    el.innerHTML = myAnswers.map(a => `
      <div class="history-item">
        <div class="history-item-meta">
          <span style="color:var(--accent);">💬 Answer</span>
          <span>on question ${a.questionId}</span>
          ${a.votes >= 3 ? '<span style="color:var(--gold);">⭐ Top Answer</span>' : ''}
        </div>
        <div class="history-item-text" style="font-size:11px;color:var(--muted);margin-bottom:6px;font-style:italic;">"${(a.questionText||'').slice(0,80)}..."</div>
        <div class="history-item-text">${a.text.slice(0,200)}${a.text.length > 200 ? '...' : ''}</div>
        <div class="history-item-votes">👍 ${a.votes || 0} upvotes</div>
      </div>
    `).join('');
  } else {
    if (!myQuestions.length) { el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:30px;">No questions yet — ask the community something!</div>'; return; }
    el.innerHTML = myQuestions.map(q => `
      <div class="history-item">
        <div class="history-item-meta">
          <span style="color:var(--accent);">🔮 Question</span>
          <span>${q.category}</span>
          <span>${q.time}</span>
          <span class="q-ref">${q.id}</span>
        </div>
        <div class="history-item-text">${q.text.slice(0,200)}${q.text.length > 200 ? '...' : ''}</div>
        <div class="history-item-votes">👍 ${q.votes || 0} votes · 💬 ${q.answers?.length || 0} answers</div>
      </div>
    `).join('');
  }
}

// ─── EDIT PROFILE ─────────────────────────────────────────────
function toggleProfileEdit() {
  const form = document.getElementById('profile-edit-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function saveProfile() {
  const address = globalWalletAddress;
  if (!address) return;
  const nickname = document.getElementById('profile-nickname-input').value.trim().slice(0, 24);
  const existing = loadProfile(address) || {};
  saveProfileData(address, { ...existing, nickname });

  // Update display name in navbar wallet button
  const short = address.slice(0,8) + '...' + address.slice(-4);
  document.getElementById('wallet-btn-label').textContent = nickname || short;

  toggleProfileEdit();
  renderProfilePage();
}

// ─── AVATAR ───────────────────────────────────────────────────
function triggerAvatarUpload() {
  document.getElementById('avatar-upload').click();
}

function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 500 * 1024) { alert('Image too large. Max 500KB.'); return; }
  const reader = new FileReader();
  reader.onload = function(e) {
    const address = globalWalletAddress;
    if (!address) return;
    const existing = loadProfile(address) || {};
    saveProfileData(address, { ...existing, avatar: e.target.result });
    renderProfilePage();
  };
  reader.readAsDataURL(file);
}

function removeAvatar() {
  const address = globalWalletAddress;
  if (!address) return;
  const existing = loadProfile(address) || {};
  delete existing.avatar;
  saveProfileData(address, existing);
  renderProfilePage();
}

// ─── PATCH: показывать никнейм вместо Anonymous#xxxx ─────────
// Переопределяем submitAnswer чтобы прикреплять walletAddr
const _origSubmitAnswer = window.submitAnswer;
window.submitAnswer = function(qi) {
  const text = document.getElementById('atext-' + qi).value.trim();
  const key = document.getElementById('akey-' + qi).value;
  if (!text) { alert('Please write your answer first.'); return; }
  const isAdmin = key === ADMIN_KEY;
  const address = globalWalletAddress;
  const nickname = address ? getProfileNickname(address) : null;
  const alias = isAdmin ? 'Admin' : (nickname || ('Anonymous#' + Math.floor(1000 + Math.random() * 9000)));
  questions[qi].answers.push({
    alias, isAdmin, title: null, text, votes: 0, voted: false,
    walletAddr: address || null
  });
  questions[qi].formOpen = false;
  questions[qi].open = true;
  saveQuestions(questions);
  renderBoard();
};
