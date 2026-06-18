// ─── SUPABASE ────────────────────────────────────────────
const SUPABASE_URL = 'https://hnaffjcibgdgikhqxdlo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UMi-xWMKmgT5HekfNmHcsw_ljQ-A-P2';
const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);

async function syncFromCloud() {
  if (!sb) return;
  try {
    const [{ data: j }, { data: h }] = await Promise.all([
      sb.from('joueurs').select('*'),
      sb.from('historique').select('*').order('created_at', { ascending: false })
    ]);
    if (j) {
      joueurs = j.map(r => ({ id: r.id, nom: r.nom, poste: r.poste || '', photo: r.photo || null }));
      localStorage.setItem('bamfc_joueurs', JSON.stringify(joueurs));
    }
    if (h) {
      historique = h.map(r => ({ id: r.id, date: r.date, teams: r.teams, buts: r.buts, videos: r.videos || [], source: r.source || null }));
      localStorage.setItem('bamfc_historique', JSON.stringify(historique));
    }
    renderJoueurs();
    renderHistorique();
    renderStats();
    updateHero();
    console.log('Synced from cloud');
  } catch (e) { console.warn('Sync error:', e); }
}

async function pushJoueur(j) {
  if (!sb) return;
  await sb.from('joueurs').upsert({ id: j.id, nom: j.nom, poste: j.poste, photo: j.photo });
}
async function deleteJoueurCloud(id) {
  if (!sb) return;
  await sb.from('joueurs').delete().eq('id', id);
}
async function pushMatch(m) {
  if (!sb) return;
  await sb.from('historique').upsert({ id: m.id, date: m.date, teams: m.teams, buts: m.buts, videos: m.videos || [], source: m.source || null });
}
async function deleteMatchCloud(id) {
  if (!sb) return;
  await sb.from('historique').delete().eq('id', id);
}
async function clearHistoriqueCloud() {
  if (!sb) return;
  await sb.from('historique').delete().neq('id', '');
}

// ─── STATE ───────────────────────────────────────────────
const COLORS = [
  { bg: '#1a3a2a', text: '#4AFF6A' },
  { bg: '#1a2a3a', text: '#4AB8FF' },
  { bg: '#3a1a2a', text: '#FF4AB8' },
  { bg: '#3a2a1a', text: '#FFB84A' },
  { bg: '#2a1a3a', text: '#B84AFF' },
  { bg: '#1a3a3a', text: '#4AFFEE' },
  { bg: '#3a1a1a', text: '#FF6B4A' },
  { bg: '#2a3a1a', text: '#AAFF4A' },
];

function colorFor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return COLORS[h % COLORS.length];
}
function initials(name) {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function load(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

let joueurs = load('bamfc_joueurs', []);
let historique = load('bamfc_historique', []);
let currentTeams = [];
let currentFormat = '2';
let scores = [0, 0, 0];
let butsParJoueur = {}; // id -> count for current match

// ─── JOUEURS ─────────────────────────────────────────────
function ajouterJoueur() {
  const nom = document.getElementById('inputNom').value.trim();
  const poste = document.getElementById('inputPoste').value.trim();
  if (!nom) return;
  const newJ = { id: uid(), nom, poste };
  joueurs.push(newJ);
  save('bamfc_joueurs', joueurs);
  pushJoueur(newJ);
  closeModal('modalJoueur');
  document.getElementById('inputNom').value = '';
  document.getElementById('inputPoste').value = '';
  renderJoueurs();
  updateHero();
  toast('Joueur ajouté ✓');
}

function supprimerJoueur(id) {
  joueurs = joueurs.filter(j => j.id !== id);
  save('bamfc_joueurs', joueurs);
  deleteJoueurCloud(id);
  renderJoueurs();
  updateHero();
}

function renderJoueurs() {
  const grid = document.getElementById('playersGrid');
  if (!joueurs.length) {
    grid.innerHTML = '<div class="empty-state">Aucun joueur pour l\'instant. Ajoute tes potes !</div>';
    return;
  }
  grid.innerHTML = joueurs.map(j => {
    const col = colorFor(j.nom);
    const avatar = j.photo
      ? `<div class="player-avatar" style="background-image:url('${j.photo}');background-size:cover;background-position:center"></div>`
      : `<div class="player-avatar" style="background:${col.bg};color:${col.text}">${initials(j.nom)}</div>`;
    return `<div class="player-card" onclick="openPhotoModal('${j.id}')">
      <button class="player-delete" onclick="event.stopPropagation();supprimerJoueur('${j.id}')" title="Supprimer">×</button>
      ${avatar}
      <div class="player-name">${j.nom}</div>
      ${j.poste ? `<div class="player-poste">${j.poste}</div>` : ''}
      <div class="player-edit-hint">📷 Photo</div>
    </div>`;
  }).join('');
}

// ─── FORMAT PILLS ─────────────────────────────────────────
document.querySelectorAll('.pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    currentFormat = btn.dataset.format;
  });
});

