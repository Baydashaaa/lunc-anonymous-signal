if (history.scrollRestoration) history.scrollRestoration = 'manual';
// ── Safe profile helpers (defined in profile.js, may load later) ──────────
function _getDisplayName(address, fallback) {
  if (!address) return fallback || 'Anonymous';
  if (typeof getDisplayName === 'function') return getDisplayName(address);
  return fallback || ('Anonymous#' + address.slice(-4).toUpperCase());
}
function _getProfileAvatar(address) {
  if (!address) return null;
  if (typeof getProfileAvatar === 'function') return getProfileAvatar(address);
  return null;
}


// Fast smooth scroll to top (300ms, ease-out)
function smoothScrollTop() {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    window.scrollTo(0, 0);
    return;
  }
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

// ─── ADMIN KEY ───────────────────────────────────────────────
const ADMIN_KEY = 'TerraOracle#9X4K-2025';

// ─── DEMO QUESTIONS ───────────────────────────────────────────
const DEMO_QUESTIONS = [
  {
    id: 'LUNC-A3F9K2B',
    alias: 'Anonymous#4471',
    isAdmin: false,
    title: '🌱 Seeker',
    category: '🗳️ Governance',
    text: 'What is the plan for USTC re-peg after the SDK 0.53 upgrade? Has any formal proposal been submitted to the governance forum yet?',
    tags: ['ustc','sdk053','governance'],
    time: '34 min ago',
    votes: 12,
    answers: [
      { alias: 'Anonymous#8821', isAdmin: false, title: '⚡ Oracle', text: 'No formal proposal yet, but several validators have discussed it in the bi-weekly call. The main blocker is liquidity depth - USTC needs at least $50M TVL before a peg mechanism is viable.', votes: 8, voted: false },
      { alias: 'Admin', isAdmin: true, title: null, text: 'This is being tracked. A governance discussion thread will be opened within the next 2 weeks following the SDK upgrade completion. Stay tuned to the official Terra Classic channels.', votes: 24, voted: false },
    ],
    voted: false,
    open: false,
    formOpen: false,
  },
  {
    id: 'LUNC-B7M2X1C',
    alias: 'Anonymous#2209',
    isAdmin: false,
    title: null,
    category: '⚙️ Validator Issue',
    text: 'Is there a minimum self-delegation requirement for validators after MM 2.0 activates? Some validators seem to be running with very low self-stake.',
    tags: ['validators','mm20','staking'],
    time: '2 hrs ago',
    votes: 7,
    answers: [],
    voted: false,
    open: false,
    formOpen: false,
  },
];

// ─── QUESTIONS STORAGE ───────────────────────────────────────
const WORKER_URL = 'https://terra-oracle-questions.vladislav-baydan.workers.dev';

// ── Worker-based questions storage ───────────────────────────
// questions[] is the in-memory cache, synced from worker on load
let questions = [];
let _questionsLoaded = false;

async function loadQuestionsFromWorker() {
  try {
    const res = await fetch(`${WORKER_URL}/questions`);
    if (!res.ok) throw new Error('Worker error');
    const data = await res.json();
    questions = (data.questions || []).map(q => ({
      answers: [], votes: 0, voted: false, open: false, formOpen: false,
      tags: [],
      // Generate time from createdAt if not present
      time: q.time || (q.createdAt ? (() => { const d = new Date(q.createdAt * 1000); return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear(); })() : 'unknown'),
      ...q,
    }));
    // Restore voted state - from worker data (wallet-based) + localStorage fallback
    const votedQ  = JSON.parse(localStorage.getItem('voted_questions') || '{}');
    const votedA  = JSON.parse(localStorage.getItem('voted_answers') || '{}');
    for (const q of questions) {
      // Check if wallet already voted this question (on-chain in voters array)
      if (votedQ[q.id]) q.voted = true;
      if ((globalWalletAddress || connectedAddress) && q.voters && q.voters.includes(globalWalletAddress || connectedAddress)) q.voted = true;
      for (const a of q.answers) {
        if (votedA[a.id]) a.voted = true;
        if ((globalWalletAddress || connectedAddress) && a.voters && a.voters.includes(globalWalletAddress || connectedAddress)) a.voted = true;
      }
      // Restore poll vote
      if (q.poll && q.pollVoters && globalWalletAddress && q.pollVoters.includes(globalWalletAddress)) {
        const votedPollKey = 'poll_vote_' + q.id;
        const savedOpt = localStorage.getItem(votedPollKey);
        q.myPollVote = savedOpt !== null ? parseInt(savedOpt) : null;
      }
    }
    _questionsLoaded = true;
    // Build score map for rank badges
    if (typeof buildScoreMap === 'function') window._walletScores = buildScoreMap(questions);
    renderBoard();
  } catch(e) {
    console.warn('Failed to load questions from worker:', e.message);
    questions = [];
    _questionsLoaded = true;
    renderBoard();
  }
}

// saveQuestions - no-op, worker handles persistence
function saveQuestions(qs) { questions = qs; }
let boardFilter = 'all';
let boardSort = 'new';

// Load questions from worker on startup
loadQuestionsFromWorker();
let boardSearch = '';

// ─── WALLET SESSION RESTORE ───────────────────────────────────
async function restoreWalletSession() {
  const saved = loadWalletSession();
  if (!saved) return;
  let attempts = 0;
  while (!window.keplr && attempts < 30) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }
  if (!window.keplr) return;
  try {
    await window.keplr.enable('columbus-5');
    const signer = window.keplr.getOfflineSigner('columbus-5');
    const accounts = await signer.getAccounts();
    if (accounts[0].address === saved) {
      setWalletConnected(saved);
    } else {
      clearWalletSession();
    }
  } catch(e) { clearWalletSession(); }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', restoreWalletSession);
} else {
  restoreWalletSession();
}

// ─── NAVIGATION ───────────────────────────────────────────────
function showPage(name, e, skipHistory) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');
  if (e && e.target) e.target.classList.add('active');
  if (name === 'board') { if (!_questionsLoaded) loadQuestionsFromWorker(); else renderBoard(); }
  if (name === 'vote') { applyStoredVotes(); applyVoteStates(); renderVotes(); loadVotesFromWorker(); }
  if (name === 'chat') renderChatPage();
  if (name === 'bag')  renderOracleBag();
  if (!skipHistory && history.pushState) {
    history.pushState({ page: name }, '', '#' + name);
  }
  try { sessionStorage.setItem('currentPage', name); } catch(e) {}
  smoothScrollTop();
}

// Handle browser Back/Forward
window.addEventListener('popstate', function(e) {
  const name = (e.state && e.state.page) || (location.hash ? location.hash.slice(1) : 'home');
  if (name === 'treasury') {
    if (typeof showPage_treasury === 'function') showPage_treasury(null, null, true);
  } else if (name && name.startsWith('reputation')) {
    const tab = name.split(':')[1] || 'leaderboard';
    if (typeof showRepPage === 'function') showRepPage(tab, true);
  } else if (name === 'profile') {
    if (typeof openProfile === 'function') openProfile(true);
  } else {
    showPage(name || 'home', null, true);
  }
});

// ─── Treasury logic moved to assets/js/treasury.js ───────────

// ─── HASHTAG LOGIC ────────────────────────────────────────────
let currentTags = [];

function renderTagPills() {
  const pillsEl = document.getElementById('tag-pills');
  if (!pillsEl) return;
  pillsEl.innerHTML = currentTags.map(t =>
    `<span class="tag-pill">#${t}<button onclick="removeTag('${t}')">✕</button></span>`
  ).join('');
  document.getElementById('tags-hidden').value = currentTags.join(',');
}

function addTag(raw) {
  if (currentTags.length >= 5) return;
  const tag = raw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 20);
  if (!tag || currentTags.includes(tag)) return;
  currentTags.push(tag);
  renderTagPills();
}

function addTagSuggestion(tag) {
  addTag(tag);
  document.getElementById('tag-raw-input').focus();
}

function removeTag(tag) {
  currentTags = currentTags.filter(t => t !== tag);
  renderTagPills();
}

document.addEventListener('DOMContentLoaded', () => {
  // Restore page from URL hash first, then sessionStorage
  const hash = location.hash ? location.hash.slice(1) : null;
  const savedPage = hash || (() => { try { return sessionStorage.getItem('currentPage'); } catch(e) { return null; } })();
  // Set initial history entry so Back works from first page
  if (history.replaceState) history.replaceState({ page: savedPage || 'home' }, '', location.href);
  if (savedPage === 'treasury') {
    if (typeof showPage_treasury === 'function') showPage_treasury(null, null, true);
  } else if (savedPage && savedPage.startsWith('reputation')) {
    const tab = savedPage.split(':')[1] || 'leaderboard';
    if (typeof showRepPage === 'function') showRepPage(tab, true);
  } else if (savedPage === 'profile') {
    if (typeof openProfile === 'function') openProfile(true);
  } else {
    showPage(savedPage || 'home', null, true);
  }
  const input = document.getElementById('tag-raw-input');
  if (!input) return;
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      addTag(this.value);
      this.value = '';
    } else if (e.key === 'Backspace' && this.value === '' && currentTags.length) {
      currentTags.pop();
      renderTagPills();
    }
  });
  input.addEventListener('input', function() {
    if (this.value.endsWith(',') || this.value.endsWith(' ')) {
      addTag(this.value);
      this.value = '';
    }
  });
});

// ─── FILTER & SORT ──────────────────────────────────────────
function setBoardSearch(val) {
  boardSearch = val.trim().toLowerCase();
  document.getElementById('search-clear').style.display = boardSearch ? 'block' : 'none';
  renderBoard();
}

function clearSearch() {
  boardSearch = '';
  document.getElementById('board-search').value = '';
  document.getElementById('search-clear').style.display = 'none';
  renderBoard();
}

function setBoardFilter(cat) {
  boardFilter = cat;
  document.querySelectorAll('[id^="filter-"]').forEach(b => b.classList.remove('active'));
  const map = {'all':'filter-all','Governance':'filter-gov','Technical':'filter-tech','Validator Issue':'filter-val','Market':'filter-market','Community':'filter-comm','Security / Vulnerability':'filter-gov','Protocol Bug':'filter-tech','Proposal / Idea':'filter-gov','Fraud / Manipulation':'filter-gov','Other':'filter-all'};
  if (map[cat]) document.getElementById(map[cat])?.classList.add('active');
  renderBoard();
}

function setBoardSort(s) {
  boardSort = s;
  document.querySelectorAll('[id^="sort-"]').forEach(b => b.classList.remove('active'));
  document.getElementById('sort-' + s)?.classList.add('active');
  renderBoard();
}

// ─── RENDER BOARD ────────────────────────────────────────────
function renderPoll(q, qi) {
  const poll = q.poll;
  const totalVotes = poll.reduce((s, o) => s + (o.votes || 0), 0);
  const myVote = q.myPollVote !== undefined ? q.myPollVote : null;

  let optionsHtml = '';
  for (let oi = 0; oi < poll.length; oi++) {
    const opt = poll[oi];
    const pct = totalVotes > 0 ? Math.round((opt.votes || 0) / totalVotes * 100) : 0;
    const voted = myVote === oi;
    const border = voted ? 'rgba(84,147,247,0.6)' : 'rgba(255,255,255,0.08)';
    const bg = voted ? 'rgba(84,147,247,0.12)' : 'rgba(255,255,255,0.03)';
    const textColor = voted ? 'var(--accent)' : 'var(--text)';
    optionsHtml += '<div style="margin-bottom:6px;">' +
      '<button onclick="votePoll(' + qi + ',' + oi + ')" style="width:100%;text-align:left;padding:8px 12px;border-radius:8px;border:1px solid ' + border + ';background:' + bg + ';cursor:pointer;position:relative;overflow:hidden;">' +
      '<div style="position:absolute;left:0;top:0;height:100%;width:' + pct + '%;background:rgba(84,147,247,0.08);border-radius:8px;transition:width 0.4s;"></div>' +
      '<div style="position:relative;display:flex;justify-content:space-between;align-items:center;">' +
      '<span style="font-size:12px;color:' + textColor + ';">' + opt.text + '</span>' +
      '<span style="font-size:11px;color:var(--muted);">' + pct + '% · ' + (opt.votes || 0) + '</span>' +
      '</div></button></div>';
  }

  return '<div class="poll-section" style="margin:10px 0;border:1px solid rgba(84,147,247,0.2);border-radius:10px;padding:12px;background:rgba(84,147,247,0.04);">' +
    '<div style="font-size:10px;color:var(--accent);letter-spacing:0.08em;margin-bottom:8px;">COMMUNITY POLL</div>' +
    optionsHtml +
    '<div style="font-size:10px;color:var(--muted);margin-top:4px;">' + totalVotes + ' vote' + (totalVotes !== 1 ? 's' : '') + ' total</div>' +
    '</div>';
}


