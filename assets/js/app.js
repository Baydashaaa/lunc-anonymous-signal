if (history.scrollRestoration) history.scrollRestoration = 'manual';

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
      { alias: 'Anonymous#8821', isAdmin: false, title: '⚡ Oracle', text: 'No formal proposal yet, but several validators have discussed it in the bi-weekly call. The main blocker is liquidity depth — USTC needs at least $50M TVL before a peg mechanism is viable.', votes: 8, voted: false },
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
function loadQuestions() {
  try {
    const stored = JSON.parse(localStorage.getItem('oracle_questions') || 'null');
    if (Array.isArray(stored) && stored.length > 0 && stored[0].id && stored[0].text) {
      return stored.map(q => ({
        answers: [], votes: 0, voted: false, open: false, formOpen: false,
        tags: [], createdAt: Date.now(), ...q
      }));
    }
  } catch(e) {}
  const demo = [...DEMO_QUESTIONS];
  saveQuestions(demo);
  return demo;
}

function saveQuestions(qs) {
  localStorage.setItem('oracle_questions', JSON.stringify(qs));
}

let questions = loadQuestions();
let boardFilter = 'all';
let boardSort = 'new';
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
function showPage(name, e) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');
  if (e && e.target) e.target.classList.add('active');
  if (name === 'board') renderBoard();
  if (name === 'vote') { applyStoredVotes(); applyVoteStates(); renderVotes(); }
  if (name === 'chat') renderChatPage();
  if (typeof stopStatsAutoRefresh === 'function') stopStatsAutoRefresh();
  smoothScrollTop();
}

// ─── TREASURY ─────────────────────────────────────────────────
const TREASURY_WALLETS = {
  oracle:  { addr: 'terra1549z8zd9hkggzlwf0rcuszhc9rs9fxqfy2kagt', balId: 't-oracle-bal',  usdId: 't-oracle-usd'  },
  lottery: { addr: 'terra1amp68zg7vph3nq84ummnfma4dz753ezxfqa9px', balId: 't-lottery-bal', usdId: 't-lottery-usd' },
  burn:    { addr: 'terra16m05j95p9qvq93cdtchjcpwgvny8f57vzdj06p', balId: 't-burn-bal',    usdId: 't-burn-usd'   },
};

// FIX 4: два разных LCD узла для настоящего fallback
const LCD_NODES = ['https://lcd.terraclassic.community', 'https://terra-classic-lcd.publicnode.com'];

function fmtLunc(uluna) {
  const lunc = uluna / 1_000_000;
  if (lunc >= 1_000_000) return (lunc/1_000_000).toFixed(2) + 'M LUNC';
  if (lunc >= 1_000) return (lunc/1_000).toFixed(1) + 'K LUNC';
  return lunc.toLocaleString(undefined, {maximumFractionDigits: 0}) + ' LUNC';
}

async function fetchBalance(addr) {
  for (const lcd of LCD_NODES) {
    try {
      const res = await fetch(`${lcd}/cosmos/bank/v1beta1/balances/${addr}`);
      if (!res.ok) continue;
      const data = await res.json();
      const uluna = data.balances?.find(b => b.denom === 'uluna')?.amount || '0';
      return parseInt(uluna);
    } catch(e) { continue; }
  }
  return null;
}

async function fetchLuncPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=terra-luna&vs_currencies=usd');
    const data = await res.json();
    return data['terra-luna']?.usd || 0.00009;
  } catch(e) { return 0.00009; }
}