// ─── TIRAGE ──────────────────────────────────────────────
const TEAM_NAMES = ['Équipe A', 'Équipe B', 'Équipe C'];
const TEAM_ACCENT = ['#4AFF6A', '#4AB8FF', '#FFB84A'];
const TEAM_ACCENT_DIM = ['rgba(74,255,106,0.12)', 'rgba(74,184,255,0.12)', 'rgba(255,184,74,0.12)'];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tirerEquipes() {
  if (joueurs.length < 2) { toast('Ajoute au moins 2 joueurs !'); return; }
  const pool = shuffle(joueurs);
  if (currentFormat === '3') {
    currentTeams = [[], [], []];
    pool.forEach((j, i) => currentTeams[i % 3].push(j));
  } else {
    const half = Math.ceil(pool.length / 2);
    currentTeams = [pool.slice(0, half), pool.slice(half)];
  }
  scores = currentTeams.map(() => 0);
  butsParJoueur = {};
  renderTeams();
  renderScoreInputs();
  document.getElementById('teamsWrap').style.display = '';
  playerPositions = {};
  renderTerrain();
}

function renderTeams() {
  const grid = document.getElementById('teamsGrid');
  grid.style.gridTemplateColumns = currentTeams.length === 3 ? '1fr 1fr 1fr' : '1fr 1fr';
  grid.innerHTML = currentTeams.map((team, ti) => {
    const acc = TEAM_ACCENT[ti];
    const dim = TEAM_ACCENT_DIM[ti];
    return `<div class="team-card" data-team="${ti}"
        ondragover="ev => { ev.preventDefault(); this.classList.add('drop-over'); }"
        ondragleave="this.classList.remove('drop-over')"
        ondrop="dropOnTeam(event, ${ti})">
      <div class="team-card-header">
        <span class="team-card-name" style="color:${acc}">${TEAM_NAMES[ti]}</span>
        <span class="team-badge" style="background:${dim};color:${acc}">${team.length} joueurs</span>
      </div>
      <div class="team-body">
        ${team.map(j => {
          const col = colorFor(j.nom);
          return `<div class="team-player-row" draggable="true"
              ondragstart="dragStart(event, '${j.id}', ${ti})">
            <div class="team-mini-avatar" style="background:${col.bg};color:${col.text}">${initials(j.nom)}</div>
            ${j.nom}${j.poste ? `<span style="font-size:11px;color:var(--text-muted);margin-left:auto">${j.poste}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  // Attacher les events drag&drop après render
  document.querySelectorAll('.team-card').forEach(card => {
    const ti = parseInt(card.dataset.team);
    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drop-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drop-over'));
    card.addEventListener('drop', e => dropOnTeam(e, ti));
  });
}

let dragId = null, dragFromTeam = null;
function dragStart(e, id, fromTeam) { dragId = id; dragFromTeam = fromTeam; }
function dropOnTeam(e, toTeam) {
  e.preventDefault();
  document.querySelectorAll('.team-card').forEach(c => c.classList.remove('drop-over'));
  if (dragId == null || dragFromTeam === toTeam) return;
  const src = currentTeams[dragFromTeam];
  const idx = src.findIndex(j => j.id === dragId);
  if (idx === -1) return;
  const [player] = src.splice(idx, 1);
  currentTeams[toTeam].push(player);
  renderTeams();
  renderScoreInputs();
  dragId = null; dragFromTeam = null;
}

// ─── SCORE ───────────────────────────────────────────────
function renderScoreInputs() {
  const row = document.getElementById('scoreInputRow');
  row.innerHTML = currentTeams.map((team, ti) => {
    const acc = TEAM_ACCENT[ti];
    return `<div class="score-block">
      <label style="color:${acc}">${TEAM_NAMES[ti]}</label>
      <div class="score-num">
        <button class="score-btn" onclick="changeScore(${ti}, -1)">−</button>
        <span class="score-val" id="scoreVal${ti}" style="color:${acc}">${scores[ti]}</span>
        <button class="score-btn" onclick="changeScore(${ti}, 1)">+</button>
      </div>
    </div>
    ${ti < currentTeams.length - 1 ? '<span class="score-vs">vs</span>' : ''}`;
  }).join('');

  renderButsSection();
}

function changeScore(ti, delta) {
  scores[ti] = Math.max(0, scores[ti] + delta);
  const el = document.getElementById(`scoreVal${ti}`);
  if (el) el.textContent = scores[ti];
  renderButsSection();
}

function renderButsSection() {
  const sec = document.getElementById('butsSection');
  const total = scores.reduce((a, b) => a + b, 0);
  if (total === 0) { sec.innerHTML = ''; return; }

  sec.innerHTML = `<h3 class="subsection-title">Qui a marqué ?</h3>
  <div class="buts-grid">
    ${currentTeams.map((team, ti) => {
      const acc = TEAM_ACCENT[ti];
      return `<div>
        <div class="buts-team-label" style="color:${acc}">${TEAM_NAMES[ti]} — ${scores[ti]} but${scores[ti] > 1 ? 's' : ''}</div>
        ${team.map(j => {
          const v = butsParJoueur[j.id] || 0;
          return `<div class="buts-player-row">
            <span>${j.nom}</span>
            <div style="display:flex;align-items:center;gap:8px">
              <button class="score-btn" style="width:24px;height:24px;font-size:14px" onclick="changeBut('${j.id}', -1)">−</button>
              <span style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:15px;min-width:20px;text-align:center;color:${acc}">${v}</span>
              <button class="score-btn" style="width:24px;height:24px;font-size:14px" onclick="changeBut('${j.id}', 1)">+</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('')}
  </div>`;
}

function changeBut(id, delta) {
  butsParJoueur[id] = Math.max(0, (butsParJoueur[id] || 0) + delta);
  renderButsSection();
}

// ─── ENREGISTRER MATCH ────────────────────────────────────
function enregistrerMatch() {
  const match = {
    id: uid(),
    date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    teams: currentTeams.map((team, ti) => ({
      nom: TEAM_NAMES[ti],
      joueurs: team.map(j => j.id),
      score: scores[ti],
    })),
    buts: { ...butsParJoueur },
  };
  historique.unshift(match);
  save('bamfc_historique', historique);
  pushMatch(match);
  renderHistorique();
  renderStats();
  updateHero();
  document.getElementById('teamsWrap').style.display = 'none';
  toast('Match enregistré 🎉');
  document.getElementById('historique').scrollIntoView({ behavior: 'smooth' });
}

// ─── HISTORIQUE ──────────────────────────────────────────
function renderHistorique() {
  const el = document.getElementById('historiqueList');
  if (!historique.length) {
    el.innerHTML = '<div class="empty-state">Aucun match enregistré.</div>';
    return;
  }
  el.innerHTML = historique.map(m => {
    const scores = m.teams.map(t => t.score);
    const maxScore = Math.max(...scores);
    const winners = m.teams.filter(t => t.score === maxScore);
    const isNul = winners.length > 1;
    return `<div class="match-card">
      <span class="match-date">${m.date}</span>
      <div class="match-teams">
        ${m.teams.map((t, i) => {
          const isWin = !isNul && t.score === maxScore;
          return `<span class="match-team-name" style="${isWin ? `color:${TEAM_ACCENT[i]}` : ''}">${getJoueursNoms(t.joueurs)}</span>
            ${i < m.teams.length - 1 ? `<span class="match-score">${m.teams[i].score} – ${m.teams[i+1].score}</span>` : ''}`;
        }).join('')}
      </div>
      ${isNul ? '<span class="match-nul">Nul</span>' : `<span class="match-winner">✓ ${winners[0].nom}</span>`}
    </div>`;
  }).join('');
}

function getJoueursNoms(ids) {
  return ids.map(id => {
    const j = joueurs.find(j => j.id === id);
    return j ? j.nom : '?';
  }).join(', ');
}

function clearHistorique() {
  if (!historique.length) return;
  if (!confirm('Effacer tout l\'historique ?')) return;
  historique = [];
  save('bamfc_historique', historique);
  clearHistoriqueCloud();
  renderHistorique();
  renderStats();
  updateHero();
}

// ─── STATS ───────────────────────────────────────────────
function renderStats() {
  const tbody = document.getElementById('statsBody');
  if (!joueurs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Aucune donnée.</td></tr>';
    return;
  }

  const stats = joueurs.map(j => {
    let matchs = 0, victoires = 0, buts = 0;
    historique.forEach(m => {
      const myTeam = m.teams.find(t => t.joueurs.includes(j.id));
      if (!myTeam) return;
      matchs++;
      buts += m.buts[j.id] || 0;
      const maxScore = Math.max(...m.teams.map(t => t.score));
      const isNul = m.teams.filter(t => t.score === maxScore).length > 1;
      if (!isNul && myTeam.score === maxScore) victoires++;
    });
    return { ...j, matchs, victoires, buts, winPct: matchs ? Math.round((victoires / matchs) * 100) : 0 };
  });

  stats.sort((a, b) => b.victoires - a.victoires || b.buts - a.buts);

  tbody.innerHTML = stats.map((j, i) => {
    const col = colorFor(j.nom);
    const rank = i + 1;
    return `<tr>
      <td class="rank ${rank <= 3 ? 'top' : ''}">${rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : rank}</td>
      <td>
        <span class="stat-avatar" style="background:${col.bg};color:${col.text}">${initials(j.nom)}</span>
        ${j.nom}
      </td>
      <td>${j.matchs}</td>
      <td>${j.victoires}</td>
      <td style="color:var(--accent);font-weight:500">${j.buts}</td>
      <td>
        <div class="win-bar">
          <div class="win-bar-bg"><div class="win-bar-fill" style="width:${j.winPct}%"></div></div>
          <span style="font-size:13px;color:var(--text-muted)">${j.winPct}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── HERO STATS ──────────────────────────────────────────
function updateHero() {
  document.getElementById('heroMatchs').textContent = historique.length;
  document.getElementById('heroJoueurs').textContent = joueurs.length;
  const totalButs = historique.reduce((sum, m) => sum + Object.values(m.buts).reduce((a, b) => a + b, 0), 0);
  document.getElementById('heroButs').textContent = totalButs;
}

// ─── MODAL ───────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeModalIfBg(e, id) { if (e.target.id === id) closeModal(id); }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
});
document.getElementById('inputNom').addEventListener('keydown', e => { if (e.key === 'Enter') ajouterJoueur(); });

// ─── TOAST ───────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}


// ─── TERRAIN ─────────────────────────────────────────────
const FORMATIONS = {
  '2-2':   [ [0.5,0.88], [0.25,0.68],[0.75,0.68], [0.25,0.45],[0.75,0.45] ],
  '1-2-1': [ [0.5,0.88], [0.5,0.68], [0.25,0.48],[0.75,0.48], [0.5,0.30] ],
  '2-1-1': [ [0.5,0.88], [0.25,0.70],[0.75,0.70], [0.5,0.50], [0.5,0.30] ],
};
const FORMATIONS_B = {
  '2-2':   [ [0.5,0.12], [0.25,0.32],[0.75,0.32], [0.25,0.55],[0.75,0.55] ],
  '1-2-1': [ [0.5,0.12], [0.5,0.32], [0.25,0.52],[0.75,0.52], [0.5,0.70] ],
  '2-1-1': [ [0.5,0.12], [0.25,0.30],[0.75,0.30], [0.5,0.50], [0.5,0.70] ],
};

let playerPositions = {};

function drawField() {
  const canvas = document.getElementById('terrainCanvas');
  if (!canvas) return;
  const W = canvas.parentElement.clientWidth || 600;
  const H = W * (105/68);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const stripes = 10;
  const sw = W / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#2d7a2d' : '#268c26';
    ctx.fillRect(i * sw, 0, sw, H);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, W-16, H-16);
  ctx.beginPath(); ctx.moveTo(8, H/2); ctx.lineTo(W-8, H/2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2, H/2, W*0.12, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2, H/2, 3, 0, Math.PI*2); ctx.fillStyle='white'; ctx.fill();
  const bw = W * 0.55, bh = H * 0.15, bx = (W - bw) / 2;
  ctx.strokeRect(bx, 8, bw, bh);
  ctx.strokeRect(bx, H - 8 - bh, bw, bh);
  const sw2 = W*0.28, sh2 = H*0.07, sx = (W - sw2) / 2;
  ctx.strokeRect(sx, 8, sw2, sh2);
  ctx.strokeRect(sx, H - 8 - sh2, sw2, sh2);
  ctx.beginPath(); ctx.arc(W/2, H*0.82, 3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(W/2, H*0.18, 3, 0, Math.PI*2); ctx.fill();
}

function getPlayerStats(id) {
  let matchs = 0, victoires = 0, buts = 0;
  historique.forEach(m => {
    const myTeam = m.teams.find(t => t.joueurs.includes(id));
    if (!myTeam) return;
    matchs++;
    buts += m.buts[id] || 0;
    const maxScore = Math.max(...m.teams.map(t => t.score));
    const isNul = m.teams.filter(t => t.score === maxScore).length > 1;
    if (!isNul && myTeam.score === maxScore) victoires++;
  });
  const winPct = matchs ? Math.round((victoires / matchs) * 100) : 0;
  const rating = matchs === 0 ? 60 : Math.min(99, Math.round(50 + (victoires * 2.5) + (buts * 1.5) + (winPct * 0.1)));
  return { matchs, victoires, buts, winPct, rating };
}

function getRatingColor(r) {
  if (r >= 85) return { bg: 'linear-gradient(135deg,#d4a843,#f0c84a)', border: '#c8952a', text: '#3a2800' };
  if (r >= 75) return { bg: 'linear-gradient(135deg,#8fc169,#a8d878)', border: '#6a9940', text: '#1a3000' };
  if (r >= 65) return { bg: 'linear-gradient(135deg,#5a8fc4,#7ab0e0)', border: '#3a6fa0', text: '#001830' };
  return { bg: 'linear-gradient(135deg,#888,#aaa)', border: '#666', text: '#111' };
}

function makeFifaCard(j) {
  const st = getPlayerStats(j.id);
  const rc = getRatingColor(st.rating);
  return '<div class="fifa-card" style="border-color:' + rc.border + ';background:' + rc.bg + '">' +
    '<div class="fc-top"><span class="fc-rating" style="color:' + rc.text + '">' + st.rating + '</span><span class="fc-poste" style="color:' + rc.text + '">' + (j.poste || 'JR') + '</span></div>' +
    '<div class="fc-avatar" style="color:' + rc.text + '">' + initials(j.nom) + '</div>' +
    '<div class="fc-nom" style="color:' + rc.text + '">' + j.nom + '</div>' +
    '<div class="fc-stats" style="color:' + rc.text + '">' +
      '<span><b>' + st.buts + '</b> BT</span>' +
      '<span><b>' + st.victoires + '</b> V</span>' +
      '<span><b>' + st.matchs + '</b> M</span>' +
    '</div>' +
  '</div>';
}

function renderTerrain() {
  if (!currentTeams.length) return;
  document.getElementById('terrainWrap').style.display = '';
  document.getElementById('terrainHint').style.display = 'none';
  drawField();
  const container = document.getElementById('terrainPlayers');
  container.innerHTML = '';
  const fmtA = document.getElementById('formationA').value;
  const fmtB = document.getElementById('formationB').value;
  const posA = FORMATIONS[fmtA] || FORMATIONS['2-2'];
  const posB = FORMATIONS_B[fmtB] || FORMATIONS_B['2-2'];
  [currentTeams[0] || [], currentTeams[1] || []].forEach((team, ti) => {
    const positions = ti === 0 ? posA : posB;
    team.forEach((j, idx) => {
      const defPos = positions[idx] || [0.5, ti === 0 ? 0.75 : 0.25];
      const pos = playerPositions[j.id] || { x: defPos[0], y: defPos[1] };
      const el = document.createElement('div');
      el.className = 't-player';
      el.style.left = (pos.x * 100) + '%';
      el.style.top = (pos.y * 100) + '%';
      el.innerHTML = makeFifaCard(j);
      let dragging = false, ox = 0, oy = 0;
      const field = document.getElementById('terrainField');
      el.addEventListener('mousedown', e => {
        dragging = true;
        const r = el.getBoundingClientRect();
        ox = e.clientX - r.left - r.width/2;
        oy = e.clientY - r.top - r.height/2;
        e.preventDefault();
      });
      el.addEventListener('touchstart', e => {
        dragging = true;
        const t = e.touches[0];
        const r = el.getBoundingClientRect();
        ox = t.clientX - r.left - r.width/2;
        oy = t.clientY - r.top - r.height/2;
        e.preventDefault();
      }, { passive: false });
      const onMove = (cx, cy) => {
        if (!dragging) return;
        const fr = field.getBoundingClientRect();
        let px = Math.max(0.03, Math.min(0.97, (cx - ox - fr.left) / fr.width));
        let py = Math.max(0.03, Math.min(0.97, (cy - oy - fr.top) / fr.height));
        el.style.left = (px * 100) + '%';
        el.style.top = (py * 100) + '%';
        playerPositions[j.id] = { x: px, y: py };
      };
      document.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
      document.addEventListener('touchmove', e => { if(dragging) onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
      document.addEventListener('mouseup', () => { dragging = false; });
      document.addEventListener('touchend', () => { dragging = false; });
      container.appendChild(el);
    });
  });
}

function resetPositions() { playerPositions = {}; renderTerrain(); }
window.addEventListener('resize', () => { if (currentTeams.length) renderTerrain(); });

// ─── INIT ─────────────────────────────────────────────────
renderJoueurs();
renderHistorique();
renderStats();
updateHero();
syncFromCloud();

// ─── IMPORT LEFIVE ───────────────────────────────────────
function saveLefiveToken() {
  const v = document.getElementById('lefiveToken').value.trim();
  if (!v) { toast('Token vide !'); return; }
  localStorage.setItem('lefive_token', v);
  updateTokenStatus();
  toast('Token sauvegarde ✓');
  document.getElementById('lefiveToken').value = '';
}

function updateTokenStatus() {
  const t = localStorage.getItem('lefive_token');
  const el = document.getElementById('tokenStatus');
  if (!el) return;
  if (t) { el.textContent = '✓ Token sauvegarde (' + t.slice(7, 17) + '...)'; el.classList.add('ok'); }
  else { el.textContent = 'Aucun token enregistre'; el.classList.remove('ok'); }
}

async function importerLefive() {
  const url = document.getElementById('lefiveUrl').value.trim();
  const token = localStorage.getItem('lefive_token');
  if (!url) { toast('URL vide !'); return; }
  if (!token) { toast('Token manquant !'); return; }

  const m = url.match(/\/(\d+)(?:[/?#]|$)/);
  if (!m) { toast('URL invalide'); return; }
  const matchId = m[1];

  const btn = document.getElementById('importBtn');
  btn.disabled = true; btn.textContent = '⏳ Import en cours...';

  try {
    const r = await fetch('/api/lefive?matchId=' + matchId, {
      headers: { 'X-Token': token }
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erreur API');
    afficherImport(data, matchId);
    toast('Match importe ✓');
  } catch (err) {
    toast('Erreur: ' + err.message);
    document.getElementById('importResult').innerHTML = '<div style="color:var(--danger);padding:10px;font-size:13px">Erreur: ' + err.message + '</div>';
  } finally {
    btn.disabled = false; btn.textContent = '📥 Importer le match';
  }
}

let lastImportData = null;
function afficherImport(data, matchId) {
  lastImportData = data;
  const el = document.getElementById('importResult');
  const teams = data.teams || [];
  const buts = data.buts || [];
  const score = data.score || {};

  const sc0 = score[teams[0]?.id] || score[String(teams[0]?.id)] || 0;
  const sc1 = score[teams[1]?.id] || score[String(teams[1]?.id)] || 0;

  // Compter buts par joueur
  const butsByPlayer = {};
  buts.forEach(b => {
    if (!butsByPlayer[b.playerId]) butsByPlayer[b.playerId] = [];
    butsByPlayer[b.playerId].push(b);
  });

  let html = '<div class="import-summary">';
  html += '<h4>Match #' + matchId + '</h4>';
  if (teams.length >= 2) {
    html += '<div class="import-teams">';
    html += '<span>' + teams[0].name + '</span>';
    html += '<span class="import-score">' + sc0 + ' - ' + sc1 + '</span>';
    html += '<span>' + teams[1].name + '</span>';
    html += '</div>';
  }

  // TERRAIN FIFA STYLE
  if (teams.length >= 2) {
    html += '<div class="match-pitch" id="matchPitch"><canvas id="pitchCanvas"></canvas><div class="pitch-players" id="pitchPlayers"></div></div>';
  }

  html += '<div style="font-size:12px;color:var(--text-muted);text-align:center;margin-top:1rem">' + buts.length + ' buts au total · clique sur un joueur ou un but</div>';

  html += '<div class="import-buts-list">';
  buts.forEach(b => {
    html += '<div class="import-but" onclick="playVideo(\'' + b.videoUrl + '\', \'' + (b.playerName || '').replace(/\'/g, "") + '\', ' + b.time + ')">';
    html += '<div class="import-but-info">';
    html += '<span class="import-but-time">' + Math.floor(b.time/60) + "'</span>";
    html += '<span><b>' + (b.playerName || '?') + '</b> · ' + (b.teamName || '') + '</span>';
    html += '</div>';
    html += '<span class="import-but-play">▶ Voir le but</span>';
    html += '</div>';
  });
  html += '</div>';

  html += '<button class="btn-primary" style="margin-top:1rem;width:100%" onclick="enregistrerImportComme()">✅ Enregistrer dans l historique BamFC</button>';
  html += '</div>';

  el.innerHTML = html;

  // Render pitch
  if (teams.length >= 2) {
    setTimeout(() => renderMatchPitch(teams, butsByPlayer), 50);
  }
}

function renderMatchPitch(teams, butsByPlayer) {
  const canvas = document.getElementById('pitchCanvas');
  if (!canvas) return;
  const W = canvas.parentElement.clientWidth || 700;
  const H = W * 0.65;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Pelouse - bandes verticales
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#2d7a2d' : '#268c26';
    ctx.fillRect(i * (W/12), 0, W/12, H);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, W-16, H-16);
  // Ligne mediane verticale
  ctx.beginPath(); ctx.moveTo(W/2, 8); ctx.lineTo(W/2, H-8); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2, H/2, H*0.18, 0, Math.PI*2); ctx.stroke();
  // Surfaces de reparation
  const bw = W*0.13, bh = H*0.55, by = (H-bh)/2;
  ctx.strokeRect(8, by, bw, bh);
  ctx.strokeRect(W-8-bw, by, bw, bh);

  const container = document.getElementById('pitchPlayers');
  container.innerHTML = '';

  // Positions pour 5 joueurs - equipe gauche puis droite (horizontal)
  const posLeft  = [[0.06,0.50],[0.20,0.25],[0.20,0.75],[0.35,0.35],[0.35,0.65]];
  const posRight = [[0.94,0.50],[0.80,0.25],[0.80,0.75],[0.65,0.35],[0.65,0.65]];

  [0, 1].forEach(ti => {
    const team = teams[ti];
    const positions = ti === 0 ? posLeft : posRight;
    const acc = ti === 0 ? '#4AB8FF' : '#4AFF6A';
    team.joueurs.slice(0, 5).forEach((p, idx) => {
      const pos = positions[idx] || [0.5, ti === 0 ? 0.20 : 0.80];
      const nbButs = (butsByPlayer[p.id] || []).length;
      const col = colorFor(p.name);
      const el = document.createElement('div');
      el.className = 'pitch-player';
      el.style.left = (pos[0] * 100) + '%';
      el.style.top = (pos[1] * 100) + '%';
      const hasGoals = nbButs > 0;
      el.innerHTML = '<div class="pp-card' + (hasGoals ? ' has-goals' : '') + '" style="border-color:' + acc + '">' +
        (hasGoals ? '<span class="pp-badge" style="background:' + acc + '">⚽ ' + nbButs + '</span>' : '') +
        '<div class="pp-avatar" style="background:' + col.bg + ';color:' + col.text + '">' + initials(p.name) + '</div>' +
        '<div class="pp-name">' + p.name + '</div>' +
      '</div>';
      el.onclick = () => showPlayerGoals(p, butsByPlayer[p.id] || []);
      container.appendChild(el);
    });
  });
}

window._playerGoalsCache = [];
function showPlayerGoals(player, goals) {
  if (!goals.length) {
    toast(player.name + ' n a pas marque dans ce match');
    return;
  }
  if (goals.length === 1) {
    playVideo(goals[0].videoUrl, player.name, goals[0].time);
    return;
  }
  window._playerGoalsCache = goals;
  window._currentPlayerName = player.name;

  let html = '<div style="display:flex;flex-direction:column;gap:8px">';
  goals.forEach((g, i) => {
    html += '<div class="import-but" onclick="playGoalFromCache(' + i + ')">';
    html += '<div class="import-but-info"><span class="import-but-time">' + Math.floor(g.time/60) + "'</span><span>" + g.name + '</span></div>';
    html += '<span class="import-but-play">▶</span></div>';
  });
  html += '</div>';

  document.getElementById('videoTitle').textContent = player.name + ' · ' + goals.length + ' buts';
  document.getElementById('videoPlayer').style.display = 'none';
  document.getElementById('videoPlayer').pause();
  // remove old list if exists
  const old = document.getElementById('playerGoalsList');
  if (old) old.remove();
  document.querySelector('#modalVideo .modal-body').insertAdjacentHTML('beforeend', '<div id="playerGoalsList">' + html + '</div>');
  openModal('modalVideo');
}

function playGoalFromCache(idx) {
  const g = window._playerGoalsCache[idx];
  if (!g) return;
  const list = document.getElementById('playerGoalsList');
  if (list) list.remove();
  document.getElementById('videoPlayer').style.display = '';
  playVideo(g.videoUrl, window._currentPlayerName, g.time);
}

function playVideo(url, title, time) {
  if (!url) { toast('Pas de video disponible'); return; }
  document.getElementById('videoTitle').textContent = 'But · ' + title + ' (' + Math.floor(time/60) + "')";
  document.getElementById('videoPlayer').src = url;
  openModal('modalVideo');
}

function enregistrerImportComme() {
  if (!lastImportData) return;
  const d = lastImportData;
  const teams = d.teams || [];
  if (teams.length < 2) { toast('Pas assez d equipes'); return; }

  // Ajouter joueurs absents
  teams.forEach(team => {
    team.joueurs.forEach(p => {
      if (!joueurs.find(j => j.nom === p.name)) {
        joueurs.push({ id: uid(), nom: p.name, poste: '' });
      }
    });
  });
  save('bamfc_joueurs', joueurs);

  const butsMap = {};
  d.buts.forEach(b => {
    const j = joueurs.find(j => j.nom === b.playerName);
    if (j) butsMap[j.id] = (butsMap[j.id] || 0) + 1;
  });

  const match = {
    id: uid(),
    date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    teams: teams.map(t => ({
      nom: t.name,
      joueurs: t.joueurs.map(p => joueurs.find(j => j.nom === p.name)?.id).filter(Boolean),
      score: d.score[t.id] || 0,
    })),
    buts: butsMap,
    videos: d.buts.filter(b => b.videoUrl).map(b => ({ playerName: b.playerName, time: b.time, url: b.videoUrl })),
    source: 'lefive',
  };
  historique.unshift(match);
  save('bamfc_historique', historique);
  pushMatch(match);
  joueurs.forEach(jj => pushJoueur(jj));
  renderJoueurs();
  renderHistorique();
  renderStats();
  updateHero();
  toast('Match ajoute a l historique ✓');
  document.getElementById('historique').scrollIntoView({ behavior: 'smooth' });
}

updateTokenStatus();
