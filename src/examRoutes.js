const express = require('express');
const router  = express.Router();
const axios   = require('axios');

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

router.post('/generate', async (req, res) => {
  try {
    const { stage, grade, subject, term, difficulty } = req.body;
    if (!subject) return res.status(400).json({ error: 'يجب توفير subject' });

    const text = await ask(`أنت أستاذ خبير في المناهج الجزائرية.
أنشئ فرضاً مدرسياً كاملاً:
المرحلة: ${stage} | السنة: ${grade} | المادة: ${subject} | الفصل: ${term} | الصعوبة: ${difficulty}
أجب بـ JSON فقط:
{"title":"...","subject":"${subject}","grade":"${grade}","term":"${term}","duration":"45 دقيقة","totalPoints":20,"questions":[{"id":1,"question":"...","points":5,"hint":"..."}]}`);

    res.json({ success: true, exam: JSON.parse(text) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/test', async (req, res) => {
  try {
    const { stage, grade, subject, examType, questionCount, duration } = req.body;
    if (!subject) return res.status(400).json({ error: 'يجب توفير subject' });

    const isMCQ = examType === 'mcq';
    const text = await ask(`أنت أستاذ خبير في المناهج الجزائرية.
أنشئ اختباراً من نوع ${isMCQ ? 'اختيار متعدد MCQ' : 'إجابة مفتوحة'}:
المرحلة: ${stage} | السنة: ${grade} | المادة: ${subject} | عدد الأسئلة: ${questionCount} | المدة: ${duration} دقيقة
أجب بـ JSON فقط:
{"title":"اختبار ${subject}","subject":"${subject}","grade":"${grade}","duration":${duration},"totalPoints":20,"questions":[{"id":1,"question":"...","points":2,${isMCQ ? '"options":["أ) ...","ب) ...","ج) ...","د) ..."],"correctAnswer":0,' : '"expectedLength":"3 جمل",'}"explanation":"..."}]}`);

    res.json({ success: true, test: JSON.parse(text) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/solve', async (req, res) => {
  try {
    const { exam } = req.body;
    if (!exam) return res.status(400).json({ error: 'يجب توفير exam' });

    const qs = exam.questions.map((q,i) => `س${i+1}(${q.points}ن): ${q.question}`).join('\n');
    const text = await ask(`حل هذا الفرض الجزائري:\n${exam.subject} — ${exam.grade}\n${qs}\nأجب بـ JSON فقط:
{"solutions":[{"questionId":1,"answer":"...","points":5,"note":"..."}],"totalScore":20,"teacherNote":"..."}`);

    res.json({ success: true, solution: JSON.parse(text) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