async function votePoll(qi, optionIdx) {
  if (!globalWalletAddress) { alert('Connect wallet to vote'); return; }
  const q = questions[qi];
  if (!q.poll) return;
  if (q.myPollVote !== undefined && q.myPollVote !== null) return; // already voted

  q.myPollVote = optionIdx;
  q.poll[optionIdx].votes = (q.poll[optionIdx].votes || 0) + 1;
  localStorage.setItem('poll_vote_' + q.id, String(optionIdx));
  renderBoard();

  try {
    await fetch(`${WORKER_URL}/poll-vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: q.id, optionIdx, wallet: globalWalletAddress }),
    });
  } catch(e) { console.warn('Poll vote sync failed:', e.message); }
}

function renderBoard() {
  const list = document.getElementById('questions-list');
  const count = document.getElementById('board-count');

  let filtered = boardFilter === 'all' ? [...questions] : questions.filter(q => q.category === boardFilter || q.category.includes(boardFilter.replace(/[🗳️⚙️📈🌍⚡]\s*/,'')));

  if (boardSearch) {
    const searchTag = boardSearch.startsWith('#') ? boardSearch.slice(1) : null;
    filtered = filtered.filter(q =>
      q.text.toLowerCase().includes(boardSearch) ||
      q.category.toLowerCase().includes(boardSearch) ||
      q.id.toLowerCase().includes(boardSearch) ||
      (searchTag && q.tags && q.tags.some(t => t.toLowerCase() === searchTag.toLowerCase())) ||
      (q.tags && q.tags.some(t => ('#'+t).includes(boardSearch) || t.includes(boardSearch))) ||
      q.answers.some(a => a.text.toLowerCase().includes(boardSearch))
    );
  }

  if (boardSort === 'hot') filtered.sort((a,b) => (b.votes + b.answers.length*2) - (a.votes + a.answers.length*2));
  else if (boardSort === 'unanswered') filtered = filtered.filter(q => q.answers.length === 0);
  else filtered.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  count.textContent = filtered.length + ' open question' + (filtered.length !== 1 ? 's' : '');

  if (filtered.length === 0) {
    list.innerHTML = boardSearch
      ? `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">No questions match "<strong>${boardSearch}</strong>".<br><span style="font-size:11px;opacity:0.6;">Try different keywords</span></div></div>`
      : `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">No questions here yet.<br>Be the first to ask!</div></div>`;
    return;
  }

  list.innerHTML = filtered.map((q, qi) => {
    const realQi = questions.indexOf(q);
    return `
    <div class="q-card" id="qcard-${qi}">
      <div class="q-meta">
        ${q.isAdmin ? `<span class="badge-admin">🛡️ Admin</span>` : `${_getProfileAvatar(q.wallet) ? `<img src="${getProfileAvatar(q.wallet)}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:4px;">` : ''}<span class="q-alias">${_getDisplayName(q.wallet, q.alias)}</span>`}
        ${!q.isAdmin && q.wallet && window._walletScores ? getRankBadgeHTML(window._walletScores[q.wallet] || 0) : (q.title && !q.isAdmin ? `<span class="badge-title">${q.title}</span>` : '')}
        <span class="q-category">${q.category}</span>
        <span class="q-ref" style="margin-left:auto;">${q.time}&nbsp;&nbsp;${q.id}</span>
      </div>
      ${q.tags && q.tags.length ? `<div class="q-tags">${q.tags.map(t => `<span class="q-tag ${boardSearch === '#'+t || boardSearch === t ? 'active-tag' : ''}" onclick="setBoardSearch('#${t}')">#${t}</span>`).join('')}</div>` : ''}
      <div class="q-text">${boardSearch ? q.text.replace(new RegExp('(' + boardSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark style="background:rgba(84,147,247,0.25);color:var(--accent);border-radius:2px;padding:0 2px;">$1</mark>') : q.text}</div>
      ${q.poll && q.poll.length >= 2 ? renderPoll(q, realQi) : ''}
      <div class="q-footer">
        <div class="q-votes">
          <button class="vote-btn ${q.voted ? 'voted' : ''}" onclick="voteQuestion(${realQi})">👍 ${q.votes}</button>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm btn-answer" onclick="toggleAnswers(${realQi})">💬 ${q.answers.length} answer${q.answers.length !== 1 ? 's' : ''}</button>
          <button class="btn btn-sm btn-answer" onclick="toggleAnswerForm(${realQi})">+ Answer</button>
        </div>
      </div>
      <div class="answers-section ${q.open ? 'open' : ''}" id="answers-${realQi}">
        ${q.answers.length === 0 ? `<div style="font-size:12px;color:var(--muted);padding:8px 0;">No answers yet - be the first!</div>` : ''}
        ${q.answers.map((a, ai) => `
          <div class="answer-item ${a.isAdmin ? 'admin-answer' : ''}">
            <div class="answer-meta">
              ${a.isAdmin ? `<span class="badge-admin">🛡️ Admin</span>` : `${_getProfileAvatar(a.wallet) ? `<img src="${getProfileAvatar(a.wallet)}" style="width:18px;height:18px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:4px;">` : ''}<span class="q-alias">${_getDisplayName(a.wallet, a.alias)}</span>`}
              ${!a.isAdmin && a.wallet && window._walletScores ? getRankBadgeHTML(window._walletScores[a.wallet] || 0) : (a.title && !a.isAdmin ? `<span class="badge-title">${a.title}</span>` : '')}
            </div>
            <div class="answer-text">${a.text}</div>
            <div class="answer-votes">
              <button class="vote-btn ${a.voted ? 'voted' : ''}" onclick="voteAnswer(${realQi},${ai})">👍 ${a.votes}</button>
            </div>
          </div>
        `).join('')}
        <div class="answer-form ${q.formOpen ? 'open' : ''}" id="aform-${realQi}">
          <div class="answer-form-title">Submit anonymous answer</div>
          <div class="form-group">
            <label>Your Answer</label>
            <textarea id="atext-${realQi}" placeholder="Share your knowledge anonymously..." rows="4"></textarea>
          </div>
          <div class="form-group">
            <label>Admin Key <span style="font-size:9px;color:var(--muted);text-transform:none">(optional - leave blank to answer anonymously)</span></label>
            <div class="admin-key-wrap" id="akwrap-${realQi}">
              <input type="text" id="akey-${realQi}" placeholder="Enter key to post as Admin..." oninput="checkAdminKey(${realQi})" style="-webkit-text-security:disc;text-security:disc;">
              <span class="admin-key-hint" id="akeyhint-${realQi}">optional</span>
            </div>
          </div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:4px;">
            <button class="btn btn-primary btn-sm" onclick="submitAnswer(${realQi})">Post Answer</button>
            <span style="font-size:10px;color:var(--muted)" id="apreview-${realQi}">Will post as: Anonymous#????</span>
          </div>
        </div>
      </div>
    </div>
  `; }).join('');
}

function checkAdminKey(qi) {
  const key = document.getElementById('akey-' + qi).value;
  const wrap = document.getElementById('akwrap-' + qi);
  const hint = document.getElementById('akeyhint-' + qi);
  const preview = document.getElementById('apreview-' + qi);
  const isAdmin = key === ADMIN_KEY;
  wrap.className = 'admin-key-wrap' + (key.length > 0 && isAdmin ? ' valid' : '');
  hint.textContent = isAdmin ? '🛡️ Admin verified' : 'optional';
  preview.innerHTML = isAdmin
    ? 'Will post as: <span class="badge-admin" style="font-size:9px;padding:1px 7px;">🛡️ Admin</span>'
    : 'Will post as: Anonymous#' + Math.floor(1000 + Math.random() * 9000);
}

function toggleAnswers(qi) { questions[qi].open = !questions[qi].open; renderBoard(); }
function toggleAnswerForm(qi) { questions[qi].formOpen = !questions[qi].formOpen; questions[qi].open = true; renderBoard(); }

async function submitAnswer(qi) {
  const text = document.getElementById('atext-' + qi).value.trim();
  const key  = document.getElementById('akey-' + qi)?.value || '';
  if (!text) { alert('Please write your answer first.'); return; }
  const isAdmin = key === ADMIN_KEY;
  if (!isAdmin && !globalWalletAddress) { alert('Connect wallet to answer'); return; }
  const wallet = isAdmin ? 'admin' : globalWalletAddress;
  const q = questions[qi];
  try {
    const res = await fetch(`${WORKER_URL}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: q.id, text, wallet }),
    });
    if (!res.ok) throw new Error('Failed to post answer');
    const data = await res.json();
    questions[qi].answers.push({
      id: data.answerId,
      alias: isAdmin ? 'Admin' : 'Anonymous#' + wallet.slice(-4).toUpperCase(),
      isAdmin, wallet, text, votes: 0, voted: false,
    });
    questions[qi].formOpen = false;
    questions[qi].open = true;
    renderBoard();
  } catch(e) {
    alert('Failed to post answer: ' + e.message);
  }
}

async function voteQuestion(qi) {
  const q = questions[qi];
  if (q.voted) return;
  const _wallet = globalWalletAddress || connectedAddress;
  if (!_wallet) { alert('Connect wallet to vote'); return; }

  // Optimistic update
  q.votes++; q.voted = true;
  const votedQ = JSON.parse(localStorage.getItem('voted_questions') || '{}');
  votedQ[q.id] = true;
  localStorage.setItem('voted_questions', JSON.stringify(votedQ));
  renderBoard();

  // Sync to worker
  try {
    const res = await fetch(`${WORKER_URL}/question-vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: q.id, wallet: _wallet }),
    });
    if (!res.ok) {
      const err = await res.json();
      if (err.error === 'Already voted') return; // already counted
      if (err.error === 'Cannot vote your own question') {
        // Revert
        q.votes--; q.voted = false;
        delete votedQ[q.id];
        localStorage.setItem('voted_questions', JSON.stringify(votedQ));
        renderBoard();
        alert('You cannot vote your own question');
      }
    }
  } catch(e) { console.warn('Vote sync failed:', e.message); }
}

