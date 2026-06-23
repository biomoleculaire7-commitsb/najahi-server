
const express = require('express');
const cors    = require('cors');
const https   = require('https');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'نجاحي', version: '1.0.0' });
});

async function geminiAsk(prompt) {
  return new Promise((resolve, reject) => {
    const key  = process.env.GROQ_API_KEY;
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      temperature: 0.7
    });
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (r) => {
      let data = '';
      r.on('data', chunk => data += chunk);
      r.on('end', () => {
        try {
          const d = JSON.parse(data);
          if (d.error) { reject(new Error(d.error.message)); return; }
          const text = d.choices[0].message.content
            .replace(/```json|```/g, '').trim();
          resolve(JSON.parse(text));
        } catch(e) { reject(new Error('خطأ في البيانات: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

app.post('/api/exam/generate', async (req, res) => {
  try {
    const { stage, grade, subject, term, difficulty } = req.body;
    const data = await geminiAsk(
      'انت استاذ خبير في المناهج الجزائرية. انشئ فرضا مدرسيا كاملا:\nالمرحلة: '+stage+' | السنة: '+grade+' | المادة: '+subject+' | الفصل: '+term+' | الصعوبة: '+difficulty+'\nالقواعد: 3 الى 5 اسئلة متنوعة، المجموع 20 نقطة، اتبع المنهاج الجزائري الرسمي.\nاجب بـ JSON فقط بدون اي نص قبله او بعده:\n{"title":"عنوان الفرض","subject":"'+subject+'","grade":"'+grade+'","term":"'+term+'","duration":"45 دقيقة","totalPoints":20,"questions":[{"id":1,"question":"نص السؤال الكامل","points":5,"hint":"الاجابة النموذجية"}]}'
    );
    res.json({ success: true, exam: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/exam/test', async (req, res) => {
  try {
    const { stage, grade, subject, examType, questionCount } = req.body;
    const isMCQ = examType === 'mcq';
    const data = await geminiAsk(
      'انت استاذ خبير في المناهج الجزائرية. انشئ اختبارا من نوع '+(isMCQ?'اختيار متعدد MCQ':'اجابة مفتوحة مقالي')+':\nالمادة: '+subject+' | السنة: '+grade+' | عدد الاسئلة: '+(questionCount||15)+'\naجب بـ JSON فقط:\n{"title":"اختبار '+subject+'","subject":"'+subject+'","grade":"'+grade+'","totalPoints":20,"questions":[{"id":1,"question":"...","points":2,'+(isMCQ?'"options":["أ) ...","ب) ...","ج) ...","د) ..."],"correctAnswer":0,':'')+'"explanation":"الاجابة الصحيحة"}]}'
    );
    res.json({ success: true, test: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/exam/diag', async (req, res) => {
  try {
    const { grade, subject, term } = req.body;
    const data = await geminiAsk(
      'انت استاذ خبير. انشئ تقويما تشخيصيا لمادة '+subject+' للسنة '+grade+' '+term+'.\naجب بـ JSON فقط:\n{"summary":"ملخص المستوى العام","skills":[{"name":"اسم المهارة","pct":75,"status":"good"}],"recommendations":["توصية 1","توصية 2","توصية 3"]}'
    );
    res.json({ success: true, diag: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/scrape/search', async (req, res) => {
  try {
    const { grade, subject } = req.body;
    const data = await geminiAsk(
      'اقترح 8 عناوين فروض جزائرية حقيقية في مادة '+subject+' للسنة '+grade+'.\naجب بـ JSON فقط:\n{"results":[{"title":"عنوان الموضوع","grade":"'+grade+'","subject":"'+subject+'","year":"2024"}]}'
    );
    res.json({ success: true, count: data.results.length, results: data.results });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;
