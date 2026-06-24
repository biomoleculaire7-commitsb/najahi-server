const express = require('express');
const cors    = require('cors');
const https   = require('https');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'نجاحي', version: '2.0.0' });
});

async function groqAsk(prompt) {
  return new Promise((resolve, reject) => {
    const key  = process.env.GROQ_API_KEY;
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'انت استاذ خبير في المناهج الجزائرية الرسمية. تنشئ فروضا واختبارات رسمية مطابقة تماما للمنهاج الوطني الجزائري. تكتب المواضيع بنفس اسلوب وزارة التربية الوطنية الجزائرية. تستخدم مصطلحات المناهج الجزائرية الرسمية فقط. تجيب دائما بـ JSON صحيح فقط بدون اي نص اضافي.'
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 3000,
      temperature: 0.3
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
          const text = d.choices[0].message.content.replace(/```json|```/g, '').trim();
          resolve(JSON.parse(text));
        } catch(e) { reject(new Error('خطأ في البيانات: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// توليد فرض رسمي
app.post('/api/exam/generate', async (req, res) => {
  try {
    const { stage, grade, subject, term, difficulty } = req.body;

    const prompt = `انشئ فرضا رسميا مدرسيا جزائريا كاملا على غرار فروض وزارة التربية الوطنية:

المرحلة: ${stage}
السنة: ${grade}
المادة: ${subject}
الفصل: ${term}
المستوى: ${difficulty}

المطلوب:
- موضوع فرض رسمي كامل بنفس اسلوب الوزارة
- يحتوي على تمارين متنوعة (فهم، تطبيق، حل مسائل)
- مطابق تماما للمنهاج الجزائري الرسمي لهذا المستوى
- يتضمن التعليمات والارشادات الرسمية
- المجموع 20 نقطة موزعة بشكل رسمي

اجب بـ JSON فقط:
{
  "title": "فرض الفصل الاول في ${subject} للسنة ${grade}",
  "header": "الجمهورية الجزائرية الديمقراطية الشعبية - وزارة التربية الوطنية",
  "subject": "${subject}",
  "grade": "${grade}",
  "term": "${term}",
  "duration": "ساعة واحدة",
  "totalPoints": 20,
  "instructions": "يجب الاجابة على جميع التمارين - الورقة النظيفة والخط الواضح",
  "exercises": [
    {
      "id": 1,
      "title": "التمرين الاول",
      "points": 8,
      "content": "نص التمرين الكامل والمفصل مع جميع المعطيات",
      "parts": [
        { "num": "1", "question": "نص السؤال الاول", "points": 4 },
        { "num": "2", "question": "نص السؤال الثاني", "points": 4 }
      ],
      "solution": "الحل النموذجي الكامل للتمرين"
    }
  ]
}`;

    const data = await groqAsk(prompt);
    res.json({ success: true, exam: data });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// توليد اختبار رسمي
app.post('/api/exam/test', async (req, res) => {
  try {
    const { stage, grade, subject, examType, questionCount } = req.body;
    const isMCQ = examType === 'mcq';

    const prompt = `انشئ اختبارا رسميا جزائريا من نوع ${isMCQ ? 'اختيار متعدد' : 'مقالي'} على غرار اختبارات وزارة التربية:

المادة: ${subject}
السنة: ${grade}
عدد الاسئلة: ${questionCount || 15}

المطلوب:
- اختبار رسمي مطابق للمنهاج الجزائري
- ${isMCQ ? 'كل سؤال له 4 خيارات واضحة وخيار واحد صحيح' : 'اسئلة مقالية تقيس الفهم والتطبيق'}
- يغطي محاور المنهاج الرسمي
- المجموع 20 نقطة

اجب بـ JSON فقط:
{
  "title": "اختبار في ${subject} - ${grade}",
  "subject": "${subject}",
  "grade": "${grade}",
  "totalPoints": 20,
  "questions": [
    {
      "id": 1,
      "question": "نص السؤال الكامل",
      "points": 2,
      ${isMCQ ? '"options": ["أ) الخيار الاول", "ب) الخيار الثاني", "ج) الخيار الثالث", "د) الخيار الرابع"], "correctAnswer": 0,' : ''}
      "explanation": "الحل والشرح الكامل"
    }
  ]
}`;

    const data = await groqAsk(prompt);
    res.json({ success: true, test: data });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// تقويم تشخيصي
app.post('/api/exam/diag', async (req, res) => {
  try {
    const { grade, subject, term } = req.body;

    const prompt = `انشئ تقويما تشخيصيا لمادة ${subject} للسنة ${grade} ${term} وفق المنهاج الجزائري.

اجب بـ JSON فقط:
{
  "summary": "ملخص شامل للمستوى المطلوب في هذه المرحلة وفق المنهاج الجزائري",
  "skills": [
    { "name": "اسم المهارة من المنهاج", "pct": 75, "status": "good" },
    { "name": "مهارة اخرى", "pct": 50, "status": "avg" },
    { "name": "مهارة تحتاج تعزيز", "pct": 30, "status": "weak" }
  ],
  "recommendations": [
    "توصية مبنية على المنهاج الجزائري الرسمي",
    "توصية ثانية",
    "توصية ثالثة"
  ]
}
حيث status: good او avg او weak`;

    const data = await groqAsk(prompt);
    res.json({ success: true, diag: data });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// جلب مواضيع — يولدها بالذكاء الاصطناعي
app.post('/api/scrape/search', async (req, res) => {
  try {
    const { grade, subject } = req.body;

    const prompt = `اقترح 8 عناوين فروض واختبارات جزائرية رسمية حقيقية في مادة ${subject} للسنة ${grade}.
اجعلها بنفس اسلوب عناوين الفروض الرسمية الجزائرية كما تظهر في الوثائق التعليمية.

اجب بـ JSON فقط:
{
  "results": [
    {
      "title": "فرض الفصل الاول في ${subject} - ${grade} - 2024",
      "grade": "${grade}",
      "subject": "${subject}",
      "year": "2024",
      "type": "فرض"
    }
  ]
}`;

    const data = await groqAsk(prompt);
    res.json({ success: true, count: data.results.length, results: data.results });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = app;
