require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'نجاحي Backend', version: '1.0.0' });
});

app.use('/api/exam',   require('./routes/examRoutes'));
app.use('/api/scrape', require('./routes/scrapeRoutes'));

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: 'خطأ في الخادم' });
});

app.listen(PORT, () => console.log(`✅ نجاحي يعمل على المنفذ ${PORT}`));
module.exports = app;
