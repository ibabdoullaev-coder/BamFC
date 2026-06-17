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
  joueurs.push({ id: uid(), nom, poste });
  save('bamfc_joueurs', joueurs);
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
    return `<div class="player-card">
      <button class="player-delete" onclick="supprimerJoueur('${j.id}')" title="Supprimer">×</button>
      <div class="player-avatar" style="background:${col.bg};color:${col.text}">${initials(j.nom)}</div>
      <div class="player-name">${j.nom}</div>
      ${j.poste ? `<div class="player-poste">${j.poste}</div>` : ''}
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

// ─── INIT ─────────────────────────────────────────────────
renderJoueurs();
renderHistorique();
renderStats();
updateHero();