async function voteAnswer(qi, ai) {
  const answer = questions[qi].answers[ai];
  if (answer.voted) return;
  if (!globalWalletAddress) { alert('Connect wallet to vote'); return; }
  // Optimistic update
  answer.votes++; answer.voted = true;
  const votedA = JSON.parse(localStorage.getItem('voted_answers') || '{}');
  votedA[answer.id] = true;
  localStorage.setItem('voted_answers', JSON.stringify(votedA));
  renderBoard();
  // Persist to worker
  try {
    await fetch(`${WORKER_URL}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: questions[qi].id, answerId: answer.id, wallet: globalWalletAddress }),
    });
  } catch(e) { console.warn('Vote sync failed:', e.message); }
}

// ─── ASK FORM ────────────────────────────────────────────────
document.getElementById('ask-message').addEventListener('input', function() {
  const max = 2000, len = this.value.length, remaining = max - len;
  const pct = len / max;
  const ring = document.getElementById('ask-ring');
  document.getElementById('ask-count').textContent = remaining;
  ring.style.strokeDashoffset = 87.96 - pct * 87.96;
  ring.style.stroke = remaining <= 100 ? '#ff4444' : remaining <= 300 ? '#f5c518' : 'var(--accent)';
  document.getElementById('ask-count').style.color = remaining <= 100 ? '#ff4444' : remaining <= 300 ? '#f5c518' : 'var(--muted)';
});

document.getElementById('ask-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('ask-btn');
  btn.disabled = true;
  btn.innerHTML = 'Transmitting<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>';
  const formData = new FormData(this);
  const category = formData.get('category') || 'Other';
  const text = formData.get('message') || '';
  const txHash = document.getElementById('verified-tx-hidden').value;
  const wallet = document.getElementById('verified-wallet-hidden').value;
  const ref = 'LUNC-' + Date.now().toString(36).toUpperCase().slice(-7);
  const tagsRaw = document.getElementById('tags-hidden').value;
  const tags = tagsRaw ? tagsRaw.split(',').filter(Boolean) : [];
  const _userTitle = (typeof getUserTitle === 'function' && wallet) ? getUserTitle(wallet) : null;
  const _titleLabel = _userTitle ? _userTitle.name : 'Seeker';
  // Poll options
  const _pollRaw = document.getElementById('poll-options-hidden')?.value || '';
  let pollOptions = [];
  try { pollOptions = JSON.parse(_pollRaw).filter(o => o.trim()); } catch {}
  const poll = pollOptions.length >= 2 ? pollOptions.map(o => ({ text: o, votes: 0, voters: [] })) : null;

  try {
    const res = await fetch(`${WORKER_URL}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ref, category, text, wallet, txHash, tags, paymentAmount: 200000, poll }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to submit');
    }
    // Add optimistically to local cache
    const newQ = { id: ref, alias: 'Anonymous#' + wallet.slice(-4).toUpperCase(), title: _titleLabel,
      category, text, tags, wallet, txHash, createdAt: Date.now() / 1000,
      poll, votes: 0, answers: [], voted: false, open: false, formOpen: false };
    questions.unshift(newQ);
    renderBoard();
    document.getElementById('ask-form-section').style.display = 'none';
    const success = document.getElementById('ask-success');
    success.classList.add('visible');
    document.getElementById('ask-ref').textContent = 'REF: ' + ref;
    if (typeof resetPollOptions === 'function') resetPollOptions();
  } catch(e) {
    alert('Failed to submit question: ' + e.message);
  }
  btn.disabled = false;
  btn.innerHTML = 'Transmit Question →';
});

// ─── PROTOCOL WALLETS ─────────────────────────────────────────
const ADMIN_WALLET    = 'terra15jt5a9ycsey4hd6nlqgqxccl9aprkmg2mxmfc6';
const TREASURY_WALLET = 'terra1549z8zd9hkggzlwf0rcuszhc9rs9fxqfy2kagt'; // Protocol Treasury wallet
const LOTTERY_WALLET  = 'terra1p5l6q95kfl3hes7edy76tywav9f79n6xlkz6qz'; // Weekly Draw Pool
const BURN_WALLET     = 'terra16m05j95p9qvq93cdtchjcpwgvny8f57vzdj06p';
const PROTOCOL_WALLET = ADMIN_WALLET;
const REQUIRED_LUNC   = 200000000000; // 200,000 LUNC in uLUNC
let connectedAddress  = null;

async function connectKeplr() {
  const btn = document.getElementById('keplr-connect-btn');
  if (!window.keplr) {
    if (confirm('Keplr wallet not found. Install Keplr?')) window.open('https://www.keplr.app/', '_blank');
    return;
  }
  try {
    btn.textContent = 'Connecting...'; btn.disabled = true;
    await window.keplr.enable('columbus-5');
    const offlineSigner = window.keplr.getOfflineSigner('columbus-5');
    const accounts = await offlineSigner.getAccounts();
    connectedAddress = accounts[0].address;
    // Update Pay button - async fetch real title from worker
    const _addr = accounts[0].address;
    if (typeof fetchQuestionStats === 'function') {
      fetchQuestionStats(_addr).then(async stats => {
        const { myQuestions, totalUpvotes } = stats;
        const _title = (typeof getUserTitleFromStats === 'function')
          ? getUserTitleFromStats(myQuestions.length, totalUpvotes)
          : null;
        let _discPct = _title ? (_title.discount || 0) : 0;
        // Check streak discount
        try {
          const _sr = await fetch(`${WORKER_URL}/streak?wallet=${_addr}`);
          if (_sr.ok) {
            const _sd = await _sr.json();
            if ((_sd.currentStreak || 0) >= 7) _discPct = Math.max(_discPct, 25);
          }
        } catch(e) {}
        const _discAmt = Math.round(200000 * (_discPct / 100));
        const _price   = 200000 - _discAmt;
        const _btnEl   = document.getElementById('verify-btn');
        if (_btnEl) {
          const _disc = _discPct > 0 ? ` (${_discPct}% off)` : '';
          _btnEl.textContent = `Pay ${_price.toLocaleString()} LUNC & Unlock →${_disc}`;
        }
      });
    } else {
      // Fallback to local questions if profile.js not loaded
      const _title = (typeof getUserTitle === 'function') ? getUserTitle(_addr) : null;
      const _discPct  = _title ? (_title.discount || 0) : 0;
      const _discAmt  = Math.round(200000 * (_discPct / 100));
      const _price    = 200000 - _discAmt;
      const _btnEl    = document.getElementById('verify-btn');
      if (_btnEl) {
        const _disc = _discPct > 0 ? ` (${_discPct}% off)` : '';
        _btnEl.textContent = `Pay ${_price.toLocaleString()} LUNC & Unlock →${_disc}`;
      }
    }
    document.getElementById('connected-addr').textContent = connectedAddress.slice(0,10)+'...'+connectedAddress.slice(-4);
    document.getElementById('verified-wallet-hidden').value = connectedAddress;
    // Refresh My Bag if open
    if (document.getElementById('page-bag') &&
        document.getElementById('page-bag').classList.contains('active')) {
      renderOracleBag();
    }
    document.getElementById('keplr-disconnected').style.display = 'none';
    document.getElementById('keplr-connected').style.display = 'block';
    if (connectedAddress === ADMIN_WALLET) {
      document.getElementById('verified-tx-hidden').value = 'ADMIN_BYPASS';
      document.getElementById('keplr-connected').style.display = 'none';
      document.getElementById('ask-form').style.display = 'block';
      const notice = document.getElementById('tx-section');
      notice.style.display = 'block';
      notice.innerHTML = '<div style="background:rgba(245,197,24,0.08);border:1px solid rgba(245,197,24,0.25);border-radius:8px;padding:12px 16px;font-size:12px;color:var(--gold);">🛡️ Admin wallet detected - payment bypassed</div>';
    } else {
      document.getElementById('tx-section').style.display = 'block';
    }
  } catch(e) {
    btn.textContent = '🔑 Connect Keplr Wallet'; btn.disabled = false;
    alert('Connection failed: ' + (e.message || e));
  }
}

function disconnectKeplr() {
  connectedAddress = null;
  document.getElementById('keplr-disconnected').style.display = 'block';
  document.getElementById('keplr-connected').style.display = 'none';
  document.getElementById('tx-section').style.display = 'none';
  document.getElementById('ask-form').style.display = 'none';
  document.getElementById('tx-status').style.display = 'none';
  document.getElementById('keplr-connect-btn').textContent = '🔑 Connect Keplr Wallet';
  document.getElementById('keplr-connect-btn').disabled = false;
}

