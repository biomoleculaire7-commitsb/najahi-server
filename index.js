
const express = require('express');
const cors    = require('cors');
const https   = require('https');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'نجاحي', version: '5.0.0' });
});

// ── لغة كل مادة ──────────────────────────────────
const LANG = { 'اللغة الفرنسية': 'fr', 'اللغة الإنجليزية': 'en' };
function getLang(sub) { return LANG[sub] || 'ar'; }

// ── مدة الفرض حسب المرحلة ─────────────────────────
function getExamDuration(stage) {
  if (stage.includes('ابتدائي')) return '45 دقيقة';
  if (stage.includes('ثانوي'))   return 'ساعة ونصف';
  return 'ساعة واحدة'; // متوسط
}

// ── مدة الاختبار حسب المرحلة والمادة ─────────────
function getTestDuration(stage, subject) {
  const isLang = ['اللغة العربية','اللغة الفرنسية','اللغة الإنجليزية'].includes(subject);
  const isSci  = ['الرياضيات','الفيزياء','الكيمياء','العلوم الطبيعية'].includes(subject);

  if (stage.includes('ابتدائي')) {
    return isLang ? 'ساعة واحدة' : '45 دقيقة';
  }
  if (stage.includes('ثانوي')) {
    if (isSci)  return '3 ساعات';
    if (isLang) return 'ساعتان ونصف';
    return 'ساعتان';
  }
  // متوسط
  if (isSci)  return 'ساعتان';
  if (isLang) return 'ساعة ونصف';
  return 'ساعة واحدة';
}

