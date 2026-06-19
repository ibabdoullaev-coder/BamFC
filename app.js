
function findJoueurByName(nom) {
  if (!nom) return null;
  const lower = nom.toLowerCase().trim();
  return joueurs.find(j => {
    if (j.nom.toLowerCase().trim() === lower) return true;
    if ((j.aliases || []).some(a => a.toLowerCase().trim() === lower)) return true;
    return false;
  });
}

function parseDateFR(s) {
  if (!s) return 0;
  // Cherche un pattern dd/mm/yy ou dd/mm/yyyy ou dd/mm
  const m = s.match(/(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
  if (!m) return 0;
  const day = parseInt(m[1]), month = parseInt(m[2]) - 1;
  let year = m[3] ? parseInt(m[3]) : new Date().getFullYear();
  if (year < 100) year += 2000;
  return new Date(year, month, day).getTime();
}
// ─── IDENTITE JOUEUR ─────────────────────────────────────
function getMyPlayerId() { return localStorage.getItem('bamfc_my_player_id'); }
function setMyPlayerId(id) { localStorage.setItem('bamfc_my_player_id', id); applyIdentityUI(); hideNudgeOnLogin && hideNudgeOnLogin(); }
function clearMyPlayerId() { localStorage.removeItem('bamfc_my_player_id'); applyIdentityUI(); }

function applyIdentityUI() {
  const myId = getMyPlayerId();
  const j = myId ? joueurs.find(x => x.id === myId) : null;
  const badge = document.getElementById('identityBadge');
  if (badge) {
    if (j) badge.innerHTML = '👤 ' + j.nom + ' <span style="opacity:0.6;font-size:10px">×</span>';
    else badge.innerHTML = '👤 Qui es-tu ?';
    badge.style.display = '';
  }
}

function openIdentityModal() {
  const myId = getMyPlayerId();
  if (myId) {
    if (confirm('Se deconnecter de cette identite ?')) clearMyPlayerId();
    return;
  }
  const html = joueurs.map(j => {
    const col = colorFor(j.nom);
    const avatar = j.photo ? `<div class="js-avatar" style="background-image:url('${j.photo}')"></div>` : `<div class="js-avatar" style="background:${col.bg};color:${col.text}">${initials(j.nom)}</div>`;
    return `<div class="js-row" onclick="loginAsJoueur('${j.id}')">
      ${avatar}<span>${j.nom}</span>
    </div>`;
  }).join('');
  document.getElementById('identityList').innerHTML = html;
  openModal('modalIdentity');
}

async function loginAsJoueur(jid) {
  const j = joueurs.find(x => x.id === jid);
  if (!j) return;
  if (!j.pin) {
    // pas de PIN: demande au coach/admin de le creer
    if (isCoach) {
      const newPin = prompt(`Crée un PIN pour ${j.nom} (4 chiffres, partage le lui)`);
      if (!newPin || !/^\d{4}$/.test(newPin)) { toast('PIN invalide (4 chiffres)'); return; }
      j.pin = newPin;
      if (sb) await sb.from('joueurs').update({ pin: newPin }).eq('id', jid);
      setMyPlayerId(jid);
      closeModal('modalIdentity');
      toast('Connecte en tant que ' + j.nom);
    } else {
      toast('Demande a Ibrahim de te creer un PIN');
    }
    return;
  }
  const entered = prompt('PIN de ' + j.nom);
  if (entered === j.pin) {
    setMyPlayerId(jid);
    closeModal('modalIdentity');
    toast('Connecte en tant que ' + j.nom);
  } else {
    toast('PIN incorrect');
  }
}

// ─── ADMIN MODE ──────────────────────────────────────────
const ADMIN_PASS = 'bam2026';
const COACH_PASS = 'bamcoach';
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('admin') === ADMIN_PASS) {
  localStorage.setItem('bamfc_admin', '1');
  localStorage.removeItem('bamfc_coach');
  window.history.replaceState({}, '', window.location.pathname + window.location.hash);
} else if (urlParams.get('coach') === COACH_PASS) {
  localStorage.setItem('bamfc_coach', '1');
  window.history.replaceState({}, '', window.location.pathname + window.location.hash);
}
const isAdmin = localStorage.getItem('bamfc_admin') === '1';
const isCoach = isAdmin || localStorage.getItem('bamfc_coach') === '1';

// Appliquer immediatement
document.documentElement.classList.toggle('is-admin', isAdmin);
document.documentElement.classList.toggle('is-coach', isCoach);
document.documentElement.classList.toggle('is-viewer', !isCoach);

function applyAdminMode() {
  document.body.classList.toggle('is-admin', isAdmin);
  document.body.classList.toggle('is-coach', isCoach);
  document.body.classList.toggle('is-viewer', !isCoach);
  if (isAdmin) {
    setTimeout(() => {
      const after = document.body;
      after.addEventListener('click', e => {
        const rect = { right: window.innerWidth - 16, bottom: window.innerHeight - 16 };
        if (e.clientX > rect.right - 80 && e.clientY > rect.bottom - 35) {
          if (confirm('Se deconnecter du mode admin ?')) logoutAdmin();
        }
      });
    }, 100);
  }
}

function logoutAdmin() {
  localStorage.removeItem('bamfc_admin');
  location.reload();
}

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
      joueurs = j.map(r => ({ id: r.id, nom: r.nom, poste: r.poste || '', photo: r.photo || null, pin: r.pin || null, aliases: r.aliases ? r.aliases.split('|').filter(Boolean) : [], stats: r.stats || null, rating: r.rating || null, country: r.country || 'FR', club: r.club || 'bamfc' }));
      localStorage.setItem('bamfc_joueurs', JSON.stringify(joueurs));
    }
    if (h) {
      historique = h.map(r => ({ id: r.id, date: r.date, teams: r.teams, buts: r.buts, videos: r.videos || [], source: r.source || null, nom: r.nom || null }));
      // Tri par date du match (chrono inverse: plus recent en haut)
      historique.sort((a, b) => {
        const da = parseDateFR(a.nom || a.date);
        const db = parseDateFR(b.nom || b.date);
        if (da === 0 && db === 0) return 0;
        if (da === 0) return 1;
        if (db === 0) return -1;
        return db - da;
      });
      localStorage.setItem('bamfc_historique', JSON.stringify(historique));
    }
    renderJoueurs();
    renderHistorique();
    renderStats();
    renderBench();
    updateHero();
    console.log('Synced from cloud');
    maybeShowLoginNudge();
    syncPronos();
  } catch (e) { console.warn('Sync error:', e); }
}

