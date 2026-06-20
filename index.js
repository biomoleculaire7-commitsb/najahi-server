require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'نجاحي Backend', version: '1.0.0' });
});

app.use('/api/exam',   require('./routes/examRoutes'));
app.use('/api/scrape', require('./routes/scrapeRoutes'));

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
