require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'نجاحي Backend', version: '1.0.0' });
});

app.use('/api/exam',   require('../src/routes/examRoutes'));
app.use('/api/scrape', require('../src/routes/scrapeRoutes'));

app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});

module.exports = app;
