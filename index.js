const express = require('express');
const cors    = require('cors');
const https   = require('https');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'نجاحي', version: '3.0.0' });
});

// لغة كل مادة
const SUBJECT_LANG = {
  'اللغة العربية':       'ar',
  'الرياضيات':           'ar',
  'العلوم':              'ar',
  'العلوم الطبيعية':     'ar',
  'التاريخ والجغرافيا':  'ar',
  'التربية الإسلامية':   'ar',
  'التربية المدنية':     'ar',
  'الفيزياء':            'ar',
  'الكيمياء':            'ar',
  'الفلسفة':             'ar',
  'اللغة الفرنسية':      'fr',
  'اللغة الإنجليزية':    'en',
};

function getLang(subject) {
  return SUBJECT_LANG[subject] || 'ar';
}

function getLangInstruction(subject) {
  const lang = getLang(subject);
  if (lang === 'fr') return 'IMPORTANT: Tu dois rediger ce devoir ENTIEREMENT EN FRANCAIS. Toutes les consignes, exercices, textes et questions doivent etre en francais. Ne jamais ecrire en arabe dans le contenu du devoir.';
  if (lang === 'en') return 'IMPORTANT: You must write this exam ENTIRELY IN ENGLISH. All instructions, exercises, texts and questions must be in English. Never write in Arabic in the exam content.';
  return 'اكتب الموضوع كاملا باللغة العربية الفصحى.';
}