async function loadTreasuryData() {
  const btn = document.getElementById('t-refresh-btn');
  if (btn) { btn.textContent = '⏳ Loading...'; btn.disabled = true; }

  const [price, oracleB, lotteryB, burnB] = await Promise.all([
    fetchLuncPrice(),
    fetchBalance(TREASURY_WALLETS.oracle.addr),
    fetchBalance(TREASURY_WALLETS.lottery.addr),
    fetchBalance(TREASURY_WALLETS.burn.addr),
  ]);

  const wallets = [
    { key: 'oracle',  bal: oracleB  },
    { key: 'lottery', bal: lotteryB },
    { key: 'burn',    bal: burnB    },
  ];

  let totalUluna = 0;
  for (const w of wallets) {
    const cfg = TREASURY_WALLETS[w.key];
    if (w.bal === null) {
      document.getElementById(cfg.balId).textContent = 'Error';
      document.getElementById(cfg.usdId).textContent = 'Could not reach node';
    } else {
      totalUluna += w.bal;
      document.getElementById(cfg.balId).textContent = fmtLunc(w.bal);
      document.getElementById(cfg.usdId).textContent = '≈ $' + ((w.bal / 1_000_000) * price).toFixed(2) + ' USD';
    }
  }

  const tvlEl = document.getElementById('t-total-tvl');
  const burnEl = document.getElementById('t-total-burn');
  if (tvlEl) tvlEl.textContent = fmtLunc(totalUluna);
  if (burnEl && burnB !== null) burnEl.textContent = fmtLunc(burnB);

  const updEl = document.getElementById('t-last-updated');
  if (updEl) updEl.textContent = new Date().toLocaleTimeString();

  if (btn) { btn.textContent = '↻ Refresh'; btn.disabled = false; }

  loadRecentTxs();
}