async function pushJoueur(j) {
  if (!sb) return;
  await sb.from('joueurs').upsert({ id: j.id, nom: j.nom, poste: j.poste, photo: j.photo, pin: j.pin || null, aliases: (j.aliases || []).join('|') || null, stats: j.stats || null, rating: j.rating || null, country: j.country || null, club: j.club || null });
}
async function deleteJoueurCloud(id) {
  if (!sb) return;
  await sb.from('joueurs').delete().eq('id', id);
}
async function pushMatch(m) {
  if (!sb) return;
  await sb.from('historique').upsert({ id: m.id, date: m.date, teams: m.teams, buts: m.buts, videos: m.videos || [], source: m.source || null, nom: m.nom || null });
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



const CLUBS = [
  // France
  { id: '85', n: 'Paris Saint-Germain' }, { id: '81', n: 'Marseille' }, { id: '79', n: 'Lyon' },
  { id: '91', n: 'Monaco' }, { id: '84', n: 'Nice' }, { id: '80', n: 'Lille' },
  { id: '94', n: 'Rennes' }, { id: '116', n: 'Lens' }, { id: '93', n: 'Reims' },
  { id: '83', n: 'Nantes' }, { id: '95', n: 'Strasbourg' }, { id: '78', n: 'Bordeaux' },
  // Angleterre
  { id: '40', n: 'Liverpool' }, { id: '50', n: 'Manchester City' }, { id: '33', n: 'Manchester United' },
  { id: '49', n: 'Chelsea' }, { id: '42', n: 'Arsenal' }, { id: '47', n: 'Tottenham' },
  { id: '34', n: 'Newcastle' }, { id: '66', n: 'Aston Villa' }, { id: '51', n: 'Brighton' },
  { id: '45', n: 'Everton' }, { id: '36', n: 'Fulham' }, { id: '52', n: 'Crystal Palace' },
  { id: '46', n: 'Leicester' }, { id: '39', n: 'Wolves' }, { id: '63', n: 'Leeds' },
  // Espagne
  { id: '541', n: 'Real Madrid' }, { id: '529', n: 'Barcelona' }, { id: '530', n: 'Atletico Madrid' },
  { id: '548', n: 'Real Sociedad' }, { id: '531', n: 'Athletic Bilbao' }, { id: '533', n: 'Villarreal' },
  { id: '532', n: 'Valencia' }, { id: '536', n: 'Sevilla' }, { id: '543', n: 'Real Betis' },
  { id: '538', n: 'Celta Vigo' }, { id: '540', n: 'Espanyol' }, { id: '546', n: 'Getafe' },
  // Italie
  { id: '496', n: 'Juventus' }, { id: '505', n: 'Inter Milan' }, { id: '489', n: 'AC Milan' },
  { id: '492', n: 'Napoli' }, { id: '497', n: 'Roma' }, { id: '487', n: 'Lazio' },
  { id: '499', n: 'Atalanta' }, { id: '502', n: 'Fiorentina' }, { id: '503', n: 'Torino' },
  { id: '495', n: 'Genoa' }, { id: '500', n: 'Bologna' },
  // Allemagne
  { id: '157', n: 'Bayern Munich' }, { id: '165', n: 'Borussia Dortmund' }, { id: '173', n: 'RB Leipzig' },
  { id: '168', n: 'Bayer Leverkusen' }, { id: '169', n: 'Eintracht Frankfurt' }, { id: '167', n: 'Hoffenheim' },
  { id: '172', n: 'VfB Stuttgart' }, { id: '163', n: 'Borussia Monchengladbach' }, { id: '160', n: 'Freiburg' },
  { id: '170', n: 'FC Augsburg' }, { id: '161', n: 'VfL Wolfsburg' }, { id: '162', n: 'Werder Bremen' },
  // Portugal
  { id: '228', n: 'Sporting CP' }, { id: '212', n: 'FC Porto' }, { id: '211', n: 'Benfica' },
  { id: '217', n: 'Braga' },
  // Pays-Bas
  { id: '194', n: 'Ajax' }, { id: '197', n: 'PSV' }, { id: '209', n: 'Feyenoord' },
  // Belgique
  { id: '569', n: 'Club Brugge' }, { id: '554', n: 'Anderlecht' }, { id: '741', n: 'Genk' },
  // Turquie
  { id: '645', n: 'Galatasaray' }, { id: '610', n: 'Fenerbahce' }, { id: '611', n: 'Besiktas' },
  // Bresil/Argentine
  { id: '127', n: 'Flamengo' }, { id: '130', n: 'Sao Paulo' }, { id: '124', n: 'Boca Juniors' },
  { id: '435', n: 'River Plate' }, { id: '131', n: 'Corinthians' }, { id: '133', n: 'Palmeiras' },
  // USA / MLS
  { id: '1610', n: 'LA Galaxy' }, { id: '1599', n: 'Inter Miami' }, { id: '1614', n: 'LAFC' },
  // Arabie / Saudi
  { id: '2939', n: 'Al-Nassr' }, { id: '2932', n: 'Al-Hilal' }, { id: '2935', n: 'Al-Ittihad' },
  // Libres/perso
  { id: 'free', n: 'Free Agent' }, { id: 'icon', n: 'Icon' }, { id: 'hero', n: 'Hero' },
  // Special Bam FC
  { id: 'bamfc', n: 'Bam FC' },
];

const COUNTRIES = [
  { code: 'FR', n: 'France', flag: '🇫🇷' }, { code: 'DZ', n: 'Algerie', flag: '🇩🇿' },
  { code: 'MA', n: 'Maroc', flag: '🇲🇦' }, { code: 'TN', n: 'Tunisie', flag: '🇹🇳' },
  { code: 'SN', n: 'Senegal', flag: '🇸🇳' }, { code: 'CI', n: 'Cote d Ivoire', flag: '🇨🇮' },
  { code: 'CM', n: 'Cameroun', flag: '🇨🇲' }, { code: 'ML', n: 'Mali', flag: '🇲🇱' },
  { code: 'CD', n: 'RD Congo', flag: '🇨🇩' }, { code: 'NG', n: 'Nigeria', flag: '🇳🇬' },
  { code: 'GH', n: 'Ghana', flag: '🇬🇭' }, { code: 'EG', n: 'Egypte', flag: '🇪🇬' },
  { code: 'PT', n: 'Portugal', flag: '🇵🇹' }, { code: 'ES', n: 'Espagne', flag: '🇪🇸' },
  { code: 'IT', n: 'Italie', flag: '🇮🇹' }, { code: 'DE', n: 'Allemagne', flag: '🇩🇪' },
  { code: 'GB', n: 'Angleterre', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' }, { code: 'NL', n: 'Pays-Bas', flag: '🇳🇱' },
  { code: 'BE', n: 'Belgique', flag: '🇧🇪' }, { code: 'TR', n: 'Turquie', flag: '🇹🇷' },
  { code: 'BR', n: 'Bresil', flag: '🇧🇷' }, { code: 'AR', n: 'Argentine', flag: '🇦🇷' },
  { code: 'US', n: 'USA', flag: '🇺🇸' }, { code: 'CA', n: 'Canada', flag: '🇨🇦' },
  { code: 'MX', n: 'Mexique', flag: '🇲🇽' }, { code: 'JP', n: 'Japon', flag: '🇯🇵' },
  { code: 'KR', n: 'Coree', flag: '🇰🇷' }, { code: 'SA', n: 'Arabie Saoudite', flag: '🇸🇦' },
  { code: 'QA', n: 'Qatar', flag: '🇶🇦' }, { code: 'AE', n: 'Emirats', flag: '🇦🇪' },
];

const POSITIONS = ['GB','BU','MO','MD','MG','AD','DC','DG','DD','ATT','MIL','DEF'];

function getClubLogo(clubId) {
  if (!clubId || clubId === 'free' || clubId === 'bamfc') return null;
  return `https://media.api-sports.io/football/teams/${clubId}.png`;
}

function getClub(clubId) {
  return CLUBS.find(c => c.id === clubId);
}

function getCountry(code) {
  return COUNTRIES.find(c => c.code === code);
}

const FIFA_STATS_DEFAULT = [
  { key: 'PAC', label: 'PAC', value: 70 },
  { key: 'SHO', label: 'SHO', value: 70 },
  { key: 'PAS', label: 'PAS', value: 70 },
  { key: 'DRI', label: 'DRI', value: 70 },
  { key: 'DEF', label: 'DEF', value: 70 },
  { key: 'PHY', label: 'PHY', value: 70 },
];

function getPlayerFifaStats(j) {
  if (j.stats && Array.isArray(j.stats) && j.stats.length) return j.stats;
  return FIFA_STATS_DEFAULT.map(s => ({ ...s }));
}

function getPlayerRating(j) {
  if (j.rating) return j.rating;
  const stats = getPlayerFifaStats(j);
  return Math.round(stats.reduce((s, x) => s + x.value, 0) / stats.length);
}

function getFutCardStyle(rating) {
  if (rating >= 90) return { bg: 'linear-gradient(135deg,#f5dba5,#fff5d4,#d4a843)', border: '#a87a1a', text: '#3a2800' };
  if (rating >= 85) return { bg: 'linear-gradient(135deg,#d4a843,#f0c84a,#e0b53a)', border: '#8a6515', text: '#3a2800' };
  if (rating >= 80) return { bg: 'linear-gradient(135deg,#c4c4c4,#e8e8e8,#aaaaaa)', border: '#666', text: '#1a1a1a' };
  if (rating >= 75) return { bg: 'linear-gradient(135deg,#9b6a3c,#c4925e,#7a4d28)', border: '#5a3a1c', text: '#fff' };
  if (rating >= 65) return { bg: 'linear-gradient(135deg,#5a8fc4,#7ab0e0,#4a7fb4)', border: '#3a6fa0', text: '#fff' };
  return { bg: 'linear-gradient(135deg,#6a6a6a,#888,#5a5a5a)', border: '#444', text: '#fff' };
}

function makeFutCard(j, sizeClass) {
  const stats = getPlayerFifaStats(j);
  const rating = getPlayerRating(j);
  const tier = getCardTier(rating);
  const col = colorFor(j.nom);
  const photo = j.photo
    ? `<div class="fut-photo" style="background-image:url('${j.photo}')"></div>`
    : `<div class="fut-photo fut-photo-initials" style="background:${col.bg};color:${col.text}">${initials(j.nom)}</div>`;

  const country = getCountry(j.country) || { flag: '🇫🇷' };
  const club = getClub(j.club || 'bamfc');
  const clubLogo = getClubLogo(j.club) || '';
  const clubHtml = clubLogo
    ? `<img class="fut-club-logo" src="${clubLogo}" onerror="this.style.display='none'" alt="" />`
    : `<div class="fut-club-logo fut-club-text">BAM</div>`;

  const half = Math.ceil(stats.length / 2);
  const col1 = stats.slice(0, half);
  const col2 = stats.slice(half);
  const statsHtml = `<div class="fut-stats">
    <div class="fut-stats-col">${col1.map(s => `<div><b>${s.value}</b> ${s.label}</div>`).join('')}</div>
    <div class="fut-stats-col">${col2.map(s => `<div><b>${s.value}</b> ${s.label}</div>`).join('')}</div>
  </div>`;

  return `<div class="fut-card fut-tier-${tier} ${sizeClass || ''}">
    <div class="fut-bg"></div>
    <div class="fut-top">
      <div class="fut-rating-pos">
        <div class="fut-rating">${rating}</div>
        <div class="fut-pos">${j.poste || 'JR'}</div>
        <div class="fut-flag">${country.flag}</div>
        ${clubHtml}
      </div>
      ${photo}
    </div>
    <div class="fut-name">${j.nom}</div>
    <div class="fut-divider"></div>
    ${statsHtml}
  </div>`;
}

function getCardTier(rating) {
  if (rating >= 90) return 'icon';
  if (rating >= 85) return 'gold-rare';
  if (rating >= 75) return 'gold';
  if (rating >= 65) return 'silver';
  return 'bronze';
}

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
    return `<div class="player-card-fut" onclick="openPlayerProfile('${j.id}')">
      ${isAdmin ? `<button class="player-delete" onclick="event.stopPropagation();supprimerJoueur('${j.id}')" title="Supprimer">×</button>` : ''}
      ${makeFutCard(j)}
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

let selectedJoueurs = null; // ids des joueurs selectionnes pour le match

function openJoueurSelection() {
  if (joueurs.length < 2) { toast('Ajoute au moins 2 joueurs !'); return; }
  if (!selectedJoueurs) selectedJoueurs = joueurs.map(j => j.id);
  const html = joueurs.map(j => {
    const col = colorFor(j.nom);
    const checked = selectedJoueurs.includes(j.id);
    const avatar = j.photo ? `<div class="js-avatar" style="background-image:url('${j.photo}')"></div>` : `<div class="js-avatar" style="background:${col.bg};color:${col.text}">${initials(j.nom)}</div>`;
    return `<label class="js-row ${checked ? 'checked' : ''}">
      <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleJoueurSel('${j.id}', this)" />
      ${avatar}
      <span>${j.nom}</span>
    </label>`;
  }).join('');
  document.getElementById('joueurSelList').innerHTML = html;
  openModal('modalSelJoueurs');
}

function toggleJoueurSel(id, cb) {
  if (cb.checked) {
    if (!selectedJoueurs.includes(id)) selectedJoueurs.push(id);
  } else {
    selectedJoueurs = selectedJoueurs.filter(x => x !== id);
  }
  cb.closest('.js-row').classList.toggle('checked', cb.checked);
}

function confirmJoueurSel() {
  closeModal('modalSelJoueurs');
  tirerEquipes();
}

function tirerEquipes() {
  if (!selectedJoueurs || selectedJoueurs.length < 2) { openJoueurSelection(); return; }
  const pool = shuffle(joueurs.filter(j => selectedJoueurs.includes(j.id)));
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
  // ne PLUS afficher le scoreInputs : c est juste un pronostique
  document.getElementById('teamsWrap').style.display = '';
  playerPositions = {};
  renderTerrain();
  // Sauvegarder direct comme prono
  saveCurrentAsProno();
}

async function saveCurrentAsProno() {
  if (!sb) return;
  const prono = {
    id: uid(),
    date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    teams: currentTeams.map((team, ti) => ({
      nom: TEAM_NAMES[ti],
      joueurs: team.map(p => p.id),
    })),
    format: currentFormat,
  };
  await sb.from('pronostiques').upsert({ id: prono.id, date: prono.date, teams: prono.teams, format: prono.format });
  pronos.unshift(prono);
  renderPronos();
  toast('Pronostique créé');
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
  // Date du match (depuis lefive) ou aujourd'hui
  let matchDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  if (d.matchDate) {
    const dt = new Date(d.matchDate);
    if (!isNaN(dt)) matchDate = dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  const match = {
    id: uid(),
    date: matchDate,
    nom: matchDate,
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
  el.innerHTML = historique.map((m, mi) => {
    const scores = m.teams.map(t => t.score);
    const maxScore = Math.max(...scores);
    const winners = m.teams.filter(t => t.score === maxScore);
    const isNul = winners.length > 1;
    const hasVideos = (m.videos || []).length > 0;
    return `<div class="match-card-wrap">
      <div class="match-card" onclick="toggleMatchTerrain(${mi})">
        ${isAdmin ? `<button class="match-delete" data-mid="${m.id}">×</button>` : ''}
        <span class="match-date">${m.nom || m.date}</span>
        ${isAdmin ? `<button class="match-rename" data-mid="${m.id}" title="Renommer">✎</button>` : ''}
        <div class="match-teams">
          ${m.teams.map((t, i) => {
            const isWin = !isNul && t.score === maxScore;
            return `<span class="match-team-name" style="color:${isWin ? 'var(--accent)' : 'var(--text)'}">${getJoueursNoms(t.joueurs)}</span>
              ${i < m.teams.length - 1 ? `<span class="match-score">${m.teams[i].score} – ${m.teams[i+1].score}</span>` : ''}`;
          }).join('')}
        </div>
        ${isNul ? '<span class="match-nul">Nul</span>' : `<span class="match-winner">✓ ${winners[0].nom}</span>`}
        <span class="match-expand">${hasVideos ? '⚽ Voir' : '▾'}</span>
      </div>
      <div class="match-terrain" id="matchTerrain${mi}" style="display:none"></div>
    </div>`;
  }).join('');
  // Bind delete/rename buttons
  el.querySelectorAll('.match-delete').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); deleteMatch(btn.dataset.mid); };
  });
  el.querySelectorAll('.match-rename').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); renameMatch(btn.dataset.mid); };
  });
}

function toggleMatchTerrain(mi) {
  const m = historique[mi];
  if (!m) return;
  const el = document.getElementById('matchTerrain' + mi);
  if (!el) return;
  if (el.style.display === 'none') {
    renderHistoriqueTerrain(el, m, mi);
    el.style.display = '';
  } else {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

function renderHistoriqueTerrain(el, m, mi) {
  // Buts par joueur
  const butsByPlayer = {};
  const videosByPlayer = {};
  (m.videos || []).forEach(v => {
    const j = joueurs.find(j => j.nom === v.playerName);
    if (!j) return;
    if (!videosByPlayer[j.id]) videosByPlayer[j.id] = [];
    videosByPlayer[j.id].push({ videoUrl: v.url, time: v.time, name: 'But · ' + v.playerName });
  });
  Object.keys(m.buts || {}).forEach(jid => {
    butsByPlayer[jid] = new Array(m.buts[jid]).fill({});
  });

  el.innerHTML = '<div class="hist-pitch-wrap"><canvas class="hist-pitch-canvas"></canvas><div class="hist-pitch-players"></div></div>';

  const canvas = el.querySelector('.hist-pitch-canvas');
  const W = el.querySelector('.hist-pitch-wrap').clientWidth || 700;
  const H = W * 0.65;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#2d7a2d' : '#268c26';
    ctx.fillRect(i * (W/12), 0, W/12, H);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, W-16, H-16);
  ctx.beginPath(); ctx.moveTo(W/2, 8); ctx.lineTo(W/2, H-8); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2, H/2, H*0.18, 0, Math.PI*2); ctx.stroke();
  const bw = W*0.13, bh = H*0.55, by = (H-bh)/2;
  ctx.strokeRect(8, by, bw, bh);
  ctx.strokeRect(W-8-bw, by, bw, bh);

  const container = el.querySelector('.hist-pitch-players');
  const posLeft  = [[0.06,0.50],[0.20,0.25],[0.20,0.75],[0.35,0.35],[0.35,0.65]];
  const posRight = [[0.94,0.50],[0.80,0.25],[0.80,0.75],[0.65,0.35],[0.65,0.65]];

  m.teams.forEach((team, ti) => {
    const positions = ti === 0 ? posLeft : posRight;
    const acc = TEAM_ACCENT[ti];
    team.joueurs.slice(0, 5).forEach((jid, idx) => {
      const p = joueurs.find(j => j.id === jid);
      if (!p) return;
      const pos = positions[idx] || [0.5, ti === 0 ? 0.20 : 0.80];
      const nbButs = (m.buts || {})[jid] || 0;
      const col = colorFor(p.nom);
      const hasGoals = nbButs > 0;
      const el2 = document.createElement('div');
      el2.className = 'pitch-player';
      el2.style.left = (pos[0] * 100) + '%';
      el2.style.top = (pos[1] * 100) + '%';
      const avatarHtml = p.photo
        ? '<div class="pp-avatar" style="background-image:url(\'' + p.photo + '\');background-size:cover;background-position:center"></div>'
        : '<div class="pp-avatar" style="background:' + col.bg + ';color:' + col.text + '">' + initials(p.nom) + '</div>';
      el2.innerHTML = '<div class="pp-card' + (hasGoals ? ' has-goals' : '') + '" style="border-color:' + acc + '">' +
        (hasGoals ? '<span class="pp-badge" style="background:' + acc + '">⚽ ' + nbButs + '</span>' : '') +
        avatarHtml +
        '<div class="pp-name">' + p.nom + '</div>' +
      '</div>';
      el2.onclick = () => {
        const vids = videosByPlayer[jid];
        if (!vids || !vids.length) { toast(p.nom + ' n a pas de video disponible'); return; }
        if (vids.length === 1) playVideo(vids[0].videoUrl, p.nom, vids[0].time);
        else showPlayerGoals({ name: p.nom }, vids);
      };
      container.appendChild(el2);
    });
  });
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
let statsSortMode = 'victoires';

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

  if (statsSortMode === 'victoires') stats.sort((a, b) => b.victoires - a.victoires || b.buts - a.buts);
  else if (statsSortMode === 'buts') stats.sort((a, b) => b.buts - a.buts || b.victoires - a.victoires);
  else if (statsSortMode === 'matchs') stats.sort((a, b) => b.matchs - a.matchs || b.victoires - a.victoires);
  else if (statsSortMode === 'winPct') stats.sort((a, b) => b.winPct - a.winPct || b.victoires - a.victoires);

  // Update active class on sort pills
  document.querySelectorAll('.stats-sort-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.sort === statsSortMode);
  });

  tbody.innerHTML = stats.map((j, i) => {
    const col = colorFor(j.nom);
    const rank = i + 1;
    return `<tr onclick="openPlayerProfile('${j.id}')" style="cursor:pointer">
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
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  // Si c'est la modal video, stop le son
  if (id === 'modalVideo') {
    const v = document.getElementById('videoPlayer');
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    const list = document.getElementById('playerGoalsList');
    if (list) list.remove();
    const vp = document.getElementById('videoPlayer');
    if (vp) vp.style.display = '';
  }
}
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
setTimeout(applyIdentityUI, 100);
applyAdminMode();
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

async function enregistrerImportComme() {
  if (!lastImportData) return;
  const d = lastImportData;
  const teams = d.teams || [];
  if (teams.length < 2) { toast('Pas assez d equipes'); return; }

  // Ajouter joueurs absents
  teams.forEach(team => {
    team.joueurs.forEach(p => {
      if (!findJoueurByName(p.name)) {
        joueurs.push({ id: uid(), nom: p.name, poste: '' });
      }
    });
  });
  save('bamfc_joueurs', joueurs);

  const butsMap = {};
  d.buts.forEach(b => {
    const j = findJoueurByName(b.playerName);
    if (j) butsMap[j.id] = (butsMap[j.id] || 0) + 1;
  });

  toast('Archivage des videos en cours...');
  // Archiver les videos sur R2 en parallele
  const videosToArchive = d.buts.filter(b => b.videoUrl);
  const archivedVideos = await Promise.all(videosToArchive.map(async b => {
    try {
      // Cle stable basee sur l ID de but lefive
      const key = 'matches/' + (b.matchId || 'unknown') + '/but-' + b.id + '.mp4';
      const resp = await fetch('/api/archive-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: b.videoUrl, key }),
      });
      const data = await resp.json();
      return { playerName: b.playerName, time: b.time, url: data.url || b.videoUrl, lefiveUrl: b.videoUrl };
    } catch (e) {
      console.warn('Archive failed for', b.id, e);
      return { playerName: b.playerName, time: b.time, url: b.videoUrl };
    }
  }));

  // Date du match (depuis lefive) ou aujourd'hui
  let matchDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  if (d.matchDate) {
    const dt = new Date(d.matchDate);
    if (!isNaN(dt)) matchDate = dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  const match = {
    id: uid(),
    date: matchDate,
    nom: matchDate,
    teams: teams.map(t => ({
      nom: t.name,
      joueurs: t.joueurs.map(p => findJoueurByName(p.name)?.id).filter(Boolean),
      score: d.score[t.id] || score[String(t.id)] || 0,
    })),
    buts: butsMap,
    videos: archivedVideos,
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

function setStatsSort(mode) {
  statsSortMode = mode;
  renderStats();
}



// ─── PRONOSTIQUES ─────────────────────────────────────────
let pronos = [];

async function syncPronos() {
  if (!sb) return;
  try {
    const { data } = await sb.from('pronostiques').select('*').order('created_at', { ascending: false });
    if (data) {
      pronos = data.map(r => ({ id: r.id, nom: r.nom || null, date: r.date, teams: r.teams, format: r.format }));
      renderPronos();
    }
  } catch (e) { console.warn(e); }
}

function renderPronos() {
  const el = document.getElementById('pronosList');
  if (!el) return;
  if (!pronos.length) {
    el.innerHTML = '<div class="empty-state">Aucun pronostique. Lance un tirage au sort !</div>';
    return;
  }
  el.innerHTML = pronos.map((p, pi) => {
    const teamsHtml = p.teams.map((t, ti) => {
      const noms = t.joueurs.map(jid => joueurs.find(j => j.id === jid)?.nom || '?').join(', ');
      return `<div class="prono-team" style="color:${TEAM_ACCENT[ti]}">${t.nom}: ${noms}</div>`;
    }).join('');
    const titreAffich = p.nom || p.date;
    return `<div class="match-card-wrap">
      <div class="match-card" onclick="togglePronoTerrain(${pi})">
        ${isCoach ? `<button class="match-delete" data-pid="${p.id}">×</button>` : ''}
        <span class="match-date">${titreAffich}</span>
        <div class="match-teams" style="flex-direction:column;align-items:flex-start;gap:4px">${teamsHtml}</div>
        <span class="match-expand">⚽</span>
      </div>
      <div class="match-terrain" id="pronoTerrain${pi}" style="display:none"></div>
    </div>`;
  }).join('');
  // Bind delete
  el.querySelectorAll('.match-delete').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); deleteProno(btn.dataset.pid); };
  });
}