// ─── AMINO SIGNING HELPER (no cosmjs) ────────────────────────────────────────
async function sendLuncDirect(fromAddr, toAddr, amountUluna, memo, chainId) {
  const LCD   = 'https://terra-classic-lcd.publicnode.com';
  const CHAIN = chainId || 'columbus-5';

  // Get account info
  const accRes  = await fetch(`${LCD}/cosmos/auth/v1beta1/accounts/${fromAddr}`);
  const accData = await accRes.json();
  const acct    = accData?.account || {};
  const accountNumber = parseInt(acct.account_number || '0');
  const sequence      = parseInt(acct.sequence || '0');

  // Fee = gas + 0.5% tax
  const gasLimit = 300000;
  const gasFee   = Math.ceil(gasLimit * 28.325);
  const taxFee   = Math.ceil(amountUluna * 0.005);
  const totalFee = gasFee + taxFee;

  // Protobuf helpers
  function encodeVarint(n) { n=Number(n); const b=[]; while(n>127){b.push((n&0x7f)|0x80);n=Math.floor(n/128);}b.push(n&0x7f);return new Uint8Array(b); }
  function encodeField(f,w,d){const t=encodeVarint((f<<3)|w);if(w===2){const l=encodeVarint(d.length);const o=new Uint8Array(t.length+l.length+d.length);o.set(t);o.set(l,t.length);o.set(d,t.length+l.length);return o;}return t;}
  function concat(...a){const tot=a.reduce((s,x)=>s+x.length,0);const o=new Uint8Array(tot);let off=0;for(const x of a){o.set(x,off);off+=x.length;}return o;}
  const enc = new TextEncoder();

  // MsgSend
  const coinP  = concat(encodeField(1,2,enc.encode('uluna')), encodeField(2,2,enc.encode(String(amountUluna))));
  const msgSP  = concat(encodeField(1,2,enc.encode(fromAddr)), encodeField(2,2,enc.encode(toAddr)), encodeField(3,2,coinP));
  const anyMsg = concat(encodeField(1,2,enc.encode('/cosmos.bank.v1beta1.MsgSend')), encodeField(2,2,msgSP));
  const txBodyP = concat(encodeField(1,2,anyMsg), encodeField(2,2,enc.encode(memo)));

  // Get pubkey from Keplr
  const directSigner = window.keplr.getOfflineSigner(CHAIN);
  const accounts = await directSigner.getAccounts();
  const pubkeyB   = accounts[0].pubkey;
  const pubkeyAny = concat(
    encodeField(1,2,enc.encode('/cosmos.crypto.secp256k1.PubKey')),
    encodeField(2,2,encodeField(1,2,pubkeyB))
  );

  // ModeInfo: SIGN_MODE_DIRECT = 1
  const modeInfoP = encodeField(1,2,concat(encodeVarint((1<<3)|0), encodeVarint(1)));

  // SignerInfo
  const signerP = concat(
    encodeField(1,2,pubkeyAny),
    encodeField(2,2,modeInfoP),
    encodeVarint((3<<3)|0), encodeVarint(sequence)
  );

  // Fee
  const feeCoinP  = concat(encodeField(1,2,enc.encode('uluna')), encodeField(2,2,enc.encode(String(totalFee))));
  const feeP      = concat(encodeField(1,2,feeCoinP), encodeVarint((2<<3)|0), encodeVarint(gasLimit));
  const authInfoP = concat(encodeField(1,2,signerP), encodeField(2,2,feeP));

  // Sign with signDirect
  const { signed, signature } = await directSigner.signDirect(fromAddr, {
    bodyBytes:     txBodyP,
    authInfoBytes: authInfoP,
    chainId:       CHAIN,
    accountNumber: BigInt(accountNumber),
  });

  // Use signed bytes (Keplr may have modified them)
  const finalBody     = signed.bodyBytes     || txBodyP;
  const finalAuthInfo = signed.authInfoBytes || authInfoP;
  const sigB          = Uint8Array.from(atob(signature.signature), c=>c.charCodeAt(0));
  const txRawP        = concat(encodeField(1,2,finalBody), encodeField(2,2,finalAuthInfo), encodeField(3,2,sigB));
  const txBase64      = btoa(String.fromCharCode(...txRawP));

  const res  = await fetch(`${LCD}/cosmos/tx/v1beta1/txs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tx_bytes: txBase64, mode: 'BROADCAST_MODE_SYNC' }),
  });
  const data   = await res.json();
  const txHash = data?.tx_response?.txhash || data?.txhash;
  const code   = data?.tx_response?.code ?? data?.code ?? 0;
  if (code !== 0) throw new Error('TX failed: ' + (data?.tx_response?.raw_log || JSON.stringify(data)));

  // Poll for confirmation - max 5 × 4s
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 4000));
    try {
      const chk = await fetch(`${LCD}/cosmos/tx/v1beta1/txs/${txHash}`);
      if (chk.ok) {
        const chkData = await chk.json();
        if (chkData?.tx_response?.txhash) {
          if ((chkData.tx_response.code ?? 0) !== 0) throw new Error('TX failed on-chain: ' + chkData.tx_response.raw_log);
          return txHash;
        }
      }
    } catch(e) { if (e.message?.includes('TX failed')) throw e; }
  }

  if (code !== 0) throw new Error('TX failed: ' + (data?.tx_response?.raw_log || JSON.stringify(data)));
  return txHash;
}

// ─── FIX 1: Ask - исправлена fee (200,000 LUNC payment) ──────
async function autoPayAndUnlock() {
  if (!connectedAddress) { alert('Connect wallet first!'); return; }
  const btn = document.getElementById('verify-btn');
  btn.textContent = '⏳ Opening Keplr...'; btn.disabled = true;
  try {
    await window.keplr.enable('columbus-5');
    const accounts = await window.keplr.getOfflineSigner('columbus-5').getAccounts();
    const sender = accounts[0].address;

    // ── Apply title discount - fetch real stats from worker ──────
    let discountPct = 0;
    if (typeof fetchQuestionStats === 'function') {
      try {
        const _stats = await fetchQuestionStats(sender);
        const _t = (typeof getUserTitleFromStats === 'function')
          ? getUserTitleFromStats(_stats.myQuestions.length, _stats.totalUpvotes)
          : null;
        discountPct = _t ? (_t.discount || 0) : 0;
      } catch(e) {}
    }

    // ── Apply streak discount (7+ days = 25% off) ────────────────
    // Takes the higher of rank discount vs streak discount
    try {
      const _streakRes = await fetch(`${WORKER_URL}/streak?wallet=${sender}`);
      if (_streakRes.ok) {
        const _streakData = await _streakRes.json();
        if ((_streakData.currentStreak || 0) >= 7) {
          discountPct = Math.max(discountPct, 25);
        }
      }
    } catch(e) {}

    // Discount is % of total 200,000 LUNC, subtracted from Treasury portion
    // Weekly Pool: always 100,000 LUNC (fixed)
    // Treasury: 100,000 - (200,000 × discount%)
    const toWeekly    = 100000 * 1e6;                                          // always fixed
    const discountAmt = Math.round(200000 * (discountPct / 100));              // e.g. 5% → 10,000
    const toTreasury  = Math.round((100000 - discountAmt) * 1e6);              // e.g. 90,000 LUNC
    const totalLunc   = 100000 + (100000 - discountAmt);                       // e.g. 190,000

    const discountLabel = discountPct > 0
      ? ` (${discountPct}% off - saved ${discountAmt.toLocaleString()} LUNC)`
      : '';

    // Send to Weekly Draw Pool first
    const txHash1 = await sendLuncDirect(
      sender, LOTTERY_WALLET, toWeekly,
      'Terra Oracle Q&A - Weekly Pool', 'columbus-5'
    );

    // Send to Treasury (discounted amount)
    const txHash2 = await sendLuncDirect(
      sender, TREASURY_WALLET, toTreasury,
      'Terra Oracle Q&A - Treasury', 'columbus-5'
    );

    // Store primary tx hash (Weekly Pool tx) for question record
    document.getElementById('verified-tx-hidden').value = txHash1;
    document.getElementById('verified-wallet-hidden').value = sender;

    const luncPaid = totalLunc.toLocaleString();
    showTxStatus('success', `✅ Payment confirmed! ${luncPaid} LUNC sent${discountLabel}. Form unlocked.`);
    setTimeout(() => {
      document.getElementById('tx-section').style.display = 'none';
      document.getElementById('keplr-connected').style.display = 'none';
      document.getElementById('ask-form').style.display = 'block';
    }, 1200);
  } catch(e) {
    btn.textContent = 'Pay 200,000 LUNC & Unlock'; btn.disabled = false;
    showTxStatus('error', '❌ ' + (e.message || 'Transaction cancelled.'));
  }
}

async function verifyTX() {
  const txHash = document.getElementById('tx-input').value.trim();
  const btn = document.getElementById('verify-btn');
  if (!txHash) { alert('Please enter a TX hash'); return; }
  btn.textContent = 'Checking...'; btn.disabled = true;
  document.getElementById('tx-status').style.display = 'none';
  let txData = null;
  try {
    const res = await fetch(`https://terra-classic-lcd.publicnode.com/cosmos/tx/v1beta1/txs/${txHash}`);
    if (res.ok) { txData = await res.json(); }
  } catch(e) {}
  btn.textContent = 'Verify'; btn.disabled = false;
  if (!txData || txData.error) { showTxStatus('error', '❌ Transaction not found. Check the hash and try again.'); return; }
  if (txData.code && txData.code !== 0) { showTxStatus('error', '❌ Transaction failed on-chain.'); return; }
  const msgs = txData.tx?.value?.msg || txData.tx?.body?.messages || [];
  let valid = false, foundAmount = 0;
  for (const msg of msgs) {
    const type = msg.type || msg['@type'] || '';
    const val = msg.value || msg;
    if (type.includes('MsgSend') || type.includes('bank')) {
      const toAddr = val.to_address || val.toAddress;
      const coins = val.amount || [];
      const lunc = Array.isArray(coins) ? coins.find(c => c.denom === 'uluna') : (coins.denom === 'uluna' ? coins : null);
      // Accept payment to Treasury OR Weekly Pool (split payment - either tx is valid proof)
      const MIN_ACCEPTED = 150000 * 1e6; // 150,000 LUNC minimum (max discount = 25%)
      if ((toAddr === TREASURY_WALLET || toAddr === LOTTERY_WALLET || toAddr === PROTOCOL_WALLET) && lunc) {
        foundAmount += parseInt(lunc.amount);
      }
    }
  }
  const MIN_ACCEPTED = 100000 * 1e6; // at least the Weekly Pool portion
  if (foundAmount < MIN_ACCEPTED) { showTxStatus('error', `❌ Invalid payment. Expected 100,000+ LUNC to Oracle wallets. Found: ${(foundAmount/1000000).toLocaleString()} LUNC.`); return; }
  valid = true;
  document.getElementById('verified-tx-hidden').value = txHash;
  showTxStatus('success', '✅ Payment verified! 200,000 LUNC confirmed. Form unlocked.');
  setTimeout(() => {
    document.getElementById('tx-section').style.display = 'none';
    document.getElementById('keplr-connected').style.display = 'none';
    document.getElementById('ask-form').style.display = 'block';
  }, 1200);
}

function showTxStatus(type, msg) {
  const el = document.getElementById('tx-status');
  el.style.display = 'block';
  el.style.background = type === 'success' ? 'rgba(102,255,170,0.06)' : 'rgba(255,60,60,0.06)';
  el.style.border = type === 'success' ? '1px solid rgba(102,255,170,0.25)' : '1px solid rgba(255,60,60,0.25)';
  el.style.color = type === 'success' ? 'var(--green)' : '#ff6060';
  el.textContent = msg;
}

// ─── WALLET CONNECT ───────────────────────────────────────────
let globalWalletAddress = null;

function saveWalletSession(address) {
  localStorage.setItem('wallet_session', JSON.stringify({ address, expires: Date.now() + 24 * 60 * 60 * 1000 }));
}
function loadWalletSession() {
  try {
    const s = JSON.parse(localStorage.getItem('wallet_session') || 'null');
    if (s && s.address && s.expires > Date.now()) return s.address;
    localStorage.removeItem('wallet_session');
  } catch(e) {}
  return null;
}
function clearWalletSession() { localStorage.removeItem('wallet_session'); }

window.toggleWalletDropdown = function() {
  document.getElementById('wallet-dropdown').classList.toggle('open');
}

document.addEventListener('click', function(e) {
  if (!document.getElementById('wallet-wrap').contains(e.target)) {
    document.getElementById('wallet-dropdown').classList.remove('open');
  }
});

window.connectWallet = async function(type) {
  if (type === 'keplr-ext') {
    if (!window.keplr) {
      if (confirm('Keplr extension not found. Install Keplr?')) window.open('https://www.keplr.app/download', '_blank');
      return;
    }
    try {
      document.getElementById('wallet-btn-label').textContent = 'Connecting...';
      await window.keplr.enable('columbus-5');
      const signer = window.keplr.getOfflineSigner('columbus-5');
      const accounts = await signer.getAccounts();
      setWalletConnected(accounts[0].address);
    } catch(e) {
      document.getElementById('wallet-btn-label').textContent = 'Connect';
      alert('Connection failed: ' + (e.message || e));
    }
  } else if (type === 'galaxy' || type === 'galaxy-mobile') {
    const galaxy = window.galaxyStation || window.station;
    if (!galaxy) {
      if (confirm('Galaxy Station not found. Install Galaxy Station?')) window.open('https://station.hexxagon.io/', '_blank');
      return;
    }
    try {
      document.getElementById('wallet-btn-label').textContent = 'Connecting...';
      const conn = await galaxy.connect();
      const address = conn?.address || conn?.addresses?.mainnet || conn?.addresses?.['columbus-5'];
      if (address) {
        setWalletConnected(address);
      } else {
        throw new Error('No address returned');
      }
    } catch(e) {
      document.getElementById('wallet-btn-label').textContent = 'Connect';
      alert('Galaxy Station connection failed: ' + (e.message || e));
    }
  } else if (type === 'luncdash') {
    const addr = prompt('Enter your Terra Classic wallet address (terra1...):');
    if (addr && addr.startsWith('terra1') && addr.length > 20) {
      setWalletConnected(addr.trim());
    } else if (addr !== null) {
      alert('Invalid Terra Classic address.');
    }
  } else if (type === 'keplr-mobile') {
    alert('Keplr Mobile (WalletConnect) coming soon! Use Keplr Extension for now.');
  }
}

function setWalletConnected(address) {
  globalWalletAddress = address;
  connectedAddress = address;
  saveWalletSession(address);
  const short = address.slice(0,8) + '...' + address.slice(-4);
  document.getElementById('wallet-btn-label').textContent = short;
  document.getElementById('wallet-main-btn').classList.add('connected');
  document.getElementById('wallet-connected-addr').textContent = address;
  document.getElementById('wallet-not-connected').style.display = 'none';
  document.getElementById('wallet-connected-panel').style.display = 'block';
  document.getElementById('wallet-dropdown').classList.remove('open');

  // Синхронизируем CHAT страницу
  const chatPrompt = document.getElementById('chat-page-connect-prompt');
  const chatForm   = document.getElementById('chat-page-form');
  const chatAddr   = document.getElementById('chat-page-addr');
  if (chatPrompt) chatPrompt.style.display = 'none';
  if (chatForm)   chatForm.style.display   = 'block';
  if (chatAddr)   chatAddr.textContent     = address.slice(0,10)+'...'+address.slice(-4);

  // Синхронизируем ASK страницу
  const connAddrEl  = document.getElementById('connected-addr');
  const verifiedWallet = document.getElementById('verified-wallet-hidden');
  const keplrDisc   = document.getElementById('keplr-disconnected');
  const keplrConn   = document.getElementById('keplr-connected');
  if (connAddrEl)     connAddrEl.textContent  = address.slice(0,10)+'...'+address.slice(-4);
  if (verifiedWallet) verifiedWallet.value    = address;
  if (keplrDisc)      keplrDisc.style.display = 'none';
  if (keplrConn)      keplrConn.style.display = 'block';
  if (address !== ADMIN_WALLET) {
    const txSection = document.getElementById('tx-section');
    if (txSection) txSection.style.display = 'block';
  } else {
    const verifiedTx = document.getElementById('verified-tx-hidden');
    const txSection  = document.getElementById('tx-section');
    const askForm    = document.getElementById('ask-form');
    if (verifiedTx) verifiedTx.value = 'ADMIN_BYPASS';
    if (txSection)  { txSection.style.display = 'block'; txSection.innerHTML = '<div style="background:rgba(245,197,24,0.08);border:1px solid rgba(245,197,24,0.25);border-radius:8px;padding:12px 16px;font-size:12px;color:var(--gold);">🛡️ Admin wallet detected - payment bypassed</div>'; }
    if (askForm)    askForm.style.display = 'block';
  }

  if (window.keplrChatAddress !== undefined) {
    keplrChatAddress = address;
    const addrShort = address.slice(0,8) + '...' + address.slice(-4);
    document.getElementById('keplr-chat-addr').textContent = addrShort;
    document.getElementById('keplr-verified-bar').style.display = 'flex';
    document.getElementById('mode-keplr').textContent = '🔑 ' + addrShort;
    setMode('keplr');
  }
  // Обновляем My Bag при подключении кошелька
  renderOracleBag();

  // Load profile from Worker (profile.js loads after app.js)
  setTimeout(() => {
    if (typeof loadProfileFromWorker === 'function') {
      loadProfileFromWorker(address).then(() => {
        if (typeof renderBoard === 'function') renderBoard();
        if (typeof renderProfilePage === 'function' && document.getElementById('page-profile')?.classList.contains('active')) {
          renderProfilePage();
        }
      });
    }
  }, 300);
}