// ── Groq ──────────────────────────────────────────
async function groq(system, user) {
  return new Promise((resolve, reject) => {
    const key  = process.env.GROQ_API_KEY;
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user   }
      ],
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
          let text = d.choices[0].message.content.replace(/```json|```/g, '').trim();
          const i = text.indexOf('{');
          const j = text.indexOf('[');
          const start = i === -1 ? j : j === -1 ? i : Math.min(i, j);
          if (start > 0) text = text.substring(start);
          resolve(JSON.parse(text));
        } catch(e) { reject(new Error('JSON error: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ══════════════════════════════════════════════════
// EXAM — فرض
// ══════════════════════════════════════════════════
app.post('/api/exam/generate', async (req, res) => {
  try {
    const { stage, grade, subject, term, difficulty } = req.body;
    const duration = getExamDuration(stage);
    const l = getLang(subject);

    let sys, usr;

    if (l === 'fr') {
      sys = `Tu es un professeur expert du programme officiel algerien du MEN.
Tu rediges des devoirs ENTIEREMENT EN FRANCAIS, conformes au programme national algerien pour chaque niveau.
Tu reponds UNIQUEMENT avec du JSON valide sans aucun texte supplementaire.`;

      usr = `Cree un devoir officiel algerien COMPLET EN FRANCAIS pour:
- Niveau: ${grade} (${stage})
- Matiere: ${subject}
- Periode: ${term}
- Difficulte: ${difficulty}
- Duree officielle: ${duration}

Le devoir doit suivre EXACTEMENT le programme MEN algerien pour ce niveau.
Inclure: texte authentique, exercices de comprehension, grammaire/vocabulaire, production ecrite.
Total: 20 points repartis officiellement.

JSON uniquement (commence par {):
{
  "title": "Devoir ${term} de ${subject} - ${grade}",
  "header": "Republique Algerienne Democratique et Populaire\\nMinistere de l Education Nationale",
  "subject": "${subject}",
  "grade": "${grade}",
  "term": "${term}",
  "duration": "${duration}",
  "totalPoints": 20,
  "instructions": "Repondre a toutes les questions - Soigner l ecriture et la presentation",
  "exercises": [
    {
      "id": 1,
      "title": "Exercice 1 : Comprehension de l ecrit (10 pts)",
      "points": 10,
      "content": "Lisez attentivement le texte suivant puis repondez aux questions:\\n[Texte authentique adapte au niveau ${grade}...]",
      "parts": [
        {"num": "1", "question": "Question de comprehension complete", "points": 3},
        {"num": "2", "question": "Question de vocabulaire complete", "points": 3},
        {"num": "3", "question": "Question de grammaire complete", "points": 4}
      ],
      "solution": "Corrige detaille de l exercice 1"
    },
    {
      "id": 2,
      "title": "Exercice 2 : Production ecrite (10 pts)",
      "points": 10,
      "content": "Sujet de production ecrite adapte au niveau ${grade}",
      "parts": [
        {"num": "1", "question": "Consigne de redaction complete", "points": 10}
      ],
      "solution": "Corrige type de la production ecrite"
    }
  ]
}`;

    } else if (l === 'en') {
      sys = `You are an expert Algerian MEN curriculum teacher.
You write exams ENTIRELY IN ENGLISH, following the official Algerian national curriculum.
You respond ONLY with valid JSON, no extra text.`;

      usr = `Create a complete official Algerian exam ENTIRELY IN ENGLISH for:
- Level: ${grade} (${stage})
- Subject: ${subject}
- Period: ${term}
- Difficulty: ${difficulty}
- Official duration: ${duration}

Must follow EXACTLY the Algerian MEN curriculum for this level.
Include: authentic text, comprehension, grammar/vocabulary, written expression.
Total: 20 points officially distributed.

JSON only (start with {):
{
  "title": "${term} Exam - ${subject} - ${grade}",
  "header": "People s Democratic Republic of Algeria\\nMinistry of National Education",
  "subject": "${subject}",
  "grade": "${grade}",
  "term": "${term}",
  "duration": "${duration}",
  "totalPoints": 20,
  "instructions": "Answer all questions - Write clearly and neatly",
  "exercises": [
    {
      "id": 1,
      "title": "Exercise 1: Reading Comprehension (10 pts)",
      "points": 10,
      "content": "Read the following text carefully then answer the questions:\\n[Authentic text adapted to ${grade} level...]",
      "parts": [
        {"num": "1", "question": "Complete comprehension question", "points": 3},
        {"num": "2", "question": "Complete vocabulary question", "points": 3},
        {"num": "3", "question": "Complete grammar question", "points": 4}
      ],
      "solution": "Detailed solution for exercise 1"
    },
    {
      "id": 2,
      "title": "Exercise 2: Written Expression (10 pts)",
      "points": 10,
      "content": "Writing topic adapted to ${grade} level",
      "parts": [
        {"num": "1", "question": "Complete writing instructions", "points": 10}
      ],
      "solution": "Model answer for written expression"
    }
  ]
}`;

    } else {
      sys = `انت استاذ خبير في المناهج الجزائرية الرسمية لوزارة التربية الوطنية.
تنشئ فروضا رسمية كاملة باللغة العربية الفصحى مطابقة للبرنامج الوطني الجزائري لكل مستوى.
تجيب فقط بـ JSON صحيح بدون اي نص اضافي.`;

      usr = `انشئ فرضا رسميا جزائريا كاملا باللغة العربية الفصحى:
- المرحلة: ${stage}
- السنة: ${grade}
- المادة: ${subject}
- الفصل: ${term}
- المستوى: ${difficulty}
- المدة الرسمية: ${duration}

الموضوع يجب ان يكون مطابقا للمنهاج الجزائري الرسمي لهذه المرحلة.
يحتوي على تمارين متنوعة ومترابطة مع توزيع رسمي للنقاط.
المجموع: 20 نقطة.

JSON فقط (ابدا بـ {):
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
      "points": 10,
      "content": "نص التمرين الاول الكامل مع جميع المعطيات والارقام والمعلومات الضرورية",
      "parts": [
        {"num": "1", "question": "نص السؤال الاول الكامل والمفصل", "points": 4},
        {"num": "2", "question": "نص السؤال الثاني الكامل والمفصل", "points": 3},
        {"num": "3", "question": "نص السؤال الثالث الكامل والمفصل", "points": 3}
      ],
      "solution": "الحل النموذجي الكامل والمفصل للتمرين الاول"
    },
    {
      "id": 2,
      "title": "التمرين الثاني",
      "points": 10,
      "content": "نص التمرين الثاني الكامل مع جميع المعطيات",
      "parts": [
        {"num": "1", "question": "نص السؤال الاول", "points": 4},
        {"num": "2", "question": "نص السؤال الثاني", "points": 3},
        {"num": "3", "question": "نص السؤال الثالث", "points": 3}
      ],
      "solution": "الحل النموذجي الكامل للتمرين الثاني"
    }
  ]
}`;
    }

    const data = await groq(sys, usr);
    res.json({ success: true, exam: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// TEST — اختبار
// ══════════════════════════════════════════════════
app.post('/api/exam/test', async (req, res) => {
  try {
    const { stage, grade, subject, examType, questionCount } = req.body;
    const isMCQ    = examType === 'mcq';
    const duration = getTestDuration(stage, subject);
    const l        = getLang(subject);
    const qc       = parseInt(questionCount) || 15;
    const pts      = Math.round(20 / qc * 10) / 10;

    let sys, usr;

    if (l === 'fr') {
      sys = `Tu es professeur expert du programme algerien MEN. Redige ENTIEREMENT EN FRANCAIS. JSON uniquement.`;
      usr = `Cree un examen officiel algerien de type ${isMCQ ? 'QCM (4 choix par question, une seule bonne reponse)' : 'questions ouvertes'} EN FRANCAIS:
- Matiere: ${subject}
- Niveau: ${grade} (${stage})
- Nombre de questions: ${qc}
- Duree officielle: ${duration}
- Total: 20 points (${pts} pts par question)

Suit EXACTEMENT le programme MEN algerien pour ce niveau.
Toutes les questions doivent etre en FRANCAIS.

JSON uniquement (commence par {):
{
  "title": "Examen de ${subject} - ${grade}",
  "subject": "${subject}",
  "grade": "${grade}",
  "duration": "${duration}",
  "totalPoints": 20,
  "questions": [
    {
      "id": 1,
      "question": "Question complete en francais selon le programme algerien",
      "points": ${pts},
      ${isMCQ ? '"options": ["A) Premier choix", "B) Deuxieme choix", "C) Troisieme choix", "D) Quatrieme choix"], "correctAnswer": 0,' : ''}
      "explanation": "Reponse complete et detaillee en francais"
    }
  ]
}`;

    } else if (l === 'en') {
      sys = `You are an expert Algerian MEN curriculum teacher. Write ENTIRELY IN ENGLISH. JSON only.`;
      usr = `Create an official Algerian ${isMCQ ? 'MCQ (4 options, one correct)' : 'open-ended'} exam IN ENGLISH:
- Subject: ${subject}
- Level: ${grade} (${stage})
- Number of questions: ${qc}
- Official duration: ${duration}
- Total: 20 points (${pts} pts per question)

Follows EXACTLY the Algerian MEN curriculum for this level.
All questions must be in ENGLISH.

JSON only (start with {):
{
  "title": "${subject} Exam - ${grade}",
  "subject": "${subject}",
  "grade": "${grade}",
  "duration": "${duration}",
  "totalPoints": 20,
  "questions": [
    {
      "id": 1,
      "question": "Complete question in English following Algerian curriculum",
      "points": ${pts},
      ${isMCQ ? '"options": ["A) First option", "B) Second option", "C) Third option", "D) Fourth option"], "correctAnswer": 0,' : ''}
      "explanation": "Complete detailed answer in English"
    }
  ]
}`;

    } else {
      sys = `انت استاذ خبير في المناهج الجزائرية الرسمية. اكتب باللغة العربية الفصحى. JSON فقط.`;
      usr = `انشئ اختبارا رسميا جزائريا من نوع ${isMCQ ? 'اختيار متعدد (4 خيارات لكل سؤال، خيار واحد صحيح)' : 'اسئلة مفتوحة'} باللغة العربية:
- المادة: ${subject}
- السنة: ${grade} (${stage})
- عدد الاسئلة: ${qc}
- المدة الرسمية: ${duration}
- المجموع: 20 نقطة (${pts} نقطة لكل سؤال)

مطابق للمنهاج الجزائري الرسمي لهذا المستوى.
جميع الاسئلة باللغة العربية الفصحى.

JSON فقط (ابدا بـ {):
{
  "title": "اختبار في ${subject} - ${grade}",
  "subject": "${subject}",
  "grade": "${grade}",
  "duration": "${duration}",
  "totalPoints": 20,
  "questions": [
    {
      "id": 1,
      "question": "نص السؤال الكامل والمفصل باللغة العربية وفق المنهاج الجزائري",
      "points": ${pts},
      ${isMCQ ? '"options": ["أ) الخيار الاول", "ب) الخيار الثاني", "ج) الخيار الثالث", "د) الخيار الرابع"], "correctAnswer": 0,' : ''}
      "explanation": "الحل الكامل والمفصل باللغة العربية"
    }
  ]
}`;
    }

    const data = await groq(sys, usr);
    res.json({ success: true, test: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// DIAG — تقويم تشخيصي
// ══════════════════════════════════════════════════
app.post('/api/exam/diag', async (req, res) => {
  try {
    const { stage, grade, subject, term } = req.body;
    const l = getLang(subject);

    let sys, usr;

    if (l === 'fr') {
      sys = `Tu es expert du programme algerien MEN. Reponds ENTIEREMENT EN FRANCAIS. JSON uniquement.`;
      usr = `Cree une evaluation diagnostique EN FRANCAIS pour:
- Matiere: ${subject}
- Niveau: ${grade} (${stage})
- Periode: ${term}
- Programme: MEN algerien officiel

JSON uniquement (commence par {):
{
  "summary": "Resume detaille du niveau attendu selon le programme MEN algerien pour ${grade} en ${subject}",
  "skills": [
    {"name": "Competence 1 du programme algerien", "pct": 80, "status": "good"},
    {"name": "Competence 2 du programme", "pct": 55, "status": "avg"},
    {"name": "Competence 3 - a renforcer", "pct": 35, "status": "weak"},
    {"name": "Competence 4 du programme", "pct": 65, "status": "avg"}
  ],
  "recommendations": [
    "Recommandation pedagogique 1 selon le programme algerien",
    "Recommandation 2 adaptee au niveau",
    "Recommandation 3 pour ameliorer les points faibles"
  ]
}`;

    } else if (l === 'en') {
      sys = `You are an Algerian MEN curriculum expert. Respond ENTIRELY IN ENGLISH. JSON only.`;
      usr = `Create a diagnostic assessment IN ENGLISH for:
- Subject: ${subject}
- Level: ${grade} (${stage})
- Period: ${term}
- Program: Official Algerian MEN curriculum

JSON only (start with {):
{
  "summary": "Detailed summary of expected level per official Algerian MEN program for ${grade} in ${subject}",
  "skills": [
    {"name": "Curriculum skill 1", "pct": 80, "status": "good"},
    {"name": "Curriculum skill 2", "pct": 55, "status": "avg"},
    {"name": "Skill 3 - needs reinforcement", "pct": 35, "status": "weak"},
    {"name": "Curriculum skill 4", "pct": 65, "status": "avg"}
  ],
  "recommendations": [
    "Pedagogical recommendation 1 per Algerian curriculum",
    "Recommendation 2 adapted to this level",
    "Recommendation 3 to improve weak points"
  ]
}`;

    } else {
      sys = `انت خبير في المناهج الجزائرية الرسمية. اكتب باللغة العربية الفصحى. JSON فقط.`;
      usr = `انشئ تقويما تشخيصيا باللغة العربية لـ:
- المادة: ${subject}
- السنة: ${grade} (${stage})
- الفصل: ${term}
- المنهاج: الجزائري الرسمي لوزارة التربية الوطنية

JSON فقط (ابدا بـ {):
{
  "summary": "ملخص مفصل للمستوى المطلوب وفق المنهاج الجزائري الرسمي للسنة ${grade} في مادة ${subject}، مع تحديد المحاور الاساسية والكفاءات المستهدفة",
  "skills": [
    {"name": "كفاءة 1 من المنهاج الرسمي", "pct": 80, "status": "good"},
    {"name": "كفاءة 2 من المنهاج", "pct": 55, "status": "avg"},
    {"name": "كفاءة 3 تحتاج تعزيز", "pct": 35, "status": "weak"},
    {"name": "كفاءة 4 من المنهاج", "pct": 65, "status": "avg"}
  ],
  "recommendations": [
    "توصية بيداغوجية 1 وفق المنهاج الجزائري الرسمي",
    "توصية 2 مناسبة لهذا المستوى",
    "توصية 3 لتحسين نقاط الضعف المحددة"
  ]
}`;
    }

    const data = await groq(sys, usr);
    res.json({ success: true, diag: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// FETCH — جلب مواضيع
// ══════════════════════════════════════════════════
app.post('/api/scrape/search', async (req, res) => {
  try {
    const { grade, subject, stage } = req.body;
    const l = getLang(subject);

    let sys, usr;

    if (l === 'fr') {
      sys = `Tu es expert du programme algerien MEN. Reponds EN FRANCAIS. JSON uniquement.`;
      usr = `Propose exactement 8 titres de devoirs et examens algeriens officiels EN FRANCAIS pour:
- Matiere: ${subject}
- Niveau: ${grade}
Style exactement comme les documents officiels MEN algeriens.
JSON uniquement (commence par {):
{"results":[
  {"title":"Devoir du 1er trimestre - ${subject} - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"Devoir"},
  {"title":"Examen du 2eme trimestre - ${subject} - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"Examen"},
  {"title":"Composition trimestrielle - ${subject} - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"Composition"},
  {"title":"Devoir de controle - ${subject} - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"Devoir"},
  {"title":"Examen final - ${subject} - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"Examen"},
  {"title":"Devoir surveille - ${subject} - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"Devoir"},
  {"title":"Composition de fin d annee - ${subject} - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"Composition"},
  {"title":"Test de niveau - ${subject} - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"Test"}
]}`;

    } else if (l === 'en') {
      sys = `Algerian MEN curriculum expert. Respond IN ENGLISH. JSON only.`;
      usr = `Propose exactly 8 official Algerian exam titles IN ENGLISH for:
- Subject: ${subject}
- Level: ${grade}
Style exactly like official Algerian MEN documents.
JSON only (start with {):
{"results":[
  {"title":"First Term ${subject} Exam - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"Exam"},
  {"title":"Second Term ${subject} Test - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"Test"},
  {"title":"${subject} Composition - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"Composition"},
  {"title":"${subject} Control Exam - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"Exam"},
  {"title":"End of Year ${subject} Exam - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"Exam"},
  {"title":"${subject} Test - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"Test"},
  {"title":"Annual ${subject} Composition - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"Composition"},
  {"title":"Level Test - ${subject} - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"Test"}
]}`;

    } else {
      sys = `استاذ خبير في المناهج الجزائرية. اكتب باللغة العربية. JSON فقط.`;
      usr = `اقترح بالضبط 8 عناوين فروض واختبارات جزائرية رسمية باللغة العربية لـ:
- المادة: ${subject}
- السنة: ${grade}
بنفس اسلوب الوثائق الرسمية لوزارة التربية الوطنية الجزائرية.
JSON فقط (ابدا بـ {):
{"results":[
  {"title":"فرض الفصل الاول في ${subject} - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"فرض"},
  {"title":"فرض الفصل الثاني في ${subject} - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"فرض"},
  {"title":"اختبار نهاية الفصل في ${subject} - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"اختبار"},
  {"title":"موضوع مقترح في ${subject} - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"مقترح"},
  {"title":"فرض الفصل الثالث - ${subject} - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"فرض"},
  {"title":"اختبار فصلي في ${subject} - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"اختبار"},
  {"title":"فرض نهاية السنة - ${subject} - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"فرض"},
  {"title":"موضوع مقترح للمراجعة - ${subject} - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"مقترح"}
]}`;
    }

    const data = await groq(sys, usr);
    const results = Array.isArray(data.results) ? data.results
                  : Array.isArray(data)          ? data
                  : [];
    res.json({ success: true, count: results.length, results });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;
