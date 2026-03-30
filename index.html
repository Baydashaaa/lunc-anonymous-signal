// ─── REPUTATION MODULE · terra-oracle ────────────────────────
// Pages: leaderboard | how it works
// Triggered by showRepPage(tab)

// ── Nav dropdown toggle ───────────────────────────────────────
function toggleRepNav(e) {
  e && e.stopPropagation();
  const dd  = document.getElementById('rep-dropdown');
  const btn = document.getElementById('rep-nav-btn');
  if (!dd || !btn) return;
  const isOpen = dd.classList.contains('open');
  if (!isOpen) {
    const rect = btn.getBoundingClientRect();
    const ddW  = 200;
    // Align left edge of dropdown to left edge of button, clamp to viewport
    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - ddW - 8));
    dd.style.left = left + 'px';
  }
  dd.classList.toggle('open');
  if (btn) btn.classList.toggle('active', !isOpen);
}
function closeRepNav() {
  const dd  = document.getElementById('rep-dropdown');
  const btn = document.getElementById('rep-nav-btn');
  if (dd)  dd.classList.remove('open');
  if (btn) btn.classList.remove('active');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#rep-nav-wrap')) closeRepNav();
});

// ── Show reputation page ──────────────────────────────────────
let _repCurrentTab = 'leaderboard';

function showRepPage(tab) {
  tab = tab || _repCurrentTab;
  _repCurrentTab = tab;

  // Hide all pages, show reputation
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const pg = document.getElementById('page-reputation');
  if (!pg) return;
  pg.classList.add('active');
  try { sessionStorage.setItem('currentPage', 'reputation:' + tab); } catch(e) {}
  if (typeof smoothScrollTop === 'function') smoothScrollTop();

  renderRepPage(tab);
}

function renderRepPage(tab) {
  const pg = document.getElementById('page-reputation');
  if (!pg) return;

  pg.innerHTML = `
    <div style="text-align:center;margin-bottom:36px;">
      <div style="display:inline-block;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;
        color:var(--accent);border:1px solid rgba(84,147,247,0.3);padding:4px 14px;border-radius:20px;
        background:rgba(84,147,247,0.05);margin-bottom:14px;">ORACLE REPUTATION</div>
      <h1 style="font-family:'Rajdhani',sans-serif;font-weight:800;font-size:clamp(26px,4vw,38px);color:#fff;margin-bottom:10px;">
        ${tab === 'leaderboard' ? '🏆 Leaderboard' : '📖 How it Works'}
      </h1>
      <p style="font-size:12px;color:var(--muted);">
        ${tab === 'leaderboard'
          ? 'Top contributors ranked by Oracle Reputation score'
          : 'Earn REP through activity · Unlock ranks, discounts & rewards'}
      </p>
    </div>

    <!-- Tab switcher -->
    <div style="display:flex;gap:8px;margin-bottom:28px;justify-content:center;">
      <button onclick="showRepPage('leaderboard')" style="
        background:${tab==='leaderboard' ? 'rgba(84,147,247,0.12)' : 'transparent'};
        border:1px solid ${tab==='leaderboard' ? 'rgba(84,147,247,0.4)' : 'var(--border)'};
        color:${tab==='leaderboard' ? 'var(--accent)' : 'var(--muted)'};
        font-family:'Exo 2',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;
        padding:8px 20px;border-radius:8px;cursor:pointer;transition:all 0.2s;">
        🏆 Leaderboard
      </button>
      <button onclick="showRepPage('how')" style="
        background:${tab==='how' ? 'rgba(84,147,247,0.12)' : 'transparent'};
        border:1px solid ${tab==='how' ? 'rgba(84,147,247,0.4)' : 'var(--border)'};
        color:${tab==='how' ? 'var(--accent)' : 'var(--muted)'};
        font-family:'Exo 2',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;
        padding:8px 20px;border-radius:8px;cursor:pointer;transition:all 0.2s;">
        📖 How it Works
      </button>
    </div>

    <div id="rep-tab-content">
      ${tab === 'leaderboard' ? renderLeaderboardHTML() : renderHowItWorksHTML()}
    </div>
  `;

  if (tab === 'leaderboard') loadLeaderboard();
}