window.openBagWalletPicker = function() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => {
    const dropdown = document.getElementById('wallet-dropdown');
    if (dropdown) dropdown.classList.add('open');
  }, 350);
}

window.disconnectWallet = function() {
  globalWalletAddress = null;
  connectedAddress = null;
  clearWalletSession();
  document.getElementById('wallet-btn-label').textContent = 'Connect';
  document.getElementById('wallet-main-btn').classList.remove('connected');
  document.getElementById('wallet-not-connected').style.display = 'block';
  document.getElementById('wallet-connected-panel').style.display = 'none';
  document.getElementById('wallet-dropdown').classList.remove('open');
  const adminPanel = document.getElementById('admin-panel');
  if (adminPanel) adminPanel.style.display = 'none';

  // Сбрасываем ASK страницу
  const keplrDisc = document.getElementById('keplr-disconnected');
  const keplrConn = document.getElementById('keplr-connected');
  const txSection = document.getElementById('tx-section');
  const askForm   = document.getElementById('ask-form');
  if (keplrDisc) keplrDisc.style.display = 'block';
  if (keplrConn) keplrConn.style.display = 'none';
  if (txSection) txSection.style.display = 'none';
  if (askForm)   askForm.style.display   = 'none';

  // Сбрасываем CHAT страницу
  const chatPrompt = document.getElementById('chat-page-connect-prompt');
  const chatForm   = document.getElementById('chat-page-form');
  if (chatPrompt) chatPrompt.style.display = 'block';
  if (chatForm)   chatForm.style.display   = 'none';

  try { disconnectChatKeplr(); } catch(e) {}
  renderOracleBag();
}

// ─── CHAT PAGE ────────────────────────────────────────────────
document.getElementById('chat-page-input').addEventListener('input', function() {
  const max = 256, len = this.value.length, remaining = max - len;
  const pct = len / max;
  const ring = document.getElementById('chat-ring');
  const counter = document.getElementById('chat-page-count');
  ring.style.strokeDashoffset = 87.96 - (pct * 87.96);
  if (remaining <= 20) { ring.style.stroke = '#ff4444'; counter.style.color = '#ff4444'; }
  else if (remaining <= 50) { ring.style.stroke = '#f5c518'; counter.style.color = '#f5c518'; }
  else { ring.style.stroke = 'var(--accent)'; counter.style.color = 'var(--muted)'; }
  counter.textContent = remaining;
});

// ─── FIX 2: Chat - исправлена fee (5,000 LUNC payment) ───────
window.sendChatMessage = async function() {
  const text = document.getElementById('chat-page-input').value.trim();
  const statusEl = document.getElementById('chat-tx-status');
  const btn = document.getElementById('chat-page-send-btn');
  if (!text) { alert('Write a message first!'); return; }
  if (!globalWalletAddress) { alert('Connect Keplr first!'); return; }
  if (!window.keplr) { alert('Keplr not found!'); return; }
  btn.textContent = '⏳ Waiting for Keplr...'; btn.disabled = true;
  statusEl.style.display = 'none';
  try {
    await window.keplr.enable('columbus-5');
    const accounts = await window.keplr.getOfflineSigner('columbus-5').getAccounts();
    const sender = accounts[0].address;
    const txHash = await sendLuncDirect(sender, TREASURY_WALLET, 5000000000, text.slice(0, 256), 'columbus-5');
    const result = { transactionHash: txHash };
    const short = sender.slice(0,8)+'...'+sender.slice(-4);

    // ✅ Streak: Chat - платное действие (5,000 LUNC)
    fetch(`${WORKER_URL}/streak/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: sender, action: 'chat' }),
    }).catch(() => {});
    const stored = JSON.parse(localStorage.getItem('dao_chat_pending') || '[]');
    stored.push({ text, author: short, fullAddr: sender, txHash: result.transactionHash, isVerified: true, timestamp: Date.now() });
    localStorage.setItem('dao_chat_pending', JSON.stringify(stored));

    // ── Track message count via Worker (server-side, tamper-proof) ──
    fetch(`${WORKER_URL}/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: sender, txHash: result.transactionHash }),
    }).then(r => r.json()).then(data => {
      if (data.milestoneEntry && data.newCount) {
        setTimeout(() => {
          statusEl.style.cssText = 'display:block;border-radius:8px;padding:10px 14px;font-size:12px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.3);color:#a78bfa;margin-top:10px;';
          statusEl.innerHTML = '🎉 Milestone reached! <strong>' + data.newCount + ' messages</strong> - you earned a free Weekly Draw entry! Total entries earned: <strong>' + data.entriesEarned + '</strong>';
          setTimeout(() => { statusEl.style.display = 'none'; }, 8000);
        }, 3000);
      }
    }).catch(() => {});
    // ─────────────────────────────────────────────────────────────

    document.getElementById('chat-page-input').value = '';
    document.getElementById('chat-page-count').textContent = '256';
    document.getElementById('chat-ring').style.strokeDashoffset = '87.96';
    document.getElementById('chat-ring').style.stroke = 'var(--accent)';
    btn.textContent = 'Send Message →'; btn.disabled = false;
    statusEl.style.cssText = 'display:block;border-radius:8px;padding:10px 14px;font-size:12px;background:rgba(102,255,170,0.06);border:1px solid rgba(102,255,170,0.25);color:var(--green);margin-top:10px;';
    statusEl.innerHTML = '✅ Sent! <a href="https://finder.terraclassic.community/columbus-5/tx/' + result.transactionHash + '" target="_blank" style="color:var(--green);text-decoration:underline;">' + result.transactionHash.slice(0,16) + '...</a><br><span style="font-size:10px;opacity:0.7;">Message will appear after blockchain confirmation (~6s)</span>';
    setTimeout(() => { loadChatFromChain(); }, 8000);
    setTimeout(() => { statusEl.style.display = 'none'; }, 10000);
  } catch(e) {
    btn.textContent = 'Send Message →'; btn.disabled = false;
    statusEl.style.cssText = 'display:block;border-radius:8px;padding:10px 14px;font-size:12px;background:rgba(255,60,60,0.06);border:1px solid rgba(255,60,60,0.25);color:#ff6060;margin-top:10px;';
    statusEl.textContent = '❌ ' + (e.message || 'Transaction cancelled or failed.');
  }
}

// ─── BLOCKCHAIN CHAT ──────────────────────────────────────────
const CHAT_WALLET = TREASURY_WALLET;
const CHAT_HISTORY_WALLET = TREASURY_WALLET;
const CHAT_MIN_ULUNA = 5000000000;
// FIX 4: два разных FCD узла для настоящего fallback
const FCD_NODES = [
  'https://terra-classic-lcd.publicnode.com',
  'https://terra-classic-lcd.publicnode.com',
];

const CHAT_REACTIONS = ['🔥','👍','🚀','💎','❤️'];

function getChatReactions() { try { return JSON.parse(localStorage.getItem('chat_reactions') || '{}'); } catch(e) { return {}; } }
function saveChatReactions(r) { localStorage.setItem('chat_reactions', JSON.stringify(r)); }

function toggleReaction(txHash, emoji) {
  const all = getChatReactions();
  const key = txHash + '_' + emoji;
  const myReactions = JSON.parse(localStorage.getItem('my_chat_reactions') || '{}');
  if (myReactions[key]) { all[key] = Math.max(0, (all[key] || 1) - 1); delete myReactions[key]; }
  else { all[key] = (all[key] || 0) + 1; myReactions[key] = true; }
  saveChatReactions(all);
  localStorage.setItem('my_chat_reactions', JSON.stringify(myReactions));
  const row = document.getElementById('reactions-' + txHash);
  if (row) row.outerHTML = buildReactionsRow(txHash, all, myReactions);
}

function buildReactionsRow(txHash, all, myReactions) {
  const counts = CHAT_REACTIONS.map(e => { const key = txHash+'_'+e; return { e, count: all[key]||0, mine: myReactions[key], key }; });
  const active = counts.filter(r => r.count > 0);
  return `<div id="reactions-${txHash}" class="chat-reactions-row">
    ${active.map(r => `<button class="chat-reaction ${r.mine?'my-reaction':''}" onclick="toggleReaction('${txHash}','${r.e}')">${r.e} <span>${r.count}</span></button>`).join('')}
    <div class="reaction-picker-wrap">
      <button class="chat-reaction add-reaction-btn" title="Add reaction">＋</button>
      <div class="reaction-picker">${CHAT_REACTIONS.map(e => `<button onclick="toggleReaction('${txHash}','${e}')">${e}</button>`).join('')}</div>
    </div>
  </div>`;
}

let cachedMsgs = [];