function togglePronoTerrain(pi) {
  const p = pronos[pi];
  if (!p) return;
  const el = document.getElementById('pronoTerrain' + pi);
  if (!el) return;
  if (el.style.display === 'none') {
    renderPronoTerrain(el, p);
    el.style.display = '';
  } else {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

function renderPronoTerrain(el, p) {
  // Construction predictions buts
  let predHtml = '<div class="prono-predictions"><h4>Pronos buts</h4>';
  p.teams.forEach((t, ti) => {
    predHtml += `<div class="pred-team" style="border-left:3px solid ${TEAM_ACCENT[ti]}"><div class="pred-team-name" style="color:${TEAM_ACCENT[ti]}">${t.nom}</div>`;
    t.joueurs.forEach(jid => {
      const j = joueurs.find(jj => jj.id === jid);
      if (!j) return;
      const pred = (t.predictions || {})[jid] || 0;
      predHtml += `<div class="pred-row"><span>${j.nom}</span><div class="pred-controls"><button onclick="changePred('${p.id}', ${ti}, '${jid}', -1)">−</button><span class="pred-val">${pred}</span><button onclick="changePred('${p.id}', ${ti}, '${jid}', 1)">+</button></div></div>`;
    });
    predHtml += '</div>';
  });
  predHtml += '</div>';

  el.innerHTML = '<div class="hist-pitch-wrap"><canvas class="hist-pitch-canvas"></canvas><div class="hist-pitch-players"></div></div>' + predHtml;
  const canvas = el.querySelector('.hist-pitch-canvas');
  const W = el.querySelector('.hist-pitch-wrap').clientWidth || 700;
  const H = W * 0.65;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#2d7a2d' : '#268c26';
    ctx.fillRect(i * (W/12), 0, W/12, H);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, W-16, H-16);
  ctx.beginPath(); ctx.moveTo(W/2, 8); ctx.lineTo(W/2, H-8); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2, H/2, H*0.18, 0, Math.PI*2); ctx.stroke();
  const bw = W*0.13, bh = H*0.55, by = (H-bh)/2;
  ctx.strokeRect(8, by, bw, bh);
  ctx.strokeRect(W-8-bw, by, bw, bh);

  const container = el.querySelector('.hist-pitch-players');
  const posLeft  = [[0.06,0.50],[0.20,0.25],[0.20,0.75],[0.35,0.35],[0.35,0.65]];
  const posRight = [[0.94,0.50],[0.80,0.25],[0.80,0.75],[0.65,0.35],[0.65,0.65]];

  p.teams.forEach((team, ti) => {
    const positions = ti === 0 ? posLeft : posRight;
    const acc = TEAM_ACCENT[ti];
    team.joueurs.slice(0, 5).forEach((jid, idx) => {
      const j = joueurs.find(jj => jj.id === jid);
      if (!j) return;
      const pos = positions[idx] || [0.5, ti === 0 ? 0.20 : 0.80];
      const col = colorFor(j.nom);
      const el2 = document.createElement('div');
      el2.className = 'pitch-player';
      el2.style.left = (pos[0] * 100) + '%';
      el2.style.top = (pos[1] * 100) + '%';
      const avatarHtml = j.photo
        ? '<div class="pp-avatar" style="background-image:url(\'' + j.photo + '\');background-size:cover;background-position:center"></div>'
        : '<div class="pp-avatar" style="background:' + col.bg + ';color:' + col.text + '">' + initials(j.nom) + '</div>';
      const predNum = ((p.teams[ti].predictions || {})[jid] || 0);
      const badge = predNum > 0 ? '<span class="pp-badge" style="background:' + acc + '">⚽ ' + predNum + '</span>' : '';
      el2.innerHTML = '<div class="pp-card' + (predNum > 0 ? ' has-goals' : '') + '" style="border-color:' + acc + '">' + badge + avatarHtml + '<div class="pp-name">' + j.nom + '</div></div>';
      container.appendChild(el2);
    });
  });
}