// ── LEADERBOARD ───────────────────────────────────────────────
function renderLeaderboardHTML() {
  return `
    <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
      <button onclick="switchLeaderboardPeriod('weekly')" id="lb-btn-weekly" style="
        background:rgba(84,147,247,0.12);border:1px solid rgba(84,147,247,0.4);
        color:var(--accent);font-family:'Exo 2',sans-serif;font-size:10px;font-weight:700;
        letter-spacing:0.1em;padding:6px 16px;border-radius:6px;cursor:pointer;">
        📅 Weekly
      </button>
      <button onclick="switchLeaderboardPeriod('alltime')" id="lb-btn-alltime" style="
        background:transparent;border:1px solid var(--border);
        color:var(--muted);font-family:'Exo 2',sans-serif;font-size:10px;font-weight:700;
        letter-spacing:0.1em;padding:6px 16px;border-radius:6px;cursor:pointer;">
        🔥 All Time
      </button>
    </div>
    <div id="leaderboard-list">
      <div style="text-align:center;padding:40px;color:var(--muted);font-size:12px;">Loading...</div>
    </div>
  `;
}

let _lbPeriod = 'weekly';

function switchLeaderboardPeriod(period) {
  _lbPeriod = period;
  const weekly  = document.getElementById('lb-btn-weekly');
  const alltime = document.getElementById('lb-btn-alltime');
  if (weekly) {
    const active = 'background:rgba(84,147,247,0.12);border:1px solid rgba(84,147,247,0.4);color:var(--accent);';
    const inactive = 'background:transparent;border:1px solid var(--border);color:var(--muted);';
    weekly.style.cssText  += period === 'weekly'  ? active : inactive;
    alltime.style.cssText += period === 'alltime' ? active : inactive;
  }
  loadLeaderboard();
}

async function loadLeaderboard() {
  const el = document.getElementById('leaderboard-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);font-size:12px;">Loading contributors...</div>';

  try {
    // Fetch all questions from worker
    const WORKER_URL = typeof window.WORKER_URL !== 'undefined'
      ? window.WORKER_URL
      : 'https://terra-oracle-questions.vladislav-baydan.workers.dev';

    const res = await fetch(`${WORKER_URL}/questions`);
    if (!res.ok) throw new Error('Worker error');
    const data = await res.json();
    const allQuestions = data.questions || [];

    // Build per-wallet stats
    const wallets = {};
    const cutoff = _lbPeriod === 'weekly'
      ? Math.floor(Date.now() / 1000) - 7 * 86400
      : 0;

    for (const q of allQuestions) {
      if (q.createdAt < cutoff) continue;
      if (!q.wallet) continue;
      if (!wallets[q.wallet]) wallets[q.wallet] = { wallet: q.wallet, alias: q.alias || ('Anonymous#' + q.wallet.slice(-4).toUpperCase()), questions: 0, answers: 0, upvotes: 0 };
      wallets[q.wallet].questions++;
      wallets[q.wallet].upvotes += q.votes || 0;

      for (const a of q.answers || []) {
        if (!a.wallet) continue;
        if (!wallets[a.wallet]) wallets[a.wallet] = { wallet: a.wallet, alias: a.alias || ('Anonymous#' + a.wallet.slice(-4).toUpperCase()), questions: 0, answers: 0, upvotes: 0 };
        wallets[a.wallet].answers++;
        wallets[a.wallet].upvotes += a.votes || 0;
      }
    }

    // Calculate REP score for each
    const ranked = Object.values(wallets).map(w => {
      const score = w.questions * 40 + w.answers * 15 + w.upvotes * 10;
      const rank  = typeof getRank === 'function' ? getRank(score) : { name: 'INITIATE', icon: '◈', color: '#6b82a8', glow: 'rgba(107,130,168,0.3)' };
      return { ...w, score, rank };
    }).sort((a, b) => b.score - a.score).slice(0, 50);

    if (!ranked.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);font-size:12px;">No contributors yet — be the first!</div>';
      return;
    }

    const myWallet = typeof globalWalletAddress !== 'undefined' ? globalWalletAddress : null;

    el.innerHTML = ranked.map((w, i) => {
      const isMe = myWallet && w.wallet === myWallet;
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
      return `
        <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;
          background:${isMe ? 'rgba(84,147,247,0.07)' : 'var(--surface)'};
          border:1px solid ${isMe ? 'rgba(84,147,247,0.3)' : 'var(--border)'};
          border-radius:10px;margin-bottom:8px;transition:all 0.2s;"
          onmouseover="this.style.borderColor='rgba(84,147,247,0.25)'"
          onmouseout="this.style.borderColor='${isMe ? 'rgba(84,147,247,0.3)' : 'var(--border)'}'">
          <div style="font-family:'Rajdhani',sans-serif;font-size:18px;font-weight:800;
            color:${i < 3 ? '#fff' : 'var(--muted)'};min-width:32px;text-align:center;">
            ${medal}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
              <span style="font-size:12px;font-weight:700;color:${isMe ? 'var(--accent)' : 'var(--text)'};
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${w.alias}${isMe ? ' <span style="color:var(--accent);font-size:10px;">(you)</span>' : ''}
              </span>
              <span style="font-size:10px;font-weight:700;color:${w.rank.color};
                text-shadow:0 0 8px ${w.rank.glow};white-space:nowrap;">
                ${w.rank.icon} ${w.rank.name}
              </span>
            </div>
            <div style="display:flex;gap:12px;font-size:10px;color:var(--muted);">
              <span>❓ ${w.questions} questions</span>
              <span>💬 ${w.answers} answers</span>
              <span>👍 ${w.upvotes} upvotes</span>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-family:'Rajdhani',sans-serif;font-size:20px;font-weight:800;
              color:${w.rank.color};text-shadow:0 0 10px ${w.rank.glow};">
              ${w.score.toLocaleString()}
            </div>
            <div style="font-size:9px;color:var(--muted);letter-spacing:0.08em;">REP</div>
          </div>
        </div>`;
    }).join('');

  } catch(e) {
    const el2 = document.getElementById('leaderboard-list');
    if (el2) el2.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);font-size:12px;">Could not load leaderboard</div>';
  }
}

