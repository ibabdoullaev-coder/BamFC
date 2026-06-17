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

    const [eventsRes, playersRes] = await Promise.all([
      fetch(`https://api-front.lefive.fr/splf/v1/matches/${matchId}/matchevents`, { headers }),
      fetch(`https://api-front.lefive.fr/splf/v1/matches/${matchId}/matchplayers`, { headers })
    ]);

    if (!eventsRes.ok || !playersRes.ok) {
      return res.status(eventsRes.status).json({ error: 'API lefive erreur', status: eventsRes.status });
    }

    const events = await eventsRes.json();
    const players = await playersRes.json();

    // Simplifier les players
    const teams = {};
    players.forEach(p => {
      const teamId = p.teamPlayer?.team?.id;
      const teamName = p.teamPlayer?.team?.name;
      if (!teamId) return;
      if (!teams[teamId]) teams[teamId] = { id: teamId, name: teamName, joueurs: [] };
      teams[teamId].joueurs.push({
        id: p.teamPlayer.id,
        name: p.teamPlayer.name,
        goals: p.nbGoals || 0,
        goalsAgainst: p.nbGoalsAgainst || 0,
      });
    });

    // Simplifier les events (buts)
    const buts = events.filter(e => e.easyLiveEvent?.event_type === 'Point').map(e => ({
      id: e.id,
      playerName: e.player?.name,
      playerId: e.player?.id,
      teamId: e.player?.teamId,
      teamName: e.player?.team?.name,
      time: e.time,
      name: e.name,
      videoUrl: e.videoUrl,
    }));

    // Calcul score
    const score = {};
    Object.keys(teams).forEach(tid => score[tid] = 0);
    buts.forEach(b => { if (score[b.teamId] !== undefined) score[b.teamId]++; });

    return res.status(200).json({
      teams: Object.values(teams),
      buts,
      score,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