async function deleteProno(id) {
  if (!isAdmin && !isCoach) { toast('Pas autorise'); return; }
  if (!confirm('Supprimer ce pronostique ?')) return;
  if (sb) await sb.from('pronostiques').delete().eq('id', id);
  pronos = pronos.filter(p => p.id !== id);
  renderPronos();
  toast('Pronostique supprime');
}

// ─── MATCH DRAG&DROP ─────────────────────────────────────
const SLOT_POSITIONS_LEFT  = [[0.05,0.50],[0.18,0.22],[0.18,0.78],[0.33,0.35],[0.33,0.65]];
const SLOT_POSITIONS_RIGHT = [[0.95,0.50],[0.82,0.22],[0.82,0.78],[0.67,0.35],[0.67,0.65]];
let slots = { team0: [null,null,null,null,null], team1: [null,null,null,null,null] };

function initMatchPitch() {
  drawMatchField();
  renderSlots();
  renderBench();
}

function drawMatchField() {
  const canvas = document.getElementById('matchPitchCanvas');
  if (!canvas) return;
  const W = canvas.parentElement.clientWidth || 900;
  const H = W * 0.65;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#2d7a2d' : '#268c26';
    ctx.fillRect(i * (W/14), 0, W/14, H);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(8, 8, W-16, H-16);
  ctx.beginPath(); ctx.moveTo(W/2, 8); ctx.lineTo(W/2, H-8); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2, H/2, H*0.18, 0, Math.PI*2); ctx.stroke();
  const bw = W*0.13, bh = H*0.55, by = (H-bh)/2;
  ctx.strokeRect(8, by, bw, bh);
  ctx.strokeRect(W-8-bw, by, bw, bh);
}

