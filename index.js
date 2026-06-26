
const express = require('express');
const cors    = require('cors');
const https   = require('https');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'نجاحي', version: '4.0.0' });
});

// ── لغة كل مادة ──────────────────────────────────
const LANG = {
  'اللغة الفرنسية': 'fr',
  'اللغة الإنجليزية': 'en',
};
function lang(sub) { return LANG[sub] || 'ar'; }

// ── توقيت الاختبارات الرسمي ──────────────────────
const DURATIONS = {
  primary:   { exam: '45 دقيقة', test: 'ساعة واحدة' },
  middle:    { exam: 'ساعة واحدة', test: 'ساعتان' },
  high:      { exam: 'ساعة ونصف', test: '3 ساعات' },
};

function getDuration(stage, type) {
  const s = stage && stage.includes('ابتدائي') ? 'primary'
          : stage && stage.includes('ثانوي')   ? 'high'
          : 'middle';
  return DURATIONS[s][type] || 'ساعة واحدة';
}

// ── Groq API ──────────────────────────────────────
async function ask(messages) {
  return new Promise((resolve, reject) => {
    const key  = process.env.GROQ_API_KEY;
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      max_tokens: 3000,
      temperature: 0.2
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
      r.on('data', c => data += c);
      r.on('end', () => {
        try {
          const d = JSON.parse(data);
          if (d.error) { reject(new Error(d.error.message)); return; }
          const text = d.choices[0].message.content.replace(/```json|```/g,'').trim();
          const start = Math.min(
            text.indexOf('{') !== -1 ? text.indexOf('{') : 9999,
            text.indexOf('[') !== -1 ? text.indexOf('[') : 9999
          );
          resolve(JSON.parse(text.substring(start)));
        } catch(e) { reject(new Error('JSON error: ' + e.message)); }
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
    const duration = getDuration(stage, 'exam');
    const l = lang(subject);

    let system, prompt;

    if (l === 'fr') {
      system = `Tu es un professeur expert du programme officiel algerien (MEN). 
Tu crees des devoirs officiels ENTIEREMENT EN FRANCAIS, conformes au programme national algerien.
Tu reponds UNIQUEMENT avec du JSON valide, sans aucun texte supplementaire.`;
      prompt = `Cree un devoir officiel algerien complet EN FRANCAIS pour:
Niveau: ${grade} | Matiere: ${subject} | ${term} | Difficulte: ${difficulty}
Duree officielle: ${duration}
Le devoir doit suivre exactement le programme MEN algerien pour ce niveau.

JSON uniquement:
{
  "title": "Devoir ${term} - ${subject} - ${grade}",
  "header": "Republique Algerienne Democratique et Populaire\\nMinistere de l'Education Nationale",
  "subject": "${subject}",
  "grade": "${grade}",
  "term": "${term}",
  "duration": "${duration}",
  "totalPoints": 20,
  "instructions": "Repondre a toutes les questions. Soigner l'ecriture et la presentation.",
  "exercises": [
    {
      "id": 1,
      "title": "Exercice 1: Comprehension de l'ecrit",
      "points": 10,
      "content": "Texte complet a lire...",
      "parts": [
        {"num": "1", "question": "Question complete en francais", "points": 4},
        {"num": "2", "question": "Question complete en francais", "points": 3},
        {"num": "3", "question": "Question complete en francais", "points": 3}
      ],
      "solution": "Corrige detaille en francais"
    },
    {
      "id": 2,
      "title": "Exercice 2: Production ecrite",
      "points": 10,
      "content": "Sujet de redaction ou exercice de langue",
      "parts": [
        {"num": "1", "question": "Question complete", "points": 5},
        {"num": "2", "question": "Question complete", "points": 5}
      ],
      "solution": "Corrige type"
    }
  ]
}`;
    } else if (l === 'en') {
      system = `You are an expert teacher of the official Algerian curriculum (MEN).
You create official exams ENTIRELY IN ENGLISH, following the Algerian national program.
You respond ONLY with valid JSON, no extra text.`;
      prompt = `Create a complete official Algerian exam IN ENGLISH for:
Level: ${grade} | Subject: ${subject} | ${term} | Difficulty: ${difficulty}
Official duration: ${duration}

JSON only:
{
  "title": "${term} Exam - ${subject} - ${grade}",
  "header": "People's Democratic Republic of Algeria\\nMinistry of National Education",
  "subject": "${subject}",
  "grade": "${grade}",
  "term": "${term}",
  "duration": "${duration}",
  "totalPoints": 20,
  "instructions": "Answer all questions. Write clearly and neatly.",
  "exercises": [
    {
      "id": 1,
      "title": "Exercise 1: Reading Comprehension",
      "points": 10,
      "content": "Complete text to read...",
      "parts": [
        {"num": "1", "question": "Complete question in English", "points": 4},
        {"num": "2", "question": "Complete question in English", "points": 3},
        {"num": "3", "question": "Complete question in English", "points": 3}
      ],
      "solution": "Detailed solution in English"
    },
    {
      "id": 2,
      "title": "Exercise 2: Written Expression",
      "points": 10,
      "content": "Writing topic or language exercise",
      "parts": [
        {"num": "1", "question": "Complete question", "points": 5},
        {"num": "2", "question": "Complete question", "points": 5}
      ],
      "solution": "Model answer"
    }
  ]
}`;
    } else {
      system = `انت استاذ خبير في المناهج الجزائرية الرسمية (وزارة التربية الوطنية).
تنشئ فروضا رسمية كاملة باللغة العربية الفصحى مطابقة للبرنامج الوطني الجزائري.
تجيب فقط بـ JSON صحيح بدون اي نص اضافي.`;
      prompt = `انشئ فرضا رسميا جزائريا كاملا باللغة العربية:
المرحلة: ${stage} | السنة: ${grade} | المادة: ${subject} | ${term} | المستوى: ${difficulty}
المدة الرسمية: ${duration}
الموضوع يجب ان يكون مطابقا للمنهاج الجزائري الرسمي لهذه المرحلة.

JSON فقط:
{
  "title": "فرض ${term} في ${subject} - ${grade}",
  "header": "الجمهورية الجزائرية الديمقراطية الشعبية\\nوزارة التربية الوطنية",
  "subject": "${subject}",
  "grade": "${grade}",
  "term": "${term}",
  "duration": "${duration}",
  "totalPoints": 20,
  "instructions": "يجب الاجابة على جميع التمارين - الورقة النظيفة والخط الواضح",
  "exercises": [
    {
      "id": 1,
      "title": "التمرين الاول",
      "points": 8,
      "content": "نص التمرين الكامل والمفصل مع جميع المعطيات والارقام",
      "parts": [
        {"num": "1", "question": "نص السؤال الاول الكامل", "points": 4},
        {"num": "2", "question": "نص السؤال الثاني الكامل", "points": 4}
      ],
      "solution": "الحل النموذجي الكامل"
    },
    {
      "id": 2,
      "title": "التمرين الثاني",
      "points": 12,
      "content": "نص التمرين الثاني الكامل",
      "parts": [
        {"num": "1", "question": "السؤال الاول", "points": 4},
        {"num": "2", "question": "السؤال الثاني", "points": 4},
        {"num": "3", "question": "السؤال الثالث", "points": 4}
      ],
      "solution": "الحل النموذجي الكامل للتمرين الثاني"
    }
  ]
}`;
    }

    const data = await ask([{role:'system',content:system},{role:'user',content:prompt}]);
    res.json({ success: true, exam: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── توليد اختبار ──────────────────────────────────
app.post('/api/exam/test', async (req, res) => {
  try {
    const { stage, grade, subject, examType, questionCount } = req.body;
    const isMCQ = examType === 'mcq';
    const duration = getDuration(stage, 'test');
    const l = lang(subject);
    const qc = questionCount || 15;

    let system, prompt;

    if (l === 'fr') {
      system = `Tu es un professeur expert du programme algerien officiel. Tu crees des examens ENTIEREMENT EN FRANCAIS. JSON uniquement.`;
      prompt = `Cree un examen officiel algerien de type ${isMCQ ? 'QCM' : 'questions ouvertes'} EN FRANCAIS:
Matiere: ${subject} | Niveau: ${grade} | Questions: ${qc} | Duree: ${duration}
Suit le programme MEN algerien. Total: 20 points.
JSON uniquement:
{
  "title": "Examen de ${subject} - ${grade}",
  "subject": "${subject}", "grade": "${grade}",
  "duration": "${duration}", "totalPoints": 20,
  "questions": [
    {"id":1,"question":"Question complete en francais","points":${Math.round(20/qc*10)/10},${isMCQ?'"options":["A) option","B) option","C) option","D) option"],"correctAnswer":0,':''}"explanation":"Reponse detaillee en francais"}
  ]
}`;
    } else if (l === 'en') {
      system = `You are an expert Algerian curriculum teacher. You create exams ENTIRELY IN ENGLISH. JSON only.`;
      prompt = `Create an official Algerian ${isMCQ ? 'MCQ' : 'open-ended'} exam IN ENGLISH:
Subject: ${subject} | Level: ${grade} | Questions: ${qc} | Duration: ${duration}
Follows MEN Algerian curriculum. Total: 20 points.
JSON only:
{
  "title": "${subject} Exam - ${grade}",
  "subject": "${subject}", "grade": "${grade}",
  "duration": "${duration}", "totalPoints": 20,
  "questions": [
    {"id":1,"question":"Complete question in English","points":${Math.round(20/qc*10)/10},${isMCQ?'"options":["A) option","B) option","C) option","D) option"],"correctAnswer":0,':''}"explanation":"Detailed answer in English"}
  ]
}`;
    } else {
      system = `انت استاذ خبير في المناهج الجزائرية الرسمية. تنشئ اختبارات باللغة العربية. JSON فقط.`;
      prompt = `انشئ اختبارا رسميا جزائريا من نوع ${isMCQ ? 'اختيار متعدد' : 'مقالي'} باللغة العربية:
المادة: ${subject} | السنة: ${grade} | عدد الاسئلة: ${qc} | المدة الرسمية: ${duration}
مطابق للمنهاج الجزائري الرسمي. المجموع: 20 نقطة.
JSON فقط:
{
  "title": "اختبار في ${subject} - ${grade}",
  "subject": "${subject}", "grade": "${grade}",
  "duration": "${duration}", "totalPoints": 20,
  "questions": [
    {"id":1,"question":"نص السؤال الكامل باللغة العربية","points":${Math.round(20/qc*10)/10},${isMCQ?'"options":["أ) خيار","ب) خيار","ج) خيار","د) خيار"],"correctAnswer":0,':''}"explanation":"الحل الكامل باللغة العربية"}
  ]
}`;
    }

    const data = await ask([{role:'system',content:system},{role:'user',content:prompt}]);
    res.json({ success: true, test: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── تقويم تشخيصي ──────────────────────────────────
app.post('/api/exam/diag', async (req, res) => {
  try {
    const { grade, subject, term } = req.body;
    const l = lang(subject);

    let system, prompt;
    if (l === 'fr') {
      system = `Expert du programme algerien officiel. Reponds EN FRANCAIS. JSON uniquement.`;
      prompt = `Evaluation diagnostique EN FRANCAIS pour ${subject} - ${grade} - ${term} selon le programme MEN algerien.
JSON uniquement:
{"summary":"Resume du niveau selon programme algerien","skills":[{"name":"Competence du programme","pct":75,"status":"good"},{"name":"Competence 2","pct":50,"status":"avg"},{"name":"Competence 3","pct":30,"status":"weak"}],"recommendations":["Recommandation 1","Recommandation 2","Recommandation 3"]}`;
    } else if (l === 'en') {
      system = `Expert Algerian curriculum teacher. Respond IN ENGLISH. JSON only.`;
      prompt = `Diagnostic assessment IN ENGLISH for ${subject} - ${grade} - ${term} following Algerian MEN curriculum.
JSON only:
{"summary":"Level summary per Algerian curriculum","skills":[{"name":"Curriculum skill","pct":75,"status":"good"},{"name":"Skill 2","pct":50,"status":"avg"},{"name":"Skill 3","pct":30,"status":"weak"}],"recommendations":["Recommendation 1","Recommendation 2","Recommendation 3"]}`;
    } else {
      system = `استاذ خبير في المناهج الجزائرية. اجب باللغة العربية. JSON فقط.`;
      prompt = `تقويم تشخيصي باللغة العربية لمادة ${subject} - ${grade} - ${term} وفق المنهاج الجزائري الرسمي.
JSON فقط:
{"summary":"ملخص المستوى وفق المنهاج الجزائري الرسمي","skills":[{"name":"مهارة من المنهاج","pct":75,"status":"good"},{"name":"مهارة ثانية","pct":50,"status":"avg"},{"name":"مهارة تحتاج تعزيز","pct":30,"status":"weak"}],"recommendations":["توصية 1 وفق المنهاج","توصية 2","توصية 3"]}`;
    }

    const data = await ask([{role:'system',content:system},{role:'user',content:prompt}]);
    res.json({ success: true, diag: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── جلب مواضيع ────────────────────────────────────
app.post('/api/scrape/search', async (req, res) => {
  try {
    const { grade, subject } = req.body;
    const l = lang(subject);

    let system, prompt;
    if (l === 'fr') {
      system = `Expert du programme algerien. Reponds EN FRANCAIS. JSON uniquement.`;
      prompt = `Propose 8 titres de devoirs et examens algeriens officiels EN FRANCAIS pour ${subject} - ${grade}.
Style exactement comme les documents officiels du MEN algerien.
JSON uniquement:
{"results":[{"title":"Titre officiel en francais","grade":"${grade}","subject":"${subject}","year":"2024","type":"Devoir"}]}`;
    } else if (l === 'en') {
      system = `Algerian curriculum expert. Respond IN ENGLISH. JSON only.`;
      prompt = `Propose 8 official Algerian exam titles IN ENGLISH for ${subject} - ${grade}.
Exactly like official MEN Algerian documents.
JSON only:
{"results":[{"title":"Official English title","grade":"${grade}","subject":"${subject}","year":"2024","type":"Exam"}]}`;
    } else {
      system = `استاذ خبير في المناهج الجزائرية. اجب باللغة العربية. JSON فقط.`;
      prompt = `اقترح 8 عناوين فروض واختبارات جزائرية رسمية باللغة العربية لمادة ${subject} للسنة ${grade}.
بنفس اسلوب الوثائق الرسمية لوزارة التربية الجزائرية.
JSON فقط:
{"results":[{"title":"عنوان رسمي باللغة العربية","grade":"${grade}","subject":"${subject}","year":"2024","type":"فرض"}]}`;
    }

    const data = await ask([{role:'system',content:system},{role:'user',content:prompt}]);
    res.json({ success: true, count: data.results.length, results: data.results });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;