// ── HOW IT WORKS ──────────────────────────────────────────────
function renderHowItWorksHTML() {
  const ranks = typeof RANKS !== 'undefined' ? RANKS : [];

  return `
    <!-- What is REP -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px;margin-bottom:16px;">
      <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;">What is Oracle Reputation?</div>
      <p style="font-size:13px;color:var(--text);line-height:1.8;margin-bottom:16px;">
        Oracle Reputation (REP) measures your contribution to the Terra Oracle protocol.
        It is <strong style="color:var(--accent);">not a balance</strong> — it reflects your
        <strong style="color:var(--text);">activity, quality, and consistency</strong>.
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
        ${[
          ['❓', 'Ask a question', '+40 REP', 'var(--accent)'],
          ['💬', 'Answer (community)', '+15 REP', '#66ffaa'],
          ['👍', 'Upvote received', '+10 REP', '#ffd700'],
          ['🗨️', 'Chat message', '+2 REP', '#c084fc'],
        ].map(([icon, label, rep, color]) => `
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:22px;margin-bottom:6px;">${icon}</div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">${label}</div>
            <div style="font-family:'Rajdhani',sans-serif;font-size:18px;font-weight:800;color:${color};">${rep}</div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:12px;font-size:11px;color:var(--muted);padding:10px 14px;
        background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid var(--border);">
        ⚠️ Anti-abuse: first 20 chat messages/day earn full reward · votes capped at 20/day
      </div>
    </div>

    <!-- Rank system -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px;margin-bottom:16px;">
      <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:16px;">Oracle Ascension — 7 Ranks</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${ranks.map(r => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;
            background:var(--surface2);border:1px solid var(--border);border-radius:10px;">
            <div style="font-size:16px;font-weight:800;color:${r.color};
              text-shadow:0 0 10px ${r.glow};min-width:120px;letter-spacing:0.06em;">
              ${r.icon} ${r.name}
            </div>
            <div style="flex:1;">
              <div style="height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:100%;background:${r.bar};
                  box-shadow:0 0 6px ${r.glow};border-radius:3px;opacity:0.7;"></div>
              </div>
            </div>
            <div style="font-size:11px;color:var(--muted);min-width:80px;text-align:right;">
              ${r.minScore === 0 ? 'Starting' : r.minScore.toLocaleString() + ' REP'}
            </div>
            <div style="font-size:10px;color:${r.color};min-width:120px;text-align:right;
              opacity:${r.discount > 0 ? 1 : 0.4};">
              ${r.discountLabel}
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Weekly rewards -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px;">
      <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;">Weekly Reward Pool</div>
      <p style="font-size:13px;color:var(--text);line-height:1.8;margin-bottom:16px;">
        ~20% of Treasury weekly rewards are distributed to the <strong style="color:var(--accent);">top 20% contributors</strong>
        proportional to their REP score. Higher rank multiplies your share.
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">
        ${ranks.filter(r => r.multiplier > 1).map(r => `
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
            <div style="font-size:12px;font-weight:700;color:${r.color};margin-bottom:4px;">${r.icon} ${r.name}</div>
            <div style="font-family:'Rajdhani',sans-serif;font-size:22px;font-weight:800;color:${r.color};
              text-shadow:0 0 10px ${r.glow};">×${r.multiplier}</div>
            <div style="font-size:9px;color:var(--muted);margin-top:2px;">reward multiplier</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