function renderSlots() {
  const container = document.getElementById('matchPitchSlots');
  if (!container) return;
  container.innerHTML = '';
  [0, 1].forEach(ti => {
    const teamKey = 'team' + ti;
    const positions = ti === 0 ? SLOT_POSITIONS_LEFT : SLOT_POSITIONS_RIGHT;
    const acc = TEAM_ACCENT[ti];
    slots[teamKey].forEach((playerId, idx) => {
      const pos = positions[idx];
      const slot = document.createElement('div');
      slot.className = 'match-slot' + (playerId ? ' filled' : '');
      slot.style.left = (pos[0] * 100) + '%';
      slot.style.top = (pos[1] * 100) + '%';
      slot.dataset.team = ti;
      slot.dataset.idx = idx;

      if (playerId) {
        const j = joueurs.find(jj => jj.id === playerId);
        if (j) {
          const col = colorFor(j.nom);
          const avatar = j.photo ? `<div class="pp-avatar" style="background-image:url('${j.photo}');background-size:cover;background-position:center;border-color:${acc}"></div>` : `<div class="pp-avatar" style="background:${col.bg};color:${col.text};border-color:${acc}">${initials(j.nom)}</div>`;
          slot.innerHTML = `<div class="slot-card" draggable="true" data-pid="${j.id}" data-from-team="${ti}" data-from-idx="${idx}" style="border-color:${acc}">${avatar}<div class="pp-name">${j.nom}</div></div>`;
        }
      } else {
        slot.innerHTML = `<div class="slot-empty" style="border-color:${acc}">+</div>`;
      }

      // Drop handlers
      slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drop-over'); });
      slot.addEventListener('dragleave', () => slot.classList.remove('drop-over'));
      slot.addEventListener('drop', e => {
        e.preventDefault();
        slot.classList.remove('drop-over');
        handleDrop(ti, idx);
      });
      container.appendChild(slot);
    });
  });
  // Drag start sur slot cards
  container.querySelectorAll('.slot-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragData = { pid: card.dataset.pid, fromTeam: parseInt(card.dataset.fromTeam), fromIdx: parseInt(card.dataset.fromIdx) };
    });
  });
}

