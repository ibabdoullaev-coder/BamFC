const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Token');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { matchId } = req.query;
  const token = req.headers['x-token'];

  if (!matchId || !token) {
    return res.status(400).json({ error: 'matchId et token requis' });
  }

  try {
    const headers = {
      'Authorization': token,
      'Accept': 'application/json',
      'Origin': 'https://www.lefive.fr',
      'Referer': 'https://www.lefive.fr/',
      'User-Agent': 'Mozilla/5.0'
    };

    const [eventsRes, playersRes, matchRes] = await Promise.all([
      fetch(`https://api-front.lefive.fr/splf/v1/matches/${matchId}/matchevents`, { headers }),
      fetch(`https://api-front.lefive.fr/splf/v1/matches/${matchId}/matchplayers`, { headers }),
      fetch(`https://api-front.lefive.fr/splf/v1/matches/${matchId}`, { headers })
    ]);

    if (!eventsRes.ok || !playersRes.ok) {
      return res.status(eventsRes.status).json({ error: 'API lefive erreur', status: eventsRes.status });
    }

    const events = await eventsRes.json();
    const players = await playersRes.json();
    const matchInfo = matchRes.ok ? await matchRes.json() : null;

    // Buts depuis events
    const buts = events.filter(e => e.easyLiveEvent?.event_type === 'Point').map(e => ({
      id: e.id,
      matchId: matchId,
      playerName: e.player?.name,
      playerId: e.player?.id,
      teamId: e.player?.teamId,
      teamName: e.player?.team?.name,
      time: e.time,
      name: e.name,
      videoUrl: e.videoUrl,
    }));

    // Construire equipes a partir des events + matchplayers (en filtrant les bidons)
    const teams = {};
    buts.forEach(b => {
      if (!b.teamId) return;
      if (!teams[b.teamId]) teams[b.teamId] = { id: b.teamId, name: b.teamName, joueurs: [], _ids: new Set() };
      if (b.playerId && !teams[b.teamId]._ids.has(b.playerId)) {
        teams[b.teamId]._ids.add(b.playerId);
        teams[b.teamId].joueurs.push({ id: b.playerId, name: b.playerName, goals: 0, goalsAgainst: 0 });
      }
    });

    // Ajouter les autres joueurs depuis matchplayers (qui n ont pas marque), en filtrant les bidons
    players.forEach(p => {
      const tp = p.teamPlayer; if (!tp) return;
      const teamId = tp.team?.id;
      const teamName = tp.team?.name;
      const name = tp.name || '';
      // Filtrer les bidons "Joueur EQUIPE1" / "Joueur EQUIPE2"
      if (/Joueur\s+(ÉQUIPE|EQUIPE)/i.test(name)) return;
      if (!teamId) return;
      if (!teams[teamId]) teams[teamId] = { id: teamId, name: teamName, joueurs: [], _ids: new Set() };
      if (!teams[teamId]._ids.has(tp.id)) {
        teams[teamId]._ids.add(tp.id);
        teams[teamId].joueurs.push({ id: tp.id, name, goals: p.nbGoals || 0, goalsAgainst: p.nbGoalsAgainst || 0 });
      }
    });

    // Nettoyer le _ids
    Object.values(teams).forEach(t => delete t._ids);

    // Score: utiliser le score officiel du match si disponible (peut differer du nombre de buts)
    const score = {};
    Object.keys(teams).forEach(tid => score[tid] = 0);
    buts.forEach(b => { if (b.teamId !== undefined) score[b.teamId] = (score[b.teamId] || 0) + 1; });

    // Override avec score officiel si dispo
    if (matchInfo) {
      const firstTeamId = matchInfo.firstTeam?.id;
      const secondTeamId = matchInfo.secondTeam?.id;
      if (firstTeamId && matchInfo.firstTeamScore !== undefined) score[firstTeamId] = matchInfo.firstTeamScore;
      if (secondTeamId && matchInfo.secondTeamScore !== undefined) score[secondTeamId] = matchInfo.secondTeamScore;
    }

    return res.status(200).json({
      teams: Object.values(teams),
      buts,
      score,
      matchDate: matchInfo?.startingDate || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