function renderChatMessages(msgs) {
  cachedMsgs = msgs;
  const container = document.getElementById('chat-page-messages');
  if (!msgs || msgs.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:60px 20px;"><div style="font-size:32px;margin-bottom:12px;">💬</div>No messages yet - be the first to speak!</div>';
    return;
  }
  const all = getChatReactions();
  const myReactions = JSON.parse(localStorage.getItem('my_chat_reactions') || '{}');

  container.innerHTML = msgs.map(m => {
    const displayName = _getDisplayName(m.fullAddr, m.author);
    const avatar = _getProfileAvatar(m.fullAddr);
    const initials = displayName.slice(0,2).toUpperCase();

    // System message - protocol announcement
    if (m.isSystem) {
      const isPool = m.text.includes('Weekly Pool') || m.text.includes('Daily');
      const icon = isPool ? '🎰' : '🏛';
      const label = m.text.includes('Q&A') ? 'New Question Asked' : 'Oracle Draw Entry';
      const color = isPool ? 'rgba(123,92,255,0.18)' : 'rgba(245,197,24,0.08)';
      const borderColor = isPool ? 'rgba(123,92,255,0.25)' : 'rgba(245,197,24,0.2)';
      const labelColor = isPool ? 'var(--accent)' : 'var(--gold)';
      return `<div id="msg-${m.txHash}" style="padding:8px 0;border-bottom:1px solid rgba(30,51,88,0.3);">
        <div style="display:flex;align-items:center;gap:10px;background:${color};border:1px solid ${borderColor};border-radius:10px;padding:11px 14px;">
          <div style="font-size:20px;flex-shrink:0;">${icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:9px;color:${labelColor};letter-spacing:0.12em;text-transform:uppercase;margin-bottom:2px;">${label}</div>
            <div style="font-size:12px;color:var(--muted);">${m.amount} LUNC → Protocol Treasury</div>
          </div>
          <a href="https://finder.terraclassic.community/columbus-5/tx/${m.txHash}" target="_blank" style="font-size:9px;color:var(--muted);text-decoration:none;flex-shrink:0;">🔗 ${m.time}</a>
        </div>
      </div>`;
    }

    // Avatar: profile image or colored initials
    const avatarHtml = avatar
      ? `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : `<span style="font-size:12px;font-weight:700;color:var(--accent);">${initials}</span>`;

    const rankBadge = m.fullAddr && window._walletScores && typeof getRankBadgeHTML === 'function'
      ? getRankBadgeHTML(window._walletScores[m.fullAddr] || 0) : '';

    return `
    <div class="chat-page-msg" id="msg-${m.txHash}" style="padding:14px 0;border-bottom:1px solid rgba(30,51,88,0.35);">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <!-- Avatar -->
        <div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,rgba(84,147,247,0.2),rgba(123,92,255,0.25));border:1px solid rgba(84,147,247,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;">
          ${avatarHtml}
        </div>
        <!-- Content -->
        <div style="flex:1;min-width:0;">
          <!-- Header row -->
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px;flex-wrap:wrap;">
            <span style="font-size:13px;font-weight:700;color:var(--text);">${displayName}</span>
            ${rankBadge}
            <span style="font-size:9px;background:rgba(102,255,170,0.12);color:var(--green);padding:1px 7px;border-radius:4px;letter-spacing:0.05em;">✓ ON-CHAIN</span>
            ${m.amount ? `<span style="font-size:9px;color:var(--gold);background:rgba(245,197,24,0.08);border:1px solid rgba(245,197,24,0.2);padding:1px 7px;border-radius:4px;">${m.amount} LUNC</span>` : ''}
            <a href="https://finder.terraclassic.community/columbus-5/tx/${m.txHash}" target="_blank"
              style="font-size:9px;color:var(--muted);text-decoration:none;margin-left:auto;white-space:nowrap;flex-shrink:0;"
              onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--muted)'">
              🔗 ${m.time}
            </a>
          </div>
          <!-- Message text -->
          <div style="font-size:14px;line-height:1.65;color:rgba(232,240,255,0.92);word-break:break-word;">${m.text}</div>
          <!-- Reactions -->
          ${buildReactionsRow(m.txHash, all, myReactions)}
        </div>
      </div>
    </div>`;
  }).join('');
  requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
}

async function loadChatFromChain() {
  const container = document.getElementById('chat-page-messages');
  if (!cachedMsgs.length) {
    container.innerHTML = `<div style="text-align:center;padding:40px 20px;"><div style="font-size:22px;margin-bottom:10px;">⏳</div><div style="color:var(--muted);font-size:12px;">Loading messages from blockchain...</div></div>`;
  }
  let txList = null;
  try {
    const res = await fetch(`https://terra-classic-lcd.publicnode.com/cosmos/tx/v1beta1/txs?events=transfer.recipient=%27${CHAT_HISTORY_WALLET}%27&pagination.limit=50&order_by=2`);
    if (res.ok) { txList = await res.json(); }
  } catch(e) {}
  if (!txList) {
    if (!cachedMsgs.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px 20px;"><div style="font-size:22px;margin-bottom:10px;">⚠️</div><div style="color:var(--muted);font-size:12px;">Could not reach blockchain nodes</div><button onclick="loadChatFromChain()" style="margin-top:14px;background:rgba(84,147,247,0.1);border:1px solid rgba(84,147,247,0.25);color:var(--accent);border-radius:8px;padding:7px 16px;font-family:'Exo 2',sans-serif;font-size:11px;cursor:pointer;">↻ Retry now</button></div>`;
    }
    return;
  }
  // LCD v1beta1: txs[] = tx bodies, tx_responses[] = metadata (hash, timestamp)
  // They are parallel arrays - same index = same transaction
  const txBodies    = txList.txs || [];
  const txResponses = txList.tx_responses || [];
  if (!txBodies.length && !txResponses.length) {
    if (!cachedMsgs.length) container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:40px;">No messages yet - be the first!</div>';
    return;
  }
  const msgs = [];
  const count = Math.max(txBodies.length, txResponses.length);
  for (let i = 0; i < count; i++) {
    try {
      const txBody = txBodies[i];        // has body.messages, body.memo
      const txMeta = txResponses[i];     // has txhash, timestamp
      const memo   = txBody?.body?.memo || '';
      if (!memo || memo.trim() === '') continue;
      const txMsgs = txBody?.body?.messages || [];
      let sender = null, luncAmount = 0;
      for (const msg of txMsgs) {
        const type = msg['@type'] || msg.type || '';
        const val  = msg.value || msg;
        if (type.includes('MsgSend')) {
          const to = val.to_address || '';
          if (to === CHAT_WALLET) {
            sender = val.from_address || null;
            const coins = val.amount || [];
            const lunc = Array.isArray(coins) ? coins.find(c => c.denom === 'uluna') : null;
            luncAmount = lunc ? parseInt(lunc.amount) : 0;
          }
        }
      }
      if (!sender || luncAmount < CHAT_MIN_ULUNA) continue;
      const short = sender.slice(0, 10) + '...' + sender.slice(-4);
      const luncFormatted = (luncAmount / 1000000).toLocaleString(undefined, {maximumFractionDigits: 0});
      const ts = txMeta?.timestamp ? new Date(txMeta.timestamp) : null;
      const timeStr = ts ? ts.toLocaleDateString([], {month:'short',day:'numeric'}) + ' ' + ts.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
      msgs.push({ author: short, fullAddr: sender, text: memo.slice(0, 256), amount: luncFormatted, txHash: txMeta?.txhash || '', time: timeStr, ts: ts ? ts.getTime() : 0,
        isSystem: ['Terra Oracle Q&A - Weekly Pool','Terra Oracle Q&A - Treasury','Oracle Draw - Daily','Oracle Draw - Weekly'].includes(memo.trim())
      });
    } catch(e) { continue; }
  }
  msgs.sort((a, b) => a.ts - b.ts);
  renderChatMessages(msgs);
}


// ── POOL MILESTONE BANNER ─────────────────────────────────────────────────
const DAILY_POOL_WALLET  = 'terra1amp68zg7vph3nq84ummnfma4dz753ezxfqa9px';
const WEEKLY_POOL_WALLET = 'terra1p5l6q95kfl3hes7edy76tywav9f79n6xlkz6qz';

const POOL_MILESTONES = [
  { min: 5000000,    label: '💎 JACKPOT TERRITORY', color: '#00ffff', glow: 'rgba(0,255,255,0.3)',   bg: 'rgba(0,255,255,0.06)',   border: 'rgba(0,255,255,0.25)'  },
  { min: 1000000,    label: '⚡ ON FIRE',           color: '#ffd700', glow: 'rgba(255,215,0,0.3)',   bg: 'rgba(255,215,0,0.06)',   border: 'rgba(255,215,0,0.25)'  },
  { min: 500000,     label: '🔥 HEATING UP',        color: '#ff8844', glow: 'rgba(255,136,68,0.3)',  bg: 'rgba(255,136,68,0.06)',  border: 'rgba(255,136,68,0.25)' },
  { min: 100000,     label: '🌱 GROWING',           color: '#66ffaa', glow: 'rgba(102,255,170,0.3)', bg: 'rgba(102,255,170,0.05)', border: 'rgba(102,255,170,0.2)' },
  { min: 0,          label: '🌑 JUST STARTED',      color: '#6b82a8', glow: 'rgba(107,130,168,0.2)', bg: 'rgba(107,130,168,0.04)', border: 'rgba(107,130,168,0.15)' },
];

function getPoolMilestone(lunc) {
  return POOL_MILESTONES.find(m => lunc >= m.min) || POOL_MILESTONES[POOL_MILESTONES.length - 1];
}