let dragData = null;

function renderBench() {
  const bench = document.getElementById('bench');
  if (!bench) return;
  // Joueurs deja sur terrain
  const onPitch = new Set();
  slots.team0.forEach(id => id && onPitch.add(id));
  slots.team1.forEach(id => id && onPitch.add(id));

  const available = joueurs.filter(j => !onPitch.has(j.id));
  if (!available.length) {
    bench.innerHTML = '<div class="empty-state" style="padding:1rem">Tous les joueurs sont sur le terrain</div>';
    return;
  }
  bench.innerHTML = available.map(j => {
    const col = colorFor(j.nom);
    const avatar = j.photo ? `<div class="pp-avatar" style="background-image:url('${j.photo}');background-size:cover;background-position:center"></div>` : `<div class="pp-avatar" style="background:${col.bg};color:${col.text}">${initials(j.nom)}</div>`;
    return `<div class="bench-card" draggable="true" data-pid="${j.id}">${avatar}<div class="pp-name">${j.nom}</div></div>`;
  }).join('');
  bench.querySelectorAll('.bench-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragData = { pid: card.dataset.pid, fromTeam: null, fromIdx: null };
    });
  });
}

function handleDrop(toTeam, toIdx) {
  if (!dragData) return;
  const teamKey = 'team' + toTeam;
  const existingId = slots[teamKey][toIdx];

  // Si vient du banc
  if (dragData.fromTeam === null) {
    slots[teamKey][toIdx] = dragData.pid;
    // Si il y avait deja qq un, on le remet au banc (juste en l enlevant)
    // (il reapparaitra automatiquement via renderBench)
  } else {
    // Swap entre 2 slots
    const fromKey = 'team' + dragData.fromTeam;
    slots[fromKey][dragData.fromIdx] = existingId; // peut etre null
    slots[teamKey][toIdx] = dragData.pid;
  }
  dragData = null;
  renderSlots();
  renderBench();
}

function clearTeams() {
  slots = { team0: [null,null,null,null,null], team1: [null,null,null,null,null] };
  renderSlots();
  renderBench();
}

function randomFillTeams() {
  clearTeams();
  const pool = shuffle(joueurs.slice());
  pool.slice(0, 5).forEach((p, i) => slots.team0[i] = p.id);
  pool.slice(5, 10).forEach((p, i) => slots.team1[i] = p.id);
  renderSlots();
  renderBench();
}

async function savePronoFromTeams() {
  const team0Players = slots.team0.filter(id => id);
  const team1Players = slots.team1.filter(id => id);
  if (!team0Players.length || !team1Players.length) { toast('Place des joueurs dans les deux équipes !'); return; }
  const nom = prompt('Nom du match (ex: Samedi 21/06)', new Date().toLocaleDateString('fr-FR'));
  if (nom === null) return;
  const prono = {
    id: uid(),
    nom: nom.trim() || null,
    date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    teams: [
      { nom: TEAM_NAMES[0], joueurs: team0Players, predictions: {} },
      { nom: TEAM_NAMES[1], joueurs: team1Players, predictions: {} },
    ],
    format: '2',
  };
  if (sb) await sb.from('pronostiques').upsert({ id: prono.id, nom: prono.nom, date: prono.date, teams: prono.teams, format: prono.format });
  pronos.unshift(prono);
  renderPronos();
  toast('Pronostique enregistré ✓');
  document.getElementById('pronos').scrollIntoView({ behavior: 'smooth' });
}

// Init au chargement
setTimeout(() => { if (document.getElementById('matchPitchCanvas')) initMatchPitch(); }, 100);
window.addEventListener('resize', () => { if (document.getElementById('matchPitchCanvas')) drawMatchField(); });

async function renameMatch(id) {
  const m = historique.find(mm => mm.id === id);
  if (!m) return;
  const newNom = prompt('Nom du match (ex: 13/06 vs Antoine)', m.nom || m.date);
  if (newNom === null || !newNom.trim()) return;
  m.nom = newNom.trim();
  save('bamfc_historique', historique);
  if (sb) await sb.from('historique').update({ nom: m.nom }).eq('id', id);
  renderHistorique();
  toast('Match renomme');
}

