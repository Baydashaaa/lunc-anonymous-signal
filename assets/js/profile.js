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

// ─── TITLE SYSTEM ────────────────────────────────────────────
// Reputation based on: questions asked + upvotes received on answers
// Discount applies to question fee — pool always gets full 100K LUNC
const TITLES = [
  {
    name: '🌱 Seeker',
    questionsNeeded: 1,  upvotesNeeded: 0,
    color: '#66ffaa', bar: '#1ec864',
    discount: 0,    questionPrice: 200000,
    discountLabel: 'No discount',
  },
  {
    name: '🔵 Validator',
    questionsNeeded: 5,  upvotesNeeded: 10,
    color: '#7eb8ff', bar: '#5493f7',
    discount: 5,    questionPrice: 190000,
    discountLabel: '5% off — 190,000 LUNC',
  },
  {
    name: '⚡ Oracle',
    questionsNeeded: 15, upvotesNeeded: 50,
    color: '#ffd700', bar: '#f5c518',
    discount: 12.5, questionPrice: 175000,
    discountLabel: '12.5% off — 175,000 LUNC',
  },
  {
    name: '🔥 Terra Legend',
    questionsNeeded: 30, upvotesNeeded: 150,
    color: '#ff8844', bar: '#ff6600',
    discount: 25,   questionPrice: 150000,
    discountLabel: '25% off — 150,000 LUNC',
  },
];

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
  const title = getUserTitle(address);
  const topCount = getTopAnswerCount(address);
  // Wallet short
  document.getElementById('profile-wallet-short').textContent = address.slice(0,12) + '...' + address.slice(-6);

  // Display name
  document.getElementById('profile-display-name').textContent = profile.nickname || ('Anonymous#' + address.slice(-4).toUpperCase());

  // Title badge — show name + discount
  const titleEl = document.getElementById('profile-title-badge');
  if (title) {
    titleEl.innerHTML = `${title.name} <span style="font-size:10px;opacity:0.7;margin-left:6px;">${title.discountLabel}</span>`;
    titleEl.style.color = title.color;
  } else {
    titleEl.textContent = 'No title yet — ask your first question!';
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

    // Update title badge with real title
    const _qTitle = getUserTitleFromStats(myQuestions.length, totalUpvotes);
    const titleEl = document.getElementById('profile-title-badge');
    if (_qTitle) {
      titleEl.innerHTML = `${_qTitle.name} <span style="font-size:10px;opacity:0.7;margin-left:6px;">${_qTitle.discountLabel}</span>`;
      titleEl.style.color = _qTitle.color;
    } else {
      titleEl.textContent = 'No title yet — ask your first question!';
      titleEl.style.color = 'var(--muted)';
    }

    renderMessageProgress(chatStats);
    renderTitleProgress(myQuestions.length, totalUpvotes);
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

function renderTitleProgress(qCount, upvotes) {
  const el = document.getElementById('title-progress-list');
  el.innerHTML = TITLES.map(t => {
    const qPct  = Math.min(100, Math.round((qCount  / Math.max(t.questionsNeeded, 1)) * 100));
    const uPct  = Math.min(100, Math.round((upvotes / Math.max(t.upvotesNeeded,  1)) * 100));
    const achieved = qCount >= t.questionsNeeded && upvotes >= t.upvotesNeeded;
    const overallPct = t.upvotesNeeded === 0 ? qPct : Math.round((qPct + uPct) / 2);
    return `
      <div class="title-row">
        <div style="width:120px;font-size:12px;font-weight:700;color:${achieved ? t.color : 'var(--muted)'};">${t.name}</div>
        <div style="flex:1;">
          <div class="title-progress-bar" style="margin-bottom:3px;">
            <div class="title-progress-fill" style="width:${overallPct}%;background:${achieved ? t.bar : 'rgba(255,255,255,0.15)'}"></div>
          </div>
          ${t.upvotesNeeded > 0 ? `
            <div style="display:flex;gap:10px;">
              <span style="font-size:9px;color:${qCount >= t.questionsNeeded ? t.color : 'var(--muted)'};">
                ${qCount >= t.questionsNeeded ? '✓' : ''} ${Math.min(qCount, t.questionsNeeded)}/${t.questionsNeeded} questions
              </span>
              <span style="font-size:9px;color:${upvotes >= t.upvotesNeeded ? t.color : 'var(--muted)'};">
                ${upvotes >= t.upvotesNeeded ? '✓' : ''} ${Math.min(upvotes, t.upvotesNeeded)}/${t.upvotesNeeded} upvotes
              </span>
            </div>` : `
            <div style="font-size:9px;color:${qCount >= t.questionsNeeded ? t.color : 'var(--muted)'};">
              ${qCount >= t.questionsNeeded ? '✓' : ''} ${Math.min(qCount, t.questionsNeeded)}/${t.questionsNeeded} questions
            </div>`}
        </div>
        <div style="font-size:10px;color:${achieved ? t.color : 'var(--muted)'};min-width:80px;text-align:right;">
          ${achieved ? '✅ ' + t.discountLabel : t.discountLabel}
        </div>
      </div>`;
  }).join('');
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