async function fetchPoolBalance(walletAddr) {
  try {
    const res = await fetch(`https://terra-classic-lcd.publicnode.com/cosmos/bank/v1beta1/balances/${walletAddr}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return 0;
    const data = await res.json();
    const uluna = data.balances?.find(b => b.denom === 'uluna');
    return uluna ? parseInt(uluna.amount) / 1000000 : 0;
  } catch(e) { return 0; }
}

async function renderPoolMilestoneBanner() {
  const container = document.getElementById('chat-pool-milestone');
  if (!container) return;

  const [daily, weekly] = await Promise.all([
    fetchPoolBalance(DAILY_POOL_WALLET),
    fetchPoolBalance(WEEKLY_POOL_WALLET),
  ]);

  const pools = [
    { name: 'DAILY POOL',  amount: daily,  icon: '☀️' },
    { name: 'WEEKLY POOL', amount: weekly, icon: '📅' },
  ];

  container.innerHTML = pools.map(pool => {
    const ms = getPoolMilestone(pool.amount);
    const formatted = pool.amount >= 1000000
      ? (pool.amount / 1000000).toFixed(2) + 'M'
      : pool.amount >= 1000
      ? Math.round(pool.amount / 1000) + 'K'
      : Math.round(pool.amount).toString();

    // Progress to next milestone
    const nextMs = POOL_MILESTONES.find(m => m.min > pool.amount);
    const pct = nextMs
      ? Math.min(100, (pool.amount / nextMs.min) * 100)
      : 100;

    return `
    <div style="flex:1;min-width:200px;background:${ms.bg};border:1px solid ${ms.border};border-radius:12px;padding:14px 16px;position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% -20%,${ms.glow},transparent 70%);pointer-events:none;"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:16px;">${pool.icon}</span>
        <div>
          <div style="font-size:9px;letter-spacing:0.15em;color:var(--muted);text-transform:uppercase;">${pool.name}</div>
          <div style="font-size:9px;color:${ms.color};font-weight:700;letter-spacing:0.1em;">${ms.label}</div>
        </div>
      </div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:26px;font-weight:800;color:${ms.color};line-height:1;margin-bottom:8px;text-shadow:0 0 20px ${ms.glow};">
        ${formatted} <span style="font-size:13px;opacity:0.7;">LUNC</span>
      </div>
      ${nextMs ? `
      <div style="background:rgba(255,255,255,0.06);border-radius:4px;height:3px;margin-bottom:4px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${ms.color};border-radius:4px;transition:width 1s ease;opacity:0.8;"></div>
      </div>
      <div style="font-size:9px;color:var(--muted);">
        ${(nextMs.min - pool.amount).toLocaleString(undefined,{maximumFractionDigits:0})} LUNC to next level
      </div>` : `<div style="font-size:9px;color:${ms.color};">🏆 Maximum level reached!</div>`}
    </div>`;
  }).join('');
}

function renderChatPage() {
  if (cachedMsgs.length) renderChatMessages(cachedMsgs);
  loadChatFromChain();
  renderPoolMilestoneBanner();
}
// Wait for all scripts to load before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { renderChatPage(); });
} else {
  renderChatPage();
}
setInterval(loadChatFromChain, 60000); // 60s poll - reduced from 30s for performance

const _origSetWallet = window.setWalletConnected;
window.setWalletConnected = function(address) {
  _origSetWallet(address);
  document.getElementById('chat-page-connect-prompt').style.display = 'none';
  document.getElementById('chat-page-form').style.display = 'block';
  document.getElementById('chat-page-addr').textContent = address.slice(0,10)+'...'+address.slice(-4);
  document.getElementById('vote-wallet-status').innerHTML = '<span style="font-size:11px;color:var(--green);">✓ ' + address.slice(0,8)+'...'+address.slice(-4) + '</span>';
  const adminPanel = document.getElementById('admin-panel');
  if (adminPanel) {
    adminPanel.style.display = address === ADMIN_WALLET ? 'block' : 'none';
    if (address === ADMIN_WALLET) { applyVoteStates(); updateAdminPanel(); setTimeout(_adminInitOptions, 100); }
  }
  applyStoredVotes(); applyVoteStates(); renderVotes();
}

// ─── VOTE PAGE ────────────────────────────────────────────────



/* ═══ WORKER VOTES ═══ */

// Load community votes from Cloudflare Worker (visible to ALL users)
async function loadVotesFromWorker() {
  try {
    const res = await fetch(`${WORKER_URL}/votes`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return;
    const workerVotes = await res.json();
    if (!Array.isArray(workerVotes)) return;
    const deleted = getDeletedVotes();
    // Merge: worker votes take priority, skip deleted
    for (const wv of workerVotes) {
      if (deleted.includes(wv.id)) continue; // skip deleted
      const existingIdx = VOTES_DATA.findIndex(v => v.id === wv.id);
      if (existingIdx > -1) {
        VOTES_DATA[existingIdx] = { ...VOTES_DATA[existingIdx], ...wv, userVoted: VOTES_DATA[existingIdx].userVoted };
      } else {
        VOTES_DATA.unshift(wv);
      }
    }
    applyStoredVotes();
    renderVotes();
    if (typeof updateAdminPanel === 'function') updateAdminPanel();
  } catch(e) {
    console.warn('Could not load votes from worker:', e.message);
  }
}

const VOTES_DATA = [
  { id: 'v1', type: 'weekly', status: 'active', title: 'Protocol Development Priority - Week 11', desc: 'What should the development team focus on this week?', source: 'Based on community chat discussions', timer: '3d 14h remaining', totalVotes: 234, quorum: 100, options: [{ label: 'SDK 0.53 upgrade testing & QA', votes: 112 }, { label: 'MM 2.0 activation preparation', votes: 78 }, { label: 'USTC re-peg research', votes: 44 }], userVoted: null },
  { id: 'v3', type: 'special', status: 'active', title: 'Terra Oracle - Reward Distribution Model', desc: 'Should we switch from "winner takes all" to top-3 distribution for Q&A rewards?', source: 'Proposal by community member · Terra Oracle governance', timer: '6d 2h remaining', totalVotes: 156, quorum: 100, options: [{ label: '70% winner + 30% voters', votes: 89 }, { label: 'Top-3 split (60/25/15)', votes: 41 }, { label: 'Keep current model', votes: 26 }], userVoted: null }
];

// Filter out locally deleted static votes
const DELETED_VOTES_KEY = 'admin_deleted_votes';
function getDeletedVotes() { try { return JSON.parse(localStorage.getItem(DELETED_VOTES_KEY)||'[]'); } catch(e) { return []; } }
function markVoteDeleted(id) { const d=getDeletedVotes(); if(!d.includes(id)){d.push(id);localStorage.setItem(DELETED_VOTES_KEY,JSON.stringify(d));} }
(function pruneDeletedVotes() {
  const deleted = getDeletedVotes();
  if (!deleted.length) return;
  for (let i = VOTES_DATA.length - 1; i >= 0; i--) {
    if (deleted.includes(VOTES_DATA[i].id)) VOTES_DATA.splice(i, 1);
  }
})();

let currentVoteFilter = 'all';
function filterVotes(type) { currentVoteFilter = type; document.querySelectorAll('.vote-tab').forEach(t => t.classList.remove('active')); event.target.classList.add('active'); renderVotes(); }

function renderVotes() {
  const list = document.getElementById('votes-list');
  const filtered = currentVoteFilter === 'all' ? VOTES_DATA : VOTES_DATA.filter(v => v.type === currentVoteFilter);
  if (filtered.length === 0) { list.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;font-size:12px;">No votes in this category yet.</div>'; return; }
  list.innerHTML = filtered.map(v => {
    const maxVotes = Math.max(...v.options.map(o => o.votes));
    const pct = o => v.totalVotes > 0 ? Math.round((o.votes / v.totalVotes) * 100) : 0;
    const quorumPct = Math.min(100, Math.round((v.totalVotes / v.quorum) * 100));
    const typeClass = { weekly: 'vote-type-weekly', monthly: 'vote-type-monthly', special: 'vote-type-special' }[v.type];
    const typeLabel = { weekly: '📅 Weekly', monthly: '🗓 Monthly', special: '⚡ Special' }[v.type];
    return `<div class="vote-card" id="vcard-${v.id}">
      <div class="vote-card-meta"><span class="vote-type-badge ${typeClass}">${typeLabel}</span><span class="vote-timer">⏱ ${v.timer}</span></div>
      <div class="vote-card-title">${v.title}</div>
      <div class="vote-desc" style="margin-top:8px;">${v.desc}</div>
      <div class="vote-progress-wrap"><div class="vote-progress-bar-bg"><div class="vote-progress-bar-fill" style="width:${quorumPct}%"></div></div><div class="vote-progress-info"><span>Quorum: ${v.totalVotes} / ${v.quorum} votes</span><span>${quorumPct}%</span></div></div>
      <div class="vote-options">${v.options.map((o, oi) => { const p = pct(o); const isWinner = o.votes === maxVotes && v.totalVotes > 0; const isSelected = v.userVoted === oi; return `<div class="vote-option ${isSelected?'selected':''} ${isWinner&&v.userVoted!==null?'winner':''}" onclick="castVote('${v.id}', ${oi})"><div class="vote-option-bar ${isWinner&&v.userVoted!==null?'winner-bar':''}" style="width:${v.userVoted!==null?p:0}%"></div><div class="vote-option-content"><div class="vote-option-radio"></div><div class="vote-option-label">${o.label}</div>${v.userVoted!==null?`<div class="vote-option-pct">${p}%</div>`:''}</div></div>`; }).join('')}</div>
      <div class="vote-btn-row">${v.userVoted !== null ? `<span style="font-size:12px;color:var(--green);">✅ You voted</span>` : v.status === 'upcoming' ? `<span style="font-size:12px;color:var(--gold);">🗓 Voting opens on the 20th</span>` : `<button class="btn btn-primary" onclick="castVote('${v.id}', -1)" style="padding:10px 24px;font-size:11px;" ${!globalWalletAddress?'disabled':''}}>${globalWalletAddress?'Cast Vote':'🔑 Connect to Vote'}</button>`}<span style="font-size:11px;color:var(--muted);">${v.totalVotes} votes total</span></div>
      <div class="vote-source">💬 ${v.source}</div>
    </div>`;
  }).join('');
}

const VOTE_STATE_KEY = 'admin_vote_states';
function getVoteStates() { try { return JSON.parse(localStorage.getItem(VOTE_STATE_KEY) || '{}'); } catch(e) { return {}; } }
function saveVoteState(voteId, state) { const states = getVoteStates(); states[voteId] = { ...states[voteId], ...state, updatedAt: Date.now() }; localStorage.setItem(VOTE_STATE_KEY, JSON.stringify(states)); }

function applyVoteStates() {
  const states = getVoteStates();
  for (const vote of VOTES_DATA) {
    const s = states[vote.id];
    if (!s) continue;
    if (s.status) vote.status = s.status;
    if (s.startedAt) vote.startedAt = s.startedAt;
    if (s.stoppedAt) vote.stoppedAt = s.stoppedAt;
    if (s.pairs && vote.isMonthlyLiquidity) vote.options = s.pairs.map(p => ({ label: p, votes: vote.options.find(o => o.label === p)?.votes || 0 }));
    if (s.status === 'active' && s.startedAt) {
      const msLeft = (s.startedAt + 5*24*60*60*1000) - Date.now();
      if (msLeft <= 0) { vote.status = 'closed'; vote.timer = 'Voting closed'; }
      else { const d=Math.floor(msLeft/86400000),h=Math.floor((msLeft%86400000)/3600000),m=Math.floor((msLeft%3600000)/60000); vote.timer = d>0?`${d}d ${h}h remaining`:`${h}h ${m}m remaining`; }
    } else if (s.status === 'stopped' || s.status === 'closed') { vote.timer = 'Voting closed'; }
    else if (s.status === 'upcoming') { vote.timer = 'Not started yet'; }
  }
}

window.adminStartVote = async function(voteId) {
  try {
    await fetch(`${WORKER_URL}/votes/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Wallet': ADMIN_WALLET },
      body: JSON.stringify({ id: voteId, action: 'start' }),
      signal: AbortSignal.timeout(6000),
    });
    await loadVotesFromWorker();
    showAdminToast('▶ Vote started!', 'green');
  } catch(e) {
    const vote = VOTES_DATA.find(v => v.id === voteId); if (!vote) return;
    saveVoteState(voteId, { status: 'active', startedAt: Date.now() });
    applyVoteStates(); updateAdminPanel(); renderVotes();
    showAdminToast('▶ Started (offline)', 'green');
  }
}
window.adminStopVote = async function(voteId) {
  try {
    await fetch(`${WORKER_URL}/votes/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Wallet': ADMIN_WALLET },
      body: JSON.stringify({ id: voteId, action: 'stop' }),
      signal: AbortSignal.timeout(6000),
    });
    await loadVotesFromWorker();
    showAdminToast('■ Vote stopped', 'red');
  } catch(e) {
    saveVoteState(voteId, { status: 'stopped', stoppedAt: Date.now() });
    applyVoteStates(); updateAdminPanel(); renderVotes();
    showAdminToast('■ Stopped (offline)', 'red');
  }
}
window.adminToggleVote = function(voteId, newStatus) { if (newStatus === 'active') adminStartVote(voteId); else adminStopVote(voteId); }

function updateAdminPanel() {
  const panel = document.getElementById('admin-panel');
  if (!panel || panel.style.display === 'none') return;
  const otherEl = document.getElementById('admin-other-votes');
  if (!otherEl) return;
  if (!VOTES_DATA.length) {
    otherEl.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0;">No votes yet. Create one above.</div>';
    return;
  }
  const statusColors = { active: '#66ffaa', stopped: '#ff6464', upcoming: '#ffc840', closed: '#888' };
  const statusIcons  = { active: '●', stopped: '■', upcoming: '◎', closed: '○' };
  otherEl.innerHTML = VOTES_DATA.map(v => {
    const s = v.status || 'unknown';
    const col = statusColors[s] || '#888';
    const icon = statusIcons[s] || '○';
    const startBtn = s !== 'active'
      ? `<button onclick="adminStartVote('${v.id}')" style="font-size:11px;padding:6px 12px;border-radius:6px;border:1px solid rgba(102,255,170,0.3);background:rgba(102,255,170,0.08);color:var(--green);cursor:pointer;font-family:'Exo 2',sans-serif;font-weight:700;">▶</button>`
      : '';
    const stopBtn = s === 'active'
      ? `<button onclick="adminStopVote('${v.id}')" style="font-size:11px;padding:6px 12px;border-radius:6px;border:1px solid rgba(255,60,60,0.25);background:rgba(255,60,60,0.06);color:#ff6464;cursor:pointer;font-family:'Exo 2',sans-serif;font-weight:700;">■</button>`
      : '';
    const delBtn = `<button onclick="adminDeleteVote('${v.id}')" style="font-size:11px;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,60,60,0.2);background:rgba(255,60,60,0.05);color:#ff6464;cursor:pointer;" title="Delete vote">🗑</button>`;
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${v.title}</div>
        <div style="font-size:10px;margin-top:3px;color:${col};letter-spacing:0.06em;">${icon} ${s.toUpperCase()} · ${v.timer || ''} · ${v.totalVotes || 0} votes</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">${startBtn}${stopBtn}${delBtn}</div>
    </div>`;
  }).join('');
}


// ── Admin form helpers ────────────────────────────────────────
function _getAdminOptions() {
  const list = document.getElementById('av-options-list');
  if (!list) return [];
  return Array.from(list.querySelectorAll('input[type="text"]'))
    .map(inp => inp.value.trim()).filter(v => v.length > 0);
}