async function changePred(pronoId, teamIdx, joueurId, delta) {
  const myId = getMyPlayerId();
  if (!isAdmin && myId !== joueurId) {
    toast('Tu ne peux pronostiquer que tes propres buts');
    return;
  }
  const p = pronos.find(pp => pp.id === pronoId);
  if (!p) return;
  if (!p.teams[teamIdx].predictions) p.teams[teamIdx].predictions = {};
  const cur = p.teams[teamIdx].predictions[joueurId] || 0;
  p.teams[teamIdx].predictions[joueurId] = Math.max(0, cur + delta);
  if (sb) await sb.from('pronostiques').update({ teams: p.teams }).eq('id', pronoId);
  // Rerender just the value
  const allTerrain = document.querySelectorAll('.match-terrain');
  allTerrain.forEach(t => {
    if (t.innerHTML.includes(pronoId) || true) {
      const idx = pronos.findIndex(pp => pp.id === pronoId);
      const target = document.getElementById('pronoTerrain' + idx);
      if (target && target.style.display !== 'none') renderPronoTerrain(target, p);
    }
  });
}

async function deleteMatch(id) {
  if (!confirm('Supprimer ce match de l historique ?')) return;
  historique = historique.filter(m => m.id !== id);
  save('bamfc_historique', historique);
  if (sb) await sb.from('historique').delete().eq('id', id);
  renderHistorique();
  renderStats();
  updateHero();
  toast('Match supprime');
}

