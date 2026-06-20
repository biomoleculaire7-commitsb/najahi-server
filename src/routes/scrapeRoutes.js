const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const cheerio = require('cheerio');
const { HttpsProxyAgent } = require('https-proxy-agent');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 3600 });

function getAgent() {
  const { BRIGHTDATA_USER, BRIGHTDATA_PASS, BRIGHTDATA_HOST, BRIGHTDATA_PORT } = process.env;
  return new HttpsProxyAgent(`http://${BRIGHTDATA_USER}:${BRIGHTDATA_PASS}@${BRIGHTDATA_HOST}:${BRIGHTDATA_PORT}`);
}

async function fetchPage(url) {
  const cached = cache.get(url);
  if (cached) return cached;
  const agent = getAgent();
  const res = await axios.get(url, {
    httpsAgent: agent, httpAgent: agent, timeout: 20000,
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ar,fr;q=0.9' },
  });
  cache.set(url, res.data);
  return res.data;
}

// POST /api/scrape/search
router.post('/search', async (req, res) => {
  try {
    const { sourceId = 'dzxamen', grade, subject } = req.body;
    if (!grade || !subject)
      return res.status(400).json({ error: 'يجب توفير grade و subject' });

    const gradeMap = {
      'السنة 1': '1ap', 'السنة 2': '2ap', 'السنة 3': '3ap',
      'السنة 4': '4ap', 'السنة 5': '5ap',
      'السنة 1 م': '1am', 'السنة 2 م': '2am',
      'السنة 3 م': '3am', 'السنة 4 م': '4am',
      'السنة 1 ث': '1as', 'السنة 2 ث': '2as', 'بكالوريا': 'bac',
    };
    const subjectMap = {
      'الرياضيات': 'mathematiques', 'اللغة العربية': 'arabe',
      'الفيزياء': 'physique', 'العلوم': 'sciences',
      'اللغة الفرنسية': 'francais', 'التاريخ والجغرافيا': 'histoire-geo',
    };

    const g = gradeMap[grade]   || '4am';
    const s = subjectMap[subject] || 'mathematiques';
    const url = `https://www.dzxamen.com/${g}/${s}/`;

    const html = await fetchPage(url);
    const $    = cheerio.load(html);
    const results = [];

    $('article, .post, h2 a, h3 a').each((i, el) => {
      const title = $(el).find('h2,h3,.title').text().trim() || $(el).text().trim();
      const link  = $(el).find('a').attr('href') || $(el).attr('href');
      if (title && title.length > 5) {
        results.push({ title: title.substring(0, 100), url: link, source: 'dzxamen.com', grade, subject });
      }
      if (results.length >= 10) return false;
    });

    res.json({ success: true, count: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scrape/fetch
router.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'يجب توفير url' });

    const allowed = ['dzxamen.com', 'eddirasa.com', 'dzschool.net'];
    if (!allowed.some(d => url.includes(d)))
      return res.status(403).json({ error: 'النطاق غير مسموح' });

    const html = await fetchPage(url);
    const $    = cheerio.load(html);
    const content = $('.entry-content, .post-content, article')
      .first().text().replace(/\s+/g, ' ').trim().substring(0, 3000);
    const pdfLinks = [];
    $('a[href$=".pdf"]').each((i, el) => pdfLinks.push($(el).attr('href')));

    res.json({ success: true, content: { content, pdfLinks, url } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
