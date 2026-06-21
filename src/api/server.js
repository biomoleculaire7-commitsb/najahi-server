
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const claude = axios.create({
  baseURL: 'https://api.anthropic.com/v1/messages',
  headers: {
    'x-api-key':         process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type':      'application/json',
  },
  timeout: 30000,
});

async function ask(prompt) {
  const r = await claude.post('', {
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });
  return r.data.content[0].text.replace(/```json|```/g, '').trim();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'نجاحي Backend', version: '1.0.0' });
});

app.post('/api/exam/generate', async (req, res) => {
  try {
    const { stage, grade, subject, term, difficulty } = req.body;
    const text = await ask(`أنت أستاذ خبير في المناهج الجزائرية. أنشئ فرضاً مدرسياً كاملاً:
المرحلة: ${stage} | السنة: ${grade} | المادة: ${subject} | الفصل: ${term} | الصعوبة: ${difficulty}
أجب بـ JSON فقط بدون أي نص إضافي:
{"title":"...","subject":"${subject}","grade":"${grade}","term":"${term}","duration":"45 دقيقة","totalPoints":20,"questions":[{"id":1,"question":"...","points":5,"hint":"..."}]}`);
    res.json({ success: true, exam: JSON.parse(text) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/exam/test', async (req, res) => {
  try {
    const { stage, grade, subject, examType, questionCount, duration } = req.body;
    const isMCQ = examType === 'mcq';
    const text = await ask(`أنت أستاذ خبير في المناهج الجزائرية. أنشئ اختباراً:
النوع: ${isMCQ?'اختيار متعدد':'مقالي'} | المادة: ${subject} | السنة: ${grade} | عدد الأسئلة: ${questionCount}
أجب بـ JSON فقط:
{"title":"اختبار ${subject}","subject":"${subject}","grade":"${grade}","totalPoints":20,"questions":[{"id":1,"question":"...","points":2,${isMCQ?'"options":["أ) ...","ب) ...","ج) ...","د) ..."],"correctAnswer":0,':''}"explanation":"..."}]}`);
    res.json({ success: true, test: JSON.parse(text) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/exam/solve', async (req, res) => {
  try {
    const { exam } = req.body;
    const qs = exam.questions.map((q,i)=>`س${i+1}(${q.points}ن): ${q.question}`).join('\n');
    const text = await ask(`حل هذا الفرض:\n${exam.subject} — ${exam.grade}\n${qs}\nأجب بـ JSON فقط:
{"solutions":[{"questionId":1,"answer":"...","points":5,"note":"..."}],"totalScore":20}`);
    res.json({ success: true, solution: JSON.parse(text) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/scrape/search', async (req, res) => {
  try {
    const { grade, subject } = req.body;
    const text = await ask(`اقترح 6 عناوين فروض ومواضيع دراسية جزائرية في مادة ${subject} للسنة ${grade}.
أجب بـ JSON فقط:
{"results":[{"title":"...","grade":"${grade}","subject":"${subject}","url":"#"}]}`);
    const data = JSON.parse(text);
    res.json({ success: true, count: data.results.length, results: data.results });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = app;