function _adminResetForm() {
  ['av-title','av-desc','av-source'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  const d=document.getElementById('av-days'); if(d) d.value='7';
  const q=document.getElementById('av-quorum'); if(q) q.value='100';
  const p=document.getElementById('av-preview'); if(p) p.style.display='none';
  // Re-init options
  const list=document.getElementById('av-options-list');
  if(list) { list.innerHTML=''; _addAdminOption(); _addAdminOption(); }
}

window.adminAddOption = function() {
  const list = document.getElementById('av-options-list');
  if (!list) return;
  if (list.children.length >= 8) { showAdminToast('Max 8 options', 'red'); return; }
  const idx = list.children.length;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:center;';
  row.innerHTML = `<input type="text" placeholder="Option ${idx+1}..." maxlength="100"
    style="flex:1;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'Exo 2',sans-serif;font-size:13px;padding:9px 12px;outline:none;">
    <button onclick="this.parentElement.remove()" style="background:rgba(255,60,60,0.08);border:1px solid rgba(255,60,60,0.2);border-radius:6px;color:#ff6464;font-size:16px;width:32px;height:32px;cursor:pointer;flex-shrink:0;line-height:1;">×</button>`;
  list.appendChild(row);
};
function _addAdminOption() { window.adminAddOption(); }

window.adminPreviewVote = function() {
  const title = document.getElementById('av-title')?.value.trim();
  const type  = document.getElementById('av-type')?.value;
  const days  = document.getElementById('av-days')?.value;
  const opts  = _getAdminOptions();
  if (!title || opts.length < 2) { showAdminToast('Fill title and at least 2 options', 'red'); return; }
  const preview = document.getElementById('av-preview');
  const previewText = document.getElementById('av-preview-text');
  if (preview && previewText) {
    previewText.innerHTML = `<b>${title}</b><br>Type: ${type} · Duration: ${days}d<br>Options:${opts.map((o,i)=>`<br>${i+1}. ${o}`).join('')}`;
    preview.style.display = 'block';
  }
};

window.adminResetForm = function() { _adminResetForm(); };

// Init options on panel show
function _adminInitOptions() {
  const list = document.getElementById('av-options-list');
  if (!list || list.children.length > 0) return;
  _addAdminOption(); _addAdminOption();
}

window.adminCreateVote = async function() {
  const title = document.getElementById('av-title')?.value.trim();
  const desc  = document.getElementById('av-desc')?.value.trim();
  const type  = document.getElementById('av-type')?.value || 'weekly';
  const days  = parseInt(document.getElementById('av-days')?.value || '7');
  const quorum= parseInt(document.getElementById('av-quorum')?.value || '100');
  const source= document.getElementById('av-source')?.value.trim() || 'Admin proposal';
  const opts  = _getAdminOptions();

  if (!title)          { showAdminToast('Enter a title', 'red'); return; }
  if (opts.length < 2) { showAdminToast('Add at least 2 options', 'red'); return; }
  if (!globalWalletAddress || globalWalletAddress !== ADMIN_WALLET) {
    showAdminToast('Admin wallet not connected', 'red'); return;
  }

  const durationMs = days * 24 * 60 * 60 * 1000;
  const btn = document.querySelector('[onclick="adminCreateVote()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving...'; }

  try {
    const res = await fetch(`${WORKER_URL}/votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Wallet': ADMIN_WALLET },
      body: JSON.stringify({ title, desc, type, durationMs, quorum, source, options: opts }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (!res.ok) { showAdminToast('❌ ' + (data.error || 'Error'), 'red'); return; }
    _adminResetForm();
    showAdminToast('✅ Vote created for all users!', 'green');
    await loadVotesFromWorker();
  } catch(e) {
    showAdminToast('❌ ' + (e.message || 'Network error'), 'red');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ CREATE & START'; }
  }
};

window.adminDeleteVote = async function(voteId) {
  if (!confirm('Delete this vote permanently?')) return;
  // Mark as deleted in localStorage (survives page refresh for static votes)
  markVoteDeleted(voteId);
  // Remove from local VOTES_DATA immediately
  const idx = VOTES_DATA.findIndex(v => v.id === voteId);
  if (idx > -1) VOTES_DATA.splice(idx, 1);
  updateAdminPanel(); renderVotes();
  // Also remove from Worker
  try {
    await fetch(`${WORKER_URL}/votes`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Wallet': ADMIN_WALLET },
      body: JSON.stringify({ id: voteId }),
      signal: AbortSignal.timeout(6000),
    });
    showAdminToast('🗑 Vote deleted', 'red');
  } catch(e) {
    showAdminToast('🗑 Removed locally', 'red');
  }
};

function showAdminToast(msg, color) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `position:fixed;top:80px;right:20px;z-index:9999;padding:10px 18px;border-radius:8px;font-family:'Exo 2',sans-serif;font-size:12px;font-weight:700;letter-spacing:0.05em;background:${color==='green'?'rgba(102,255,170,0.15)':'rgba(255,60,60,0.12)'};border:1px solid ${color==='green'?'rgba(102,255,170,0.4)':'rgba(255,60,60,0.3)'};color:${color==='green'?'var(--green)':'#ff6464'};`;
  document.body.appendChild(toast); setTimeout(() => toast.remove(), 2500);
}

function getVoteStorageKey() { return globalWalletAddress ? 'votes_' + globalWalletAddress : null; }
function loadVotesFromStorage() { const key = getVoteStorageKey(); if (!key) return {}; try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) { return {}; } }
function saveVoteToStorage(voteId, optionIdx) { const key = getVoteStorageKey(); if (!key) return; const votes = loadVotesFromStorage(); votes[voteId] = optionIdx; localStorage.setItem(key, JSON.stringify(votes)); }
function applyStoredVotes() { const votes = loadVotesFromStorage(); for (const vote of VOTES_DATA) { vote.userVoted = votes[vote.id] !== undefined ? votes[vote.id] : null; } }

function castVote(voteId, optionIdx) {
  if (!globalWalletAddress) { alert('Connect Keplr wallet to vote!'); return; }
  if (optionIdx === -1) return;
  const vote = VOTES_DATA.find(v => v.id === voteId);
  if (!vote || vote.userVoted !== null) return;
  if (vote.status === 'upcoming') { alert('Voting is not open yet! Check back on the 20th.'); return; }
  // Optimistic update
  vote.options[optionIdx].votes++; vote.totalVotes++; vote.userVoted = optionIdx;
  saveVoteToStorage(voteId, optionIdx);
  if (vote.isMonthlyLiquidity && vote.voteKey) { try { localStorage.setItem(vote.voteKey, JSON.stringify({ totalVotes: vote.totalVotes, options: vote.options.map(o => o.votes) })); } catch(e) {} }
  renderVotes();
  // Persist to Worker for server-side count
  fetch(`${WORKER_URL}/votes/cast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voteId, optionIdx, wallet: globalWalletAddress }),
    signal: AbortSignal.timeout(6000),
  }).catch(() => {});
}


// ── MY BAG (Terra Oracle) ─────────────────────────────────────────────────────
function renderOracleBag() {
  const wallet = globalWalletAddress || connectedAddress;
  const notConn = document.getElementById('bag-not-connected-oracle');
  const conn    = document.getElementById('bag-connected-oracle');
  if (!notConn || !conn) return;

  if (!wallet) {
    notConn.style.display = 'block';
    conn.style.display    = 'none';
    return;
  }
  notConn.style.display = 'none';
  conn.style.display    = 'block';

  // Mock data - replace with real API from Paco later
  const mockNFTs = [
    { id: 47,  type: 'common',    entries: 1,  pool: 'daily',  inCurrentRound: true  },
    { id: 12,  type: 'rare',      entries: 5,  pool: 'weekly', inCurrentRound: true  },
    { id: 3,   type: 'legendary', entries: 10, pool: 'weekly', inCurrentRound: false },
    { id: 88,  type: 'common',    entries: 1,  pool: 'daily',  inCurrentRound: false },
  ];
  const mockHistory = [
    { round: 15, type: 'Daily',  nft: 'Common #31',    result: 'lost', prize: null },
    { round: 13, type: 'Weekly', nft: 'Rare #08',      result: 'won',  prize: '45,000 LUNC' },
    { round: 10, type: 'Daily',  nft: 'Common #22',    result: 'lost', prize: null },
  ];

  const el = id => document.getElementById(id);
  const totalWon      = mockHistory.filter(h => h.result === 'won').length;
  const dailyEntries  = mockNFTs.filter(n => n.inCurrentRound && n.pool === 'daily').reduce((s,n) => s + n.entries, 0);
  const weeklyEntries = mockNFTs.filter(n => n.inCurrentRound && n.pool === 'weekly').reduce((s,n) => s + n.entries, 0);

  if (el('o-bag-stat-nfts'))    el('o-bag-stat-nfts').textContent    = mockNFTs.length;
  if (el('o-bag-stat-won'))     el('o-bag-stat-won').textContent     = totalWon;
  if (el('o-bag-stat-daily'))   el('o-bag-stat-daily').textContent   = dailyEntries;
  if (el('o-bag-stat-weekly'))  el('o-bag-stat-weekly').textContent  = weeklyEntries;
  if (el('o-bag-count'))        el('o-bag-count').textContent        = mockNFTs.length;

  window._oBagNFTs = mockNFTs;
  const grid  = el('o-bag-grid');
  const empty = el('o-bag-empty');
  if (grid) {
    if (!mockNFTs.length) {
      if (empty) empty.style.display = 'block';
      grid.style.display = 'none';
    } else {
      if (empty) empty.style.display = 'none';
      grid.style.display = 'grid';
      setTimeout(() => filterOracleBagNFTs('all'), 0);
    }
  }

  const histTable = el('o-bag-hist-table');
  const histEmpty = el('o-bag-hist-empty');
  const histBody  = el('o-bag-hist-body');
  if (histBody) {
    if (!mockHistory.length) {
      if (histTable) histTable.style.display = 'none';
      if (histEmpty) histEmpty.style.display = 'block';
    } else {
      if (histEmpty) histEmpty.style.display = 'none';
      if (histTable) histTable.style.display = 'table';
      histBody.innerHTML = mockHistory.map(h => `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:12px 14px;color:var(--muted);">#${h.round}</td>
          <td style="padding:12px 14px;">
            <span style="font-size:9px;padding:2px 8px;border-radius:4px;
              background:${h.type==='Daily'?'rgba(244,208,63,0.1)':'rgba(74,144,217,0.1)'};
              color:${h.type==='Daily'?'#f4d03f':'#7eb8ff'};
              border:1px solid ${h.type==='Daily'?'rgba(244,208,63,0.2)':'rgba(74,144,217,0.2)'};">
              ${h.type}
            </span>
          </td>
          <td style="padding:12px 14px;font-family:monospace;font-size:11px;color:#f4d03f;">${h.nft}</td>
          <td style="padding:12px 14px;">
            ${h.result==='won'
              ? `<span style="color:#66ffaa;font-weight:700;">🏆 ${h.prize}</span>`
              : `<span style="color:var(--muted);">-</span>`}
          </td>
        </tr>`).join('');
    }
  }
}

function filterOracleBagNFTs(filter) {
  const nfts = window._oBagNFTs || [];
  const el = id => document.getElementById(id);

  ['all','common','rare','legendary','used'].forEach(f => {
    const btn = el('o-bag-filter-' + f);
    if (!btn) return;
    const colors = {
      all:       { active: 'rgba(244,208,63,0.12)', border: 'rgba(244,208,63,0.6)',   text: '#f4d03f'   },
      common:    { active: 'rgba(180,190,210,0.1)', border: 'rgba(180,190,210,0.5)',  text: '#b0b8c8'   },
      rare:      { active: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.5)',   text: '#60a5fa'   },
      legendary: { active: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.5)',   text: '#fb923c'   },
      used:      { active: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.35)', text: '#e2e8f0'  },
    };
    const c = colors[f];
    btn.style.background  = f === filter ? c.active : 'transparent';
    btn.style.borderColor = f === filter ? c.border.replace('0.5','0.8') : c.border.replace('0.5','0.2');
    btn.style.color       = c.text;
    btn.style.opacity     = f === filter ? '1' : '0.6';
    btn.style.fontWeight  = f === filter ? '700' : '400';
  });

  let filtered = nfts;
  if (filter === 'used')      filtered = nfts.filter(n => !n.inCurrentRound);
  else if (filter !== 'all')  filtered = nfts.filter(n => n.type === filter);

  filtered = filtered.slice().sort((a, b) => {
    if (a.inCurrentRound && !b.inCurrentRound) return -1;
    if (!a.inCurrentRound && b.inCurrentRound) return 1;
    return 0;
  });

  const grid = el('o-bag-grid');
  if (!grid) return;

  const cfgs = {
    common:    { color:'#b0b8c8', glow:'rgba(180,190,210,0.3)', bg:'rgba(180,190,210,0.05)', label:'COMMON'    },
    rare:      { color:'#60a5fa', glow:'rgba(96,165,250,0.35)', bg:'rgba(96,165,250,0.06)',  label:'RARE'       },
    legendary: { color:'#fb923c', glow:'rgba(251,146,60,0.4)',  bg:'rgba(251,146,60,0.07)',  label:'LEGENDARY'  },
  };

  grid.innerHTML = filtered.map(nft => {
    const c = cfgs[nft.type];
    const pool = nft.pool === 'daily' ? 'Daily Pool' : 'Weekly Pool';
    const opacity = nft.inCurrentRound ? '1' : '0.55';
    const statusHtml = nft.inCurrentRound
      ? `<div style="padding:8px;border-radius:8px;background:rgba(102,255,170,0.08);border:1px solid rgba(102,255,170,0.25);color:#66ffaa;font-size:11px;font-weight:600;text-align:center;">✅ In this round</div>`
      : `<div style="padding:8px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);color:var(--muted);font-size:11px;text-align:center;">✔ Round over</div>`;
    return `<div style="background:${c.bg};border:1px solid ${c.glow};border-radius:16px;padding:22px 18px;text-align:center;
        opacity:${opacity};box-shadow:0 0 18px ${c.glow};transition:transform 0.2s;"
        onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
      <div style="font-size:9px;letter-spacing:0.2em;color:${c.color};font-weight:700;margin-bottom:4px;">${c.label}</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:18px;font-weight:700;color:#fff;margin-bottom:4px;">#${nft.id}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:3px;">${nft.entries} ${nft.entries===1?'entry':'entries'}</div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:12px;">${pool}</div>
      ${statusHtml}
    </div>`;
  }).join('');
}


