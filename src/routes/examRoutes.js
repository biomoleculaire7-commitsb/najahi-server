const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const claudeClient = axios.create({
  baseURL: 'https://api.anthropic.com/v1/messages',
  headers: {
    'x-api-key':         process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type':      'application/json',
  },
  timeout: 30000,
});

// POST /api/exam/generate
router.post('/generate', async (req, res) => {
  try {
    const { stage, grade, subject, term, difficulty } = req.body;
    if (!stage || !grade || !subject)
      return res.status(400).json({ error: 'يجب توفير: stage, grade, subject' });

    const prompt = `أنت أستاذ خبير في المناهج الجزائرية.
أنشئ فرضاً مدرسياً كاملاً:
- المرحلة: ${stage} - السنة: ${grade}
- المادة: ${subject} - الفصل: ${term}
- الصعوبة: ${difficulty}
أجب بـ JSON فقط:
{"title":"...","subject":"${subject}","grade":"${grade}","term":"${term}","duration":"45 دقيقة","totalPoints":20,"questions":[{"id":1,"question":"...","points":5,"hint":"..."}]}`;

    const r = await claudeClient.post('', {
      model: 'claude-sonnet-4-6', max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = r.data.content[0].text.replace(/```json|```/g, '').trim();
    res.json({ success: true, exam: JSON.parse(text) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/exam/solve
router.post('/solve', async (req, res) => {
  try {
    const { exam } = req.body;
    if (!exam) return res.status(400).json({ error: 'يجب توفير exam' });

    const questions = exam.questions
      .map((q, i) => `السؤال ${i+1} (${q.points}ن): ${q.question}`).join('\n');

    const prompt = `حل هذا الفرض الجزائري:\nالمادة: ${exam.subject} — ${exam.grade}\n${questions}\nأجب بـ JSON فقط:
{"solutions":[{"questionId":1,"answer":"...","points":5,"note":"..."}],"totalScore":20,"teacherNote":"..."}`;

    const r = await claudeClient.post('', {
      model: 'claude-sonnet-4-6', max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = r.data.content[0].text.replace(/```json|```/g, '').trim();
    res.json({ success: true, solution: JSON.parse(text) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