async function groqAsk(prompt) {
  return new Promise((resolve, reject) => {
    const key  = process.env.GROQ_API_KEY;
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are an expert teacher in the Algerian national curriculum. You create official exams matching exactly the Algerian Ministry of Education format. You ALWAYS respond with valid JSON only, no extra text.'
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
        } catch(e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── توليد فرض ─────────────────────────────────────
app.post('/api/exam/generate', async (req, res) => {
  try {
    const { stage, grade, subject, term, difficulty } = req.body;
    const langInstr = getLangInstruction(subject);
    const lang = getLang(subject);

    const prompt = lang === 'fr'
      ? `${langInstr}

Cree un devoir officiel algerien complet pour:
- Niveau: ${grade} (${stage})
- Matiere: ${subject}
- Trimestre: ${term}
- Difficulte: ${difficulty}

Le devoir doit suivre exactement le programme officiel algerien du MEN.
Inclure des exercices varies (comprehension, grammaire/vocabulaire, production ecrite ou expression).
Total: 20 points.

Reponds en JSON uniquement:
{
  "title": "Devoir du ${term} de ${subject} - ${grade}",
  "header": "Republique Algerienne Democratique et Populaire - Ministere de l'Education Nationale",
  "subject": "${subject}",
  "grade": "${grade}",
  "term": "${term}",
  "duration": "1 heure",
  "totalPoints": 20,
  "instructions": "Repondre a toutes les questions - Soigner l'ecriture",
  "exercises": [
    {
      "id": 1,
      "title": "Exercice 1",
      "points": 10,
      "content": "Texte ou enonce complet de l'exercice",
      "parts": [
        { "num": "1", "question": "Question complete", "points": 5 }
      ],
      "solution": "Corrige detaille"
    }
  ]
}`
      : lang === 'en'
      ? `${langInstr}

Create a complete official Algerian exam for:
- Level: ${grade} (${stage})
- Subject: ${subject}
- Term: ${term}
- Difficulty: ${difficulty}

Must follow the official Algerian MEN curriculum exactly.
Include varied exercises (reading, grammar/vocabulary, writing).
Total: 20 points.

Respond in JSON only:
{
  "title": "${term} Exam in ${subject} - ${grade}",
  "header": "People's Democratic Republic of Algeria - Ministry of National Education",
  "subject": "${subject}",
  "grade": "${grade}",
  "term": "${term}",
  "duration": "1 hour",
  "totalPoints": 20,
  "instructions": "Answer all questions - Write clearly",
  "exercises": [
    {
      "id": 1,
      "title": "Exercise 1",
      "points": 10,
      "content": "Complete exercise text",
      "parts": [
        { "num": "1", "question": "Complete question", "points": 5 }
      ],
      "solution": "Detailed solution"
    }
  ]
}`
      : `${langInstr}

انشئ فرضا رسميا جزائريا كاملا على غرار فروض وزارة التربية الوطنية:
المرحلة: ${stage} | السنة: ${grade} | المادة: ${subject} | الفصل: ${term} | المستوى: ${difficulty}

الموضوع يجب ان:
- يكون مطابقا تماما للمنهاج الجزائري الرسمي لهذا المستوى
- يحتوي على تمارين متنوعة (فهم، تطبيق، حل مسائل)
- يتضمن التعليمات والارشادات الرسمية
- المجموع 20 نقطة موزعة بشكل رسمي

اجب بـ JSON فقط:
{
  "title": "فرض ${term} في ${subject} - ${grade}",
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
        { "num": "1", "question": "نص السؤال الاول الكامل", "points": 4 },
        { "num": "2", "question": "نص السؤال الثاني الكامل", "points": 4 }
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

// ── توليد اختبار ──────────────────────────────────
app.post('/api/exam/test', async (req, res) => {
  try {
    const { stage, grade, subject, examType, questionCount } = req.body;
    const isMCQ = examType === 'mcq';
    const lang  = getLang(subject);
    const langInstr = getLangInstruction(subject);

    const prompt = lang === 'fr'
      ? `${langInstr}
Cree un test officiel algerien de type ${isMCQ ? 'QCM (choix multiple)' : 'questions ouvertes'} pour:
Matiere: ${subject} | Niveau: ${grade} | Nombre de questions: ${questionCount || 15}
Suit exactement le programme officiel algerien.
Reponds en JSON uniquement:
{
  "title": "Test de ${subject} - ${grade}",
  "subject": "${subject}",
  "grade": "${grade}",
  "totalPoints": 20,
  "questions": [{"id":1,"question":"Question complete","points":2,${isMCQ ? '"options":["A) ...","B) ...","C) ...","D) ..."],"correctAnswer":0,' : ''}"explanation":"Corrige detaille"}]
}`
      : lang === 'en'
      ? `${langInstr}
Create an official Algerian test of type ${isMCQ ? 'MCQ' : 'open questions'} for:
Subject: ${subject} | Level: ${grade} | Questions: ${questionCount || 15}
Follow the official Algerian curriculum exactly.
Respond in JSON only:
{
  "title": "${subject} Test - ${grade}",
  "subject": "${subject}",
  "grade": "${grade}",
  "totalPoints": 20,
  "questions": [{"id":1,"question":"Complete question","points":2,${isMCQ ? '"options":["A) ...","B) ...","C) ...","D) ..."],"correctAnswer":0,' : ''}"explanation":"Detailed answer"}]
}`
      : `${langInstr}
انشئ اختبارا رسميا جزائريا من نوع ${isMCQ ? 'اختيار متعدد' : 'مقالي'} مطابقا للمنهاج الوطني:
المادة: ${subject} | السنة: ${grade} | عدد الاسئلة: ${questionCount || 15}
يغطي محاور المنهاج الرسمي - المجموع 20 نقطة
اجب بـ JSON فقط:
{
  "title": "اختبار في ${subject} - ${grade}",
  "subject": "${subject}",
  "grade": "${grade}",
  "totalPoints": 20,
  "questions": [{"id":1,"question":"نص السؤال الكامل","points":2,${isMCQ ? '"options":["أ) ...","ب) ...","ج) ...","د) ..."],"correctAnswer":0,' : ''}"explanation":"الحل الكامل"}]
}`;

    const data = await groqAsk(prompt);
    res.json({ success: true, test: data });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── تقويم تشخيصي ──────────────────────────────────
app.post('/api/exam/diag', async (req, res) => {
  try {
    const { grade, subject, term } = req.body;
    const lang = getLang(subject);
    const langInstr = getLangInstruction(subject);

    const prompt = lang === 'fr'
      ? `${langInstr}
Cree une evaluation diagnostique pour ${subject} - ${grade} - ${term} selon le programme algerien officiel.
Reponds en JSON uniquement:
{
  "summary": "Resume du niveau requis selon le programme algerien",
  "skills": [
    {"name":"Competence 1 du programme","pct":75,"status":"good"},
    {"name":"Competence 2","pct":50,"status":"avg"},
    {"name":"Competence 3","pct":30,"status":"weak"}
  ],
  "recommendations": ["Recommandation 1","Recommandation 2","Recommandation 3"]
}`
      : `${langInstr}
انشئ تقويما تشخيصيا لمادة ${subject} - ${grade} - ${term} وفق المنهاج الجزائري الرسمي.
اجب بـ JSON فقط:
{
  "summary": "ملخص مستوى المنهاج الجزائري الرسمي لهذه المرحلة",
  "skills": [
    {"name":"مهارة من المنهاج","pct":75,"status":"good"},
    {"name":"مهارة ثانية","pct":50,"status":"avg"},
    {"name":"مهارة تحتاج تعزيز","pct":30,"status":"weak"}
  ],
  "recommendations": ["توصية 1 وفق المنهاج","توصية 2","توصية 3"]
}`;

    const data = await groqAsk(prompt);
    res.json({ success: true, diag: data });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── جلب مواضيع ────────────────────────────────────
app.post('/api/scrape/search', async (req, res) => {
  try {
    const { grade, subject } = req.body;
    const lang = getLang(subject);
    const langInstr = getLangInstruction(subject);

    const prompt = lang === 'fr'
      ? `${langInstr}
Propose 8 titres de devoirs et examens algeriens officiels en ${subject} pour ${grade}.
Style exactement comme les documents officiels algeriens.
Reponds en JSON uniquement:
{
  "results": [
    {"title":"Devoir du 1er trimestre en ${subject} - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"Devoir"},
    {"title":"Examen de fin d'annee en ${subject} - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"Examen"}
  ]
}`
      : lang === 'en'
      ? `${langInstr}
Propose 8 titles of official Algerian exams in ${subject} for ${grade}.
Exactly like official Algerian educational documents.
Respond in JSON only:
{
  "results": [
    {"title":"First Term Exam in ${subject} - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"Exam"}
  ]
}`
      : `${langInstr}
اقترح 8 عناوين فروض واختبارات جزائرية رسمية في ${subject} للسنة ${grade}.
بنفس اسلوب عناوين الوثائق التعليمية الجزائرية الرسمية.
اجب بـ JSON فقط:
{
  "results": [
    {"title":"فرض الفصل الاول في ${subject} - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"فرض"},
    {"title":"اختبار نهاية الفصل الثاني في ${subject} - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"اختبار"}
  ]
}`;

    const data = await groqAsk(prompt);
    res.json({ success: true, count: data.results.length, results: data.results });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = app;