async function loadRecentTxs() {
  const el = document.getElementById('t-recent-txs');
  if (!el) return;
  try {
    const res = await fetch(`https://rest.cosmos.directory/terraclassic/cosmos/tx/v1beta1/txs?events=transfer.recipient=%27${TREASURY_WALLETS.oracle.addr}%27&pagination.limit=5&order_by=2`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (!data.txs || data.txs.length === 0) { el.textContent = 'No transactions yet'; return; }
    el.innerHTML = data.txs.map(tx => {
      const ts = tx.timestamp ? new Date(tx.timestamp).toLocaleDateString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
      const memo = tx.tx?.value?.memo || '';
      const hash = tx.txhash || '';
      return `<div style="display:flex;justify-content:space-between;align-items:center;
        padding:10px 0;border-bottom:1px solid var(--border);gap:12px;">
        <div>
          <div style="font-size:11px;color:var(--text);margin-bottom:2px;">${memo || 'Transfer'}</div>
          <div style="font-size:10px;color:var(--muted);">${ts}</div>
        </div>
        <a href="https://finder.terra.money/classic/tx/${hash}" target="_blank"
          style="font-size:9px;color:var(--accent);text-decoration:none;white-space:nowrap;">🔗 ${hash.slice(0,8)}...</a>
      </div>`;
    }).join('');
  } catch(e) {
    el.textContent = 'Could not load recent transactions';
  }
}

function showPage_treasury(e) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-treasury').classList.add('active');
  loadTreasuryData();
  smoothScrollTop();
}

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
  showPage('home');
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
  const map = {'all':'filter-all','🗳️ Governance':'filter-gov','⚙️ Technical':'filter-tech','⚙️ Validator Issue':'filter-val','📈 Market':'filter-market','🌍 Community':'filter-comm'};
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
        ${q.isAdmin ? `<span class="badge-admin">🛡️ Admin</span>` : `<span class="q-alias">${q.alias}</span>`}
        ${q.title && !q.isAdmin ? `<span class="badge-title">${q.title}</span>` : ''}
        <span class="q-category">${q.category}</span>
        <span class="q-timer">⏱ ${q.time}</span>
        <span class="q-ref">${q.id}</span>
      </div>
      ${q.tags && q.tags.length ? `<div class="q-tags">${q.tags.map(t => `<span class="q-tag ${boardSearch === '#'+t || boardSearch === t ? 'active-tag' : ''}" onclick="setBoardSearch('#${t}')">#${t}</span>`).join('')}</div>` : ''}
      <div class="q-text">${boardSearch ? q.text.replace(new RegExp('(' + boardSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark style="background:rgba(84,147,247,0.25);color:var(--accent);border-radius:2px;padding:0 2px;">$1</mark>') : q.text}</div>
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
        ${q.answers.length === 0 ? `<div style="font-size:12px;color:var(--muted);padding:8px 0;">No answers yet — be the first!</div>` : ''}
        ${q.answers.map((a, ai) => `
          <div class="answer-item ${a.isAdmin ? 'admin-answer' : ''}">
            <div class="answer-meta">
              ${a.isAdmin ? `<span class="badge-admin">🛡️ Admin</span>` : `<span class="q-alias">${a.alias}</span>`}
              ${a.title && !a.isAdmin ? `<span class="badge-title">${a.title}</span>` : ''}
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
            <label>Admin Key <span style="font-size:9px;color:var(--muted);text-transform:none">(optional — leave blank to answer anonymously)</span></label>
            <div class="admin-key-wrap" id="akwrap-${realQi}">
              <input type="password" id="akey-${realQi}" placeholder="Enter key to post as Admin..." oninput="checkAdminKey(${realQi})">
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

function submitAnswer(qi) {
  const text = document.getElementById('atext-' + qi).value.trim();
  const key = document.getElementById('akey-' + qi).value;
  if (!text) { alert('Please write your answer first.'); return; }
  const isAdmin = key === ADMIN_KEY;
  const alias = isAdmin ? 'Admin' : 'Anonymous#' + Math.floor(1000 + Math.random() * 9000);
  questions[qi].answers.push({ alias, isAdmin, title: null, text, votes: 0, voted: false });
  questions[qi].formOpen = false;
  questions[qi].open = true;
  saveQuestions(questions);
  renderBoard();
}

function voteQuestion(qi) {
  if (questions[qi].voted) return;
  questions[qi].votes++; questions[qi].voted = true;
  saveQuestions(questions); renderBoard();
}

function voteAnswer(qi, ai) {
  if (questions[qi].answers[ai].voted) return;
  questions[qi].answers[ai].votes++; questions[qi].answers[ai].voted = true;
  saveQuestions(questions); renderBoard();
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
  const category = formData.get('category') || '📝 Other';
  const text = formData.get('message') || '';
  const txHash = document.getElementById('verified-tx-hidden').value;
  const wallet = document.getElementById('verified-wallet-hidden').value;
  const ref = 'LUNC-' + Date.now().toString(36).toUpperCase().slice(-7);
  const alias = wallet ? ('Anonymous#' + Math.floor(1000 + Math.random() * 9000)) : 'Anonymous';
  const tagsRaw = document.getElementById('tags-hidden').value;
  const tags = tagsRaw ? tagsRaw.split(',').filter(Boolean) : [];
  const newQ = { id: ref, alias, isAdmin: false, title: '🌱 Seeker', category, text, tags, time: 'just now', createdAt: Date.now(), votes: 0, answers: [], voted: false, open: false, formOpen: false, txHash, wallet };
  questions.unshift(newQ);
  saveQuestions(questions);
  try { await fetch(this.action, { method: 'POST', body: formData, headers: { 'Accept': 'application/json' } }); } catch(e) {}
  document.getElementById('ask-form-section').style.display = 'none';
  const success = document.getElementById('ask-success');
  success.classList.add('visible');
  document.getElementById('ask-ref').textContent = 'REF: ' + ref;
  btn.disabled = false;
  btn.innerHTML = 'Transmit Question →';
});

// ─── PROTOCOL WALLETS ─────────────────────────────────────────
const ADMIN_WALLET    = 'terra15jt5a9ycsey4hd6nlqgqxccl9aprkmg2mxmfc6';
const ORACLE_WALLET   = 'terra1549z8zd9hkggzlwf0rcuszhc9rs9fxqfy2kagt';
const LOTTERY_WALLET  = 'terra1amp68zg7vph3nq84ummnfma4dz753ezxfqa9px';
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
    document.getElementById('connected-addr').textContent = connectedAddress.slice(0,10)+'...'+connectedAddress.slice(-4);
    document.getElementById('verified-wallet-hidden').value = connectedAddress;
    document.getElementById('keplr-disconnected').style.display = 'none';
    document.getElementById('keplr-connected').style.display = 'block';
    if (connectedAddress === ADMIN_WALLET) {
      document.getElementById('verified-tx-hidden').value = 'ADMIN_BYPASS';
      document.getElementById('keplr-connected').style.display = 'none';
      document.getElementById('ask-form').style.display = 'block';
      const notice = document.getElementById('tx-section');
      notice.style.display = 'block';
      notice.innerHTML = '<div style="background:rgba(245,197,24,0.08);border:1px solid rgba(245,197,24,0.25);border-radius:8px;padding:12px 16px;font-size:12px;color:var(--gold);">🛡️ Admin wallet detected — payment bypassed</div>';
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

// ─── FIX 1: Ask — исправлена fee (200,000 LUNC payment) ──────
async function autoPayAndUnlock() {
  if (!connectedAddress) { alert('Connect wallet first!'); return; }
  const btn = document.getElementById('verify-btn');
  btn.textContent = '⏳ Opening Keplr...'; btn.disabled = true;
  try {
    const { SigningStargateClient } = await import('https://esm.sh/@cosmjs/stargate@0.32.3?target=es2020&bundle');
    const offlineSigner = window.keplr.getOfflineSigner('columbus-5');
    const RPC = ['https://terra-classic-rpc.publicnode.com', 'https://rpc.terraclassic.community'];
    let client = null;
    for (const rpc of RPC) {
      try { client = await SigningStargateClient.connectWithSigner(rpc, offlineSigner); break; } catch(e) {}
    }
    if (!client) throw new Error('Cannot connect to Terra Classic RPC');
    const result = await client.sendTokens(
      connectedAddress,
      ORACLE_WALLET,
      [{ denom: 'uluna', amount: '200000000000' }],
      // FIX: fee исправлена — 28.325 uluna/gas × 200000 = 5,665,000 uluna (~5.7 LUNC)
      { amount: [{ denom: 'uluna', amount: '5665000' }], gas: '200000' },
      'Terra Oracle Question Payment'
    );
    if (result.code !== 0) throw new Error('TX failed: ' + result.rawLog);
    document.getElementById('verified-tx-hidden').value = result.transactionHash;
    showTxStatus('success', '✅ Payment confirmed! 200,000 LUNC sent. Form unlocked.');
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
    const res = await fetch(`https://rest.cosmos.directory/terraclassic/cosmos/tx/v1beta1/txs/${txHash}`);
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
      if ((toAddr === ORACLE_WALLET || toAddr === PROTOCOL_WALLET) && lunc) {
        foundAmount = parseInt(lunc.amount);
        if (foundAmount >= REQUIRED_LUNC) { valid = true; break; }
      }
    }
  }
  if (!valid) { showTxStatus('error', `❌ Invalid payment. Expected 200,000 LUNC. Found: ${(foundAmount/1000000).toLocaleString()} LUNC.`); return; }
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
  } else if (type === 'keplr-mobile') {
    alert('Keplr Mobile (WalletConnect) coming soon! Use Keplr Extension for now.');
  }
}

function setWalletConnected(address) {
  globalWalletAddress = address;
  saveWalletSession(address);
  const short = address.slice(0,8) + '...' + address.slice(-4);
  document.getElementById('wallet-btn-label').textContent = short;
  document.getElementById('wallet-main-btn').classList.add('connected');
  document.getElementById('wallet-connected-addr').textContent = address;
  document.getElementById('wallet-not-connected').style.display = 'none';
  document.getElementById('wallet-connected-panel').style.display = 'block';
  document.getElementById('wallet-dropdown').classList.remove('open');
  if (window.keplrChatAddress !== undefined) {
    keplrChatAddress = address;
    const addrShort = address.slice(0,8) + '...' + address.slice(-4);
    document.getElementById('keplr-chat-addr').textContent = addrShort;
    document.getElementById('keplr-verified-bar').style.display = 'flex';
    document.getElementById('mode-keplr').textContent = '🔑 ' + addrShort;
    setMode('keplr');
  }
}

window.disconnectWallet = function() {
  globalWalletAddress = null;
  clearWalletSession();
  document.getElementById('wallet-btn-label').textContent = 'Connect';
  document.getElementById('wallet-main-btn').classList.remove('connected');
  document.getElementById('wallet-not-connected').style.display = 'block';
  document.getElementById('wallet-connected-panel').style.display = 'none';
  document.getElementById('wallet-dropdown').classList.remove('open');
  const adminPanel = document.getElementById('admin-panel');
  if (adminPanel) adminPanel.style.display = 'none';
  disconnectChatKeplr();
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

// ─── FIX 2: Chat — исправлена fee (5,000 LUNC payment) ───────
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
    const offlineSigner = window.keplr.getOfflineSigner('columbus-5');
    const accounts = await offlineSigner.getAccounts();
    const sender = accounts[0].address;
    const { SigningStargateClient } = await import('https://esm.sh/@cosmjs/stargate@0.32.3?target=es2020&bundle');
    const RPC_NODES = ['https://terra-classic-rpc.publicnode.com', 'https://rpc.terraclassic.community'];
    let client = null;
    for (const rpc of RPC_NODES) {
      try { client = await SigningStargateClient.connectWithSigner(rpc, offlineSigner); break; } catch(e) {}
    }
    if (!client) throw new Error('Could not connect to Terra Classic RPC');
    const result = await client.sendTokens(
      sender,
      ORACLE_WALLET,
      [{ denom: 'uluna', amount: '5000000000' }],
      // FIX: fee исправлена — 28.325 uluna/gas × 200000 = 5,665,000 uluna (~5.7 LUNC)
      { amount: [{ denom: 'uluna', amount: '5665000' }], gas: '200000' },
      text.slice(0, 256)
    );
    if (result.code !== 0) throw new Error('TX failed: ' + result.rawLog);
    const short = sender.slice(0,8)+'...'+sender.slice(-4);
    const stored = JSON.parse(localStorage.getItem('dao_chat_pending') || '[]');
    stored.push({ text, author: short, fullAddr: sender, txHash: result.transactionHash, isVerified: true, timestamp: Date.now() });
    localStorage.setItem('dao_chat_pending', JSON.stringify(stored));
    document.getElementById('chat-page-input').value = '';
    document.getElementById('chat-page-count').textContent = '256';
    document.getElementById('chat-ring').style.strokeDashoffset = '87.96';
    document.getElementById('chat-ring').style.stroke = 'var(--accent)';
    btn.textContent = 'Send Message →'; btn.disabled = false;
    statusEl.style.cssText = 'display:block;border-radius:8px;padding:10px 14px;font-size:12px;background:rgba(102,255,170,0.06);border:1px solid rgba(102,255,170,0.25);color:var(--green);margin-top:10px;';
    statusEl.innerHTML = '✅ Sent! <a href="https://finder.terra.money/classic/tx/' + result.transactionHash + '" target="_blank" style="color:var(--green);text-decoration:underline;">' + result.transactionHash.slice(0,16) + '...</a><br><span style="font-size:10px;opacity:0.7;">Message will appear after blockchain confirmation (~6s)</span>';
    setTimeout(() => { loadChatFromChain(); }, 8000);
    setTimeout(() => { statusEl.style.display = 'none'; }, 10000);
  } catch(e) {
    btn.textContent = 'Send Message →'; btn.disabled = false;
    statusEl.style.cssText = 'display:block;border-radius:8px;padding:10px 14px;font-size:12px;background:rgba(255,60,60,0.06);border:1px solid rgba(255,60,60,0.25);color:#ff6060;margin-top:10px;';
    statusEl.textContent = '❌ ' + (e.message || 'Transaction cancelled or failed.');
  }
}

// ─── BLOCKCHAIN CHAT ──────────────────────────────────────────
const CHAT_WALLET = ORACLE_WALLET;
const CHAT_MIN_ULUNA = 5000000000;
// FIX 4: два разных FCD узла для настоящего fallback
const FCD_NODES = [
  'https://terra-classic-lcd.publicnode.com',
  'https://lcd.terraclassic.community',
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
    container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:40px 20px;">No messages yet — be the first to speak!</div>';
    return;
  }
  const all = getChatReactions();
  const myReactions = JSON.parse(localStorage.getItem('my_chat_reactions') || '{}');
  container.innerHTML = msgs.map(m => `
    <div class="chat-page-msg verified-msg" id="msg-${m.txHash}">
      <div class="chat-page-msg-header">
        <span class="chat-page-msg-author" style="font-family:monospace;">${m.author}</span>
        <span style="font-size:8px;background:rgba(102,255,170,0.15);color:var(--green);padding:1px 6px;border-radius:4px;">✓ ON-CHAIN</span>
        ${m.amount ? `<span style="font-size:8px;color:var(--gold);background:rgba(245,197,24,0.1);padding:1px 6px;border-radius:4px;">${m.amount} LUNC</span>` : ''}
        <span class="chat-page-msg-time"><a href="https://finder.terra.money/classic/tx/${m.txHash}" target="_blank" style="color:var(--muted);text-decoration:none;font-size:9px;">🔗 ${m.time}</a></span>
      </div>
      <div class="chat-page-msg-text">${m.text}</div>
      ${buildReactionsRow(m.txHash, all, myReactions)}
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

async function loadChatFromChain() {
  const container = document.getElementById('chat-page-messages');
  if (!cachedMsgs.length) {
    container.innerHTML = `<div style="text-align:center;padding:40px 20px;"><div style="font-size:22px;margin-bottom:10px;">⏳</div><div style="color:var(--muted);font-size:12px;">Loading messages from blockchain...</div></div>`;
  }
  let txList = null;
  try {
    const res = await fetch(`https://rest.cosmos.directory/terraclassic/cosmos/tx/v1beta1/txs?events=transfer.recipient=%27${CHAT_WALLET}%27&pagination.limit=50&order_by=2`);
    if (res.ok) { txList = await res.json(); }
  } catch(e) {}
  if (!txList || !txList.txs) {
    if (!cachedMsgs.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px 20px;"><div style="font-size:22px;margin-bottom:10px;">⚠️</div><div style="color:var(--muted);font-size:12px;">Could not reach blockchain nodes</div><button onclick="loadChatFromChain()" style="margin-top:14px;background:rgba(84,147,247,0.1);border:1px solid rgba(84,147,247,0.25);color:var(--accent);border-radius:8px;padding:7px 16px;font-family:'Exo 2',sans-serif;font-size:11px;cursor:pointer;">↻ Retry now</button></div>`;
    }
    return;
  }
  if (txList.txs.length === 0) { if (!cachedMsgs.length) container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:40px;">No messages yet — be the first!</div>'; return; }
  const msgs = [];
  for (const tx of txList.txs) {
    try {
      const memo = tx.tx?.value?.memo || tx.tx?.body?.memo || '';
      if (!memo || memo.trim() === '') continue;
      const txMsgs = tx.tx?.value?.msg || tx.tx?.body?.messages || [];
      let sender = null, luncAmount = 0;
      for (const msg of txMsgs) {
        const type = msg.type || msg['@type'] || '';
        const val = msg.value || msg;
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
      const ts = tx.timestamp ? new Date(tx.timestamp) : null;
      const timeStr = ts ? ts.toLocaleDateString([], {month:'short',day:'numeric'}) + ' ' + ts.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
      msgs.push({ author: short, fullAddr: sender, text: memo.slice(0, 256), amount: luncFormatted, txHash: tx.txhash || '', time: timeStr, ts: ts ? ts.getTime() : 0 });
    } catch(e) { continue; }
  }
  msgs.sort((a, b) => a.ts - b.ts);
  renderChatMessages(msgs);
}

function renderChatPage() { loadChatFromChain(); }
renderChatPage();
setInterval(loadChatFromChain, 30000);

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
    if (address === ADMIN_WALLET) { applyVoteStates(); updateAdminPanel(); }
  }
  applyStoredVotes(); applyVoteStates(); renderVotes();
}