function openPhotoModal(playerId) {
  const j = joueurs.find(j => j.id === playerId);
  if (!j) return;
  const myId = getMyPlayerId();
  if (!isAdmin && myId !== playerId) {
    toast('Seul ' + j.nom + ' peut changer sa photo');
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 200;
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const ratio = Math.min(img.width, img.height);
        const sx = (img.width - ratio) / 2;
        const sy = (img.height - ratio) / 2;
        ctx.drawImage(img, sx, sy, ratio, ratio, 0, 0, size, size);
        j.photo = canvas.toDataURL('image/jpeg', 0.85);
        save('bamfc_joueurs', joueurs);
        pushJoueur(j);
        renderJoueurs();
        toast('Photo ajoutee');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function openPlayerProfile(playerId) {
  const j = joueurs.find(jj => jj.id === playerId);
  if (!j) return;
  const stats = getPlayerStats(playerId);

  // Recuperer tous les buts du joueur avec liens videos
  const goalsWithVids = [];
  historique.forEach(m => {
    const nbButs = (m.buts || {})[playerId] || 0;
    if (nbButs === 0) return;
    // Cherche videos pour ce joueur dans ce match
    const myVids = (m.videos || []).filter(v => findJoueurByName(v.playerName)?.id === playerId);
    if (myVids.length) {
      myVids.forEach(v => goalsWithVids.push({ matchNom: m.nom || m.date, time: v.time, url: v.url }));
    } else {
      // Pas de video pour ce match
      for (let i = 0; i < nbButs; i++) {
        goalsWithVids.push({ matchNom: m.nom || m.date, time: null, url: null });
      }
    }
  });

  const col = colorFor(j.nom);
  const avatar = j.photo
    ? `<div class="profile-avatar" style="background-image:url('${j.photo}');background-size:cover;background-position:center"></div>`
    : `<div class="profile-avatar" style="background:${col.bg};color:${col.text}">${initials(j.nom)}</div>`;

  let html = `<div class="profile-header">${avatar}<div><h3>${j.nom}</h3>`;
  if (j.aliases && j.aliases.length) html += `<p class="profile-aliases">alias: ${j.aliases.join(', ')}</p>`;
  if (j.poste) html += `<p class="profile-poste">${j.poste}</p>`;
  html += `</div></div>`;

  html += `<div class="profile-stats">
    <div><span class="ps-num">${stats.matchs}</span><span class="ps-label">matchs</span></div>
    <div><span class="ps-num">${stats.victoires}</span><span class="ps-label">victoires</span></div>
    <div><span class="ps-num">${stats.buts}</span><span class="ps-label">buts</span></div>
    <div><span class="ps-num">${stats.winPct}%</span><span class="ps-label">win</span></div>
  </div>`;

  // Bouton FUT stats (admin OU le joueur lui-meme)
  const canEditFut = isAdmin || getMyPlayerId() === j.id;
  const canEditPhoto = isAdmin || getMyPlayerId() === j.id;
  let btns = '';
  if (canEditPhoto) btns += `<button class="btn-ghost" onclick="openPhotoModal('${j.id}')">📷 Changer la photo</button>`;
  if (canEditFut) btns += `<button class="btn-ghost" onclick="openFutEditor('${j.id}')">⚽ Mes stats FUT</button>`;
  if (isAdmin) btns += `<button class="btn-ghost" onclick="manageAliases('${j.id}')">⚙ Gerer alias</button>`;
  if (isAdmin) btns += `<button class="btn-primary" onclick="mergePlayer('${j.id}')">🔀 Fusionner ici</button>`;
  if (btns) html += `<div style="margin:1rem 0;display:flex;gap:8px;flex-wrap:wrap">${btns}</div>`;

  // Carte FUT en evidence en haut du profil
  html = `<div style="display:flex;justify-content:center;margin-bottom:1.5rem">${makeFutCard(j, 'fut-card-large')}</div>` + html;

  // Liste des buts
  html += '<h4 style="margin-top:1.5rem;color:var(--text-muted);font-size:13px;text-transform:uppercase;letter-spacing:0.05em">Buts</h4>';
  if (!goalsWithVids.length) {
    html += '<div class="empty-state">Aucun but enregistre</div>';
  } else {
    html += '<div class="profile-goals-list">';
    goalsWithVids.forEach((g, i) => {
      const clickable = g.url ? `onclick="playVideo('${g.url}', '${j.nom}', ${g.time || 0})" style="cursor:pointer"` : '';
      const playIcon = g.url ? '<span style="color:var(--accent)">▶</span>' : '<span style="color:var(--text-dim);font-size:10px">pas de video</span>';
      const timeStr = g.time != null ? Math.floor(g.time/60) + "'" : '';
      html += `<div class="profile-goal" ${clickable}><span class="pg-match">${g.matchNom}</span><span class="pg-time">${timeStr}</span>${playIcon}</div>`;
    });
    html += '</div>';
  }

  document.getElementById('profileBody').innerHTML = html;
  openModal('modalProfile');
}

async function manageAliases(playerId) {
  const j = joueurs.find(jj => jj.id === playerId);
  if (!j) return;
  const current = (j.aliases || []).join(', ');
  const result = prompt(`Alias pour ${j.nom} (separes par virgule, ex: Ibra, Ib Joker)`, current);
  if (result === null) return;
  j.aliases = result.split(',').map(s => s.trim()).filter(Boolean);
  save('bamfc_joueurs', joueurs);
  await pushJoueur(j);
  toast('Alias mis a jour');
  closeModal('modalProfile');
  openPlayerProfile(playerId);
}

async function mergePlayer(targetId) {
  const target = joueurs.find(j => j.id === targetId);
  if (!target) return;

  // Liste des autres joueurs
  const others = joueurs.filter(j => j.id !== targetId);
  if (!others.length) { toast('Aucun autre joueur a fusionner'); return; }

  // Construire HTML liste de selection
  let html = '<p style="color:var(--text-muted);font-size:13px;margin-bottom:10px">Coche les joueurs qui sont en fait <b>' + target.nom + '</b>. Leurs buts, victoires et matchs seront fusionnes.</p>';
  html += '<div style="max-height:50vh;overflow-y:auto">';
  others.forEach(j => {
    const col = colorFor(j.nom);
    const avatar = j.photo ? `<div class="js-avatar" style="background-image:url('${j.photo}')"></div>` : `<div class="js-avatar" style="background:${col.bg};color:${col.text}">${initials(j.nom)}</div>`;
    html += `<label class="js-row">
      <input type="checkbox" data-mid="${j.id}" />
      ${avatar}
      <span>${j.nom}</span>
    </label>`;
  });
  html += '</div><button class="btn-primary full" style="margin-top:1rem" onclick="confirmMerge(\''+targetId+'\')">Fusionner les joueurs selectionnes</button>';

  document.getElementById('mergeBody').innerHTML = html;
  openModal('modalMerge');
}

async function confirmMerge(targetId) {
  const target = joueurs.find(j => j.id === targetId);
  if (!target) return;
  const checks = document.querySelectorAll('#modalMerge input[type=checkbox]:checked');
  const sourceIds = Array.from(checks).map(c => c.dataset.mid);
  if (!sourceIds.length) { toast('Coche au moins un joueur'); return; }
  if (!confirm('Fusionner ' + sourceIds.length + ' joueur(s) dans ' + target.nom + ' ? Cette action est definitive.')) return;

  // 1. Recuperer les noms et aliases des sources pour les ajouter aux aliases du target
  const sources = joueurs.filter(j => sourceIds.includes(j.id));
  const newAliases = [...(target.aliases || [])];
  sources.forEach(s => {
    if (!newAliases.includes(s.nom)) newAliases.push(s.nom);
    (s.aliases || []).forEach(a => { if (!newAliases.includes(a)) newAliases.push(a); });
  });
  target.aliases = newAliases;

  // 2. Dans chaque match de l'historique, remplacer les ids des sources par target.id
  historique.forEach(m => {
    // Buts: additionner
    const newButs = { ...(m.buts || {}) };
    sourceIds.forEach(sid => {
      if (newButs[sid]) {
        newButs[target.id] = (newButs[target.id] || 0) + newButs[sid];
        delete newButs[sid];
      }
    });
    m.buts = newButs;
    // Teams.joueurs: remplacer
    m.teams.forEach(t => {
      t.joueurs = t.joueurs.map(jid => sourceIds.includes(jid) ? target.id : jid);
      // Dedupliquer
      t.joueurs = [...new Set(t.joueurs)];
    });
    // Videos: garder mais les playerName pointeront toujours vers le nom source -> findJoueurByName trouvera target via alias
  });

  // 3. Pronos: meme traitement
  pronos.forEach(p => {
    p.teams.forEach(t => {
      const newPreds = { ...(t.predictions || {}) };
      sourceIds.forEach(sid => {
        if (newPreds[sid]) {
          newPreds[target.id] = (newPreds[target.id] || 0) + newPreds[sid];
          delete newPreds[sid];
        }
      });
      t.predictions = newPreds;
      t.joueurs = t.joueurs.map(jid => sourceIds.includes(jid) ? target.id : jid);
      t.joueurs = [...new Set(t.joueurs)];
    });
  });

  // 4. Supprimer les joueurs sources
  joueurs = joueurs.filter(j => !sourceIds.includes(j.id));

  // 5. Sauvegarder
  save('bamfc_joueurs', joueurs);
  save('bamfc_historique', historique);

  // Push tout vers le cloud
  await pushJoueur(target);
  for (const sid of sourceIds) {
    if (sb) await sb.from('joueurs').delete().eq('id', sid);
  }
  for (const m of historique) {
    await pushMatch(m);
  }
  for (const p of pronos) {
    if (sb) await sb.from('pronostiques').update({ teams: p.teams }).eq('id', p.id);
  }

  closeModal('modalMerge');
  closeModal('modalProfile');
  renderJoueurs();
  renderHistorique();
  renderStats();
  renderPronos();
  updateHero();
  toast(sourceIds.length + ' joueur(s) fusionne(s) dans ' + target.nom);
}

// ─── POPUP CONNEXION ─────────────────────────────────────
function maybeShowLoginNudge() {
  // Pas si admin ou deja identifie
  if (isAdmin || getMyPlayerId()) return;
  // Pas si deja affiche
  if (document.querySelector('.login-nudge')) return;

  setTimeout(() => {
    if (getMyPlayerId()) return;
    const n = document.createElement('div');
    n.className = 'login-nudge';
    n.innerHTML = `
      <button class="ln-close" onclick="dismissNudge()">×</button>
      <div class="ln-art" aria-hidden="true">
        <svg viewBox="0 0 140 150" width="92" height="100" xmlns="http://www.w3.org/2000/svg">
          <!-- capuche derriere (bleu/violet) -->
          <path d="M15 88 Q10 50 30 35 Q50 22 70 22 Q90 22 110 35 Q130 50 125 88 L125 148 L15 148 Z" fill="#3d3492" stroke="#1a1a1a" stroke-width="2.5"/>
          <!-- bord capuche autour visage -->
          <path d="M35 55 Q30 32 70 28 Q110 32 105 55 Q108 70 100 78" fill="#3d3492" stroke="#1a1a1a" stroke-width="2.5"/>
          <!-- visage en forme de gourde/ovale dessine main -->
          <path d="M45 50 Q40 65 42 90 Q44 115 70 118 Q96 115 98 90 Q100 65 95 50 Q88 38 70 38 Q52 38 45 50 Z" fill="#f7e1cf" stroke="#1a1a1a" stroke-width="2.5"/>
          <!-- ombre dans capuche -->
          <path d="M42 50 Q40 55 42 60" fill="none" stroke="#2a1f6f" stroke-width="2"/>
          <path d="M98 50 Q100 55 98 60" fill="none" stroke="#2a1f6f" stroke-width="2"/>
          <!-- yeux ronds vides style cartoon -->
          <circle cx="58" cy="70" r="3.5" fill="#1a1a1a"/>
          <circle cx="82" cy="70" r="3.5" fill="#1a1a1a"/>
          <!-- nez petit trait -->
          <path d="M70 78 Q68 85 70 88" fill="none" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
          <!-- bouche triste petite -->
          <path d="M60 100 Q70 94 80 100" fill="none" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"/>
          <!-- bord visage cote -->
          <path d="M44 90 Q42 100 45 108" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>
        </svg>
      </div>
      <div class="ln-text">
        <div class="ln-name">Lil Baby</div>
        <h4>Frérot, connecte-toi avant que je m'énerve</h4>
        <button class="btn-primary" onclick="openIdentityModal()">Qui es-tu ?</button>
      </div>
    `;
    document.body.appendChild(n);
    setTimeout(() => n.classList.add('show'), 100);
  }, 3000);
}

function dismissNudge() {
  // Reduit le popup au lieu de le fermer
  const n = document.querySelector('.login-nudge');
  if (n) n.classList.toggle('minimized');
}

// Cache automatiquement le popup quand le joueur se connecte
function hideNudgeOnLogin() {
  const n = document.querySelector('.login-nudge');
  if (n) { n.classList.remove('show'); setTimeout(() => n.remove(), 300); }
}

// Appel apres sync
