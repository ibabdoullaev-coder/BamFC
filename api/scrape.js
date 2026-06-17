
const fetch = require('node-fetch');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { url } = req.query;
  if (!url || !url.includes('lefive.fr')) {
    return res.status(400).json({ error: 'URL invalide' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      }
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    // Score
    const scoreText = $('[class*="score"], [class*="Score"]').first().text().trim();

    // Buteurs
    const buts = [];
    $('[class*="goal"], [class*="Goal"], [class*="but"], [class*="But"]').each((i, el) => {
      const text = $(el).text().trim();
      const videoUrl = $(el).find('a').attr('href') || $(el).closest('a').attr('href') || null;
      if (text) buts.push({ text, videoUrl });
    });

    // Fallback: cherche les liens video directement
    const videos = [];
    $('a[href*="video"], a[href*="clip"], a[href*="goal"]').each((i, el) => {
      videos.push({ href: $(el).attr('href'), text: $(el).text().trim() });
    });

    return res.status(200).json({ scoreText, buts, videos, html: html.slice(0, 500) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