// ─── VOTE PAGE ────────────────────────────────────────────────
const LIQUIDITY_PAIRS = ['LUNC/USDT','LUNC/USTC','LUNC/ATOM','LUNC/BTC','LUNC/ETH','LUNC/BNB','LUNC/OSMO','LUNC/JUNO'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function generateMonthlyLiquidityVote() {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth(), day = now.getDate();
  const openDate = new Date(year, month, 20, 0, 0, 0);
  const closeDate = new Date(year, month, 25, 23, 59, 59);
  let status, timerStr, displayMonth, displayYear;
  if (day < 20) {
    const ms = openDate - now;
    status = 'upcoming'; timerStr = `Opens in ${Math.floor(ms/86400000)}d ${Math.floor((ms%86400000)/3600000)}h`;
    displayMonth = MONTH_NAMES[month]; displayYear = year;
  } else if (day <= 25) {
    const ms = closeDate - now;
    const d = Math.floor(ms/86400000), h = Math.floor((ms%86400000)/3600000), m = Math.floor((ms%3600000)/60000);
    status = 'active'; timerStr = d > 0 ? `${d}d ${h}h remaining` : `${h}h ${m}m remaining`;
    displayMonth = MONTH_NAMES[month]; displayYear = year;
  } else {
    const nm = month === 11 ? 0 : month + 1, ny = month === 11 ? year + 1 : year;
    const nextOpen = new Date(ny, nm, 20, 0, 0, 0); const ms = nextOpen - now;
    status = 'upcoming'; timerStr = `Opens in ${Math.floor(ms/86400000)}d ${Math.floor((ms%86400000)/3600000)}h`;
    displayMonth = MONTH_NAMES[nm]; displayYear = ny;
  }
  const seed = year * 12 + month;
  const pairs = [...LIQUIDITY_PAIRS];
  for (let i = pairs.length - 1; i > 0; i--) { const j = (seed * 1103515245 + i * 12345) % (i + 1); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
  const votePairs = pairs.slice(0, 4);
  const voteKey = `monthly_liquidity_${year}_${month}`;
  let savedVotes = null;
  try { savedVotes = JSON.parse(localStorage.getItem(voteKey) || 'null'); } catch(e) {}
  return {
    id: 'monthly-liquidity', type: 'monthly', status, voteKey,
    title: `Liquidity Pool Pairs — ${displayMonth} ${displayYear}`,
    desc: status === 'active' ? `Which LUNC trading pair should receive liquidity incentives for ${displayMonth}? Voting is open 20–25 of each month.` : `Monthly liquidity vote for ${displayMonth} ${displayYear}. Voting opens on the 20th and closes on the 25th.`,
    source: '🗓 Runs every month · 20th → 25th · Auto-generated',
    timer: timerStr, totalVotes: savedVotes ? savedVotes.totalVotes : 0, quorum: 200,
    options: votePairs.map((pair, i) => ({ label: pair, votes: savedVotes ? (savedVotes.options[i] || 0) : 0 })),
    userVoted: null, isMonthlyLiquidity: true
  };
}

const VOTES_DATA = [
  { id: 'v1', type: 'weekly', status: 'active', title: 'Protocol Development Priority — Week 11', desc: 'What should the development team focus on this week?', source: 'Based on community chat discussions', timer: '3d 14h remaining', totalVotes: 234, quorum: 100, options: [{ label: 'SDK 0.53 upgrade testing & QA', votes: 112 }, { label: 'MM 2.0 activation preparation', votes: 78 }, { label: 'USTC re-peg research', votes: 44 }], userVoted: null },
  generateMonthlyLiquidityVote(),
  { id: 'v3', type: 'special', status: 'active', title: 'Terra Oracle — Reward Distribution Model', desc: 'Should we switch from "winner takes all" to top-3 distribution for Q&A rewards?', source: 'Proposal by community member · Terra Oracle governance', timer: '6d 2h remaining', totalVotes: 156, quorum: 100, options: [{ label: '70% winner + 30% voters', votes: 89 }, { label: 'Top-3 split (60/25/15)', votes: 41 }, { label: 'Keep current model', votes: 26 }], userVoted: null }
];

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

window.adminStartVote = function(voteId) {
  const vote = VOTES_DATA.find(v => v.id === voteId); if (!vote) return;
  const pairs = voteId === 'monthly-liquidity' ? [document.getElementById('admin-pair-1')?.value||'LUNC/USDT',document.getElementById('admin-pair-2')?.value||'LUNC/USTC',document.getElementById('admin-pair-3')?.value||'LUNC/ATOM',document.getElementById('admin-pair-4')?.value||'LUNC/BTC'].filter(Boolean) : null;
  const state = { status: 'active', startedAt: Date.now(), stoppedAt: null };
  if (pairs) state.pairs = pairs;
  saveVoteState(voteId, state); applyVoteStates(); updateAdminPanel(); applyStoredVotes(); renderVotes(); showAdminToast('▶ Vote started!', 'green');
}
window.adminStopVote = function(voteId) { saveVoteState(voteId, { status: 'stopped', stoppedAt: Date.now() }); applyVoteStates(); updateAdminPanel(); renderVotes(); showAdminToast('■ Vote stopped', 'red'); }
window.adminToggleVote = function(voteId, newStatus) { if (newStatus === 'active') adminStartVote(voteId); else adminStopVote(voteId); }

function updateAdminPanel() {
  const panel = document.getElementById('admin-panel'); if (!panel || panel.style.display === 'none') return;
  const monthly = VOTES_DATA.find(v => v.id === 'monthly-liquidity');
  const statusEl = document.getElementById('admin-monthly-status');
  if (statusEl && monthly) { const icons={active:'🟢',stopped:'🔴',upcoming:'🟡',closed:'⚫'}; statusEl.textContent = `Status: ${icons[monthly.status]||'⚪'} ${monthly.status.toUpperCase()} · Started: ${monthly.startedAt?new Date(monthly.startedAt).toLocaleDateString():'—'} · Timer: ${monthly.timer}`; }
  const otherEl = document.getElementById('admin-other-votes');
  if (otherEl) {
    const states = getVoteStates(); const others = VOTES_DATA.filter(v => v.id !== 'monthly-liquidity');
    if (!others.length) { otherEl.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:8px 0;">No other votes configured.</div>'; }
    else { otherEl.innerHTML = others.map(v => { const s=states[v.id]?.status||v.status; const icons={active:'🟢',stopped:'🔴',upcoming:'🟡',closed:'⚫'}; return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);"><div><span style="font-size:12px;color:var(--text);">${v.title}</span><span style="font-size:10px;color:var(--muted);margin-left:8px;">${icons[s]||'⚪'} ${(s||'unknown').toUpperCase()}</span></div><div style="display:flex;gap:6px;"><button onclick="adminToggleVote('${v.id}','active')" style="font-size:10px;padding:5px 12px;border-radius:6px;border:1px solid rgba(102,255,170,0.3);background:rgba(102,255,170,0.08);color:var(--green);cursor:pointer;font-family:'Exo 2',sans-serif;font-weight:700;">▶</button><button onclick="adminToggleVote('${v.id}','stopped')" style="font-size:10px;padding:5px 12px;border-radius:6px;border:1px solid rgba(255,60,60,0.25);background:rgba(255,60,60,0.06);color:#ff6464;cursor:pointer;font-family:'Exo 2',sans-serif;font-weight:700;">■</button></div></div>`; }).join(''); }
  }
}

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
  vote.options[optionIdx].votes++; vote.totalVotes++; vote.userVoted = optionIdx;
  saveVoteToStorage(voteId, optionIdx);
  if (vote.isMonthlyLiquidity && vote.voteKey) { try { localStorage.setItem(vote.voteKey, JSON.stringify({ totalVotes: vote.totalVotes, options: vote.options.map(o => o.votes) })); } catch(e) {} }
  renderVotes();
}

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
  smoothScrollTop(); loadValidatorsS(); loadAllStats(); startStatsAutoRefresh(); startBinanceCountdown();
}

const LCD_S  = 'https://terra-classic-lcd.publicnode.com';
const LCD_S2 = 'https://lcd.terraclassic.community';
// FIX 3: ORACLE_POOL_ADDR исправлен — теперь совпадает с ORACLE_WALLET
const ORACLE_POOL_ADDR = 'terra1549z8zd9hkggzlwf0rcuszhc9rs9fxqfy2kagt';

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
    const data = await lcdS('/cosmos/bank/v1beta1/balances/' + ORACLE_POOL_ADDR);
    const bals = data.balances || [];
    const lunc = bals.find(b => b.denom === 'uluna');
    const ustc = bals.find(b => b.denom === 'uusd');
    setTxt('oracle-lunc', fmtFull(lunc ? Number(lunc.amount)/1e6 : 0));
    setTxt('oracle-ustc', fmtFull(ustc ? Number(ustc.amount)/1e6 : 0));
    drawOracleChartS(lunc ? Number(lunc.amount)/1e6 : 0, ustc ? Number(ustc.amount)/1e6 : 0);
  } catch { setTxt('oracle-lunc', '—'); setTxt('oracle-ustc', '—'); }
}

async function loadValidatorsS() {
  try {
    const BASE = 'https://terra-classic-lcd.publicnode.com';
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
function setChartMode(mode) { currentChartMode='combined'; const cached=supplyChartCache[currentSupplyPeriod]; if(cached) renderSupplyChart(cached.data,currentSupplyPeriod); else loadSupplyChart(currentSupplyPeriod); }

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
  ];
  _binanceBurnsCache = HISTORICAL_BURNS;
  _binanceBurnsCacheTs = Date.now();
  return HISTORICAL_BURNS;
}
