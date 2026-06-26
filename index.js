const express = require('express');
const cors    = require('cors');
const https   = require('https');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'نجاحي', version: '4.0.0' });
});

const LANG = { 'اللغة الفرنسية': 'fr', 'اللغة الإنجليزية': 'en' };
function getLang(sub) { return LANG[sub] || 'ar'; }

const DURATIONS = {
  'ابتدائي': { exam: '45 دقيقة', test: 'ساعة واحدة' },
  'متوسط':   { exam: 'ساعة واحدة', test: 'ساعتان' },
  'ثانوي':   { exam: 'ساعة ونصف', test: '3 ساعات' },
};
function getDuration(stage, type) {
  const s = stage && stage.includes('ابتدائي') ? 'ابتدائي'
          : stage && stage.includes('ثانوي')   ? 'ثانوي'
          : 'متوسط';
  return (DURATIONS[s] || DURATIONS['متوسط'])[type] || 'ساعة واحدة';
}

async function groq(system, user) {
  return new Promise((resolve, reject) => {
    const key  = process.env.GROQ_API_KEY;
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
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

// ── فرض ──────────────────────────────────────────
app.post('/api/exam/generate', async (req, res) => {
  try {
    const { stage, grade, subject, term, difficulty } = req.body;
    const duration = getDuration(stage, 'exam');
    const l = getLang(subject);

    let sys, usr;
    if (l === 'fr') {
      sys = `Tu es professeur expert du programme algerien MEN. Redige ENTIEREMENT EN FRANCAIS. Reponds en JSON valide uniquement.`;
      usr = `Cree un devoir officiel algerien EN FRANCAIS:
Niveau: ${grade} | Matiere: ${subject} | ${term} | Difficulte: ${difficulty} | Duree: ${duration}
Suit exactement le programme MEN algerien. Total: 20 points.
JSON uniquement - commence directement par { :
{"title":"Devoir ${term} de ${subject} - ${grade}","header":"Republique Algerienne Democratique et Populaire - Ministere de l Education Nationale","subject":"${subject}","grade":"${grade}","term":"${term}","duration":"${duration}","totalPoints":20,"instructions":"Repondre a toutes les questions. Soigner l ecriture.","exercises":[{"id":1,"title":"Exercice 1: Comprehension","points":10,"content":"Texte ou enonce complet...","parts":[{"num":"1","question":"Question complete","points":5},{"num":"2","question":"Question complete","points":5}],"solution":"Corrige detaille"},{"id":2,"title":"Exercice 2: Production","points":10,"content":"Sujet de production","parts":[{"num":"1","question":"Question","points":10}],"solution":"Corrige type"}]}`;
    } else if (l === 'en') {
      sys = `You are an expert Algerian MEN curriculum teacher. Write ENTIRELY IN ENGLISH. Respond with valid JSON only.`;
      usr = `Create an official Algerian exam IN ENGLISH:
Level: ${grade} | Subject: ${subject} | ${term} | Difficulty: ${difficulty} | Duration: ${duration}
Follows Algerian MEN curriculum exactly. Total: 20 points.
JSON only - start directly with { :
{"title":"${term} Exam - ${subject} - ${grade}","header":"People s Democratic Republic of Algeria - Ministry of National Education","subject":"${subject}","grade":"${grade}","term":"${term}","duration":"${duration}","totalPoints":20,"instructions":"Answer all questions. Write clearly.","exercises":[{"id":1,"title":"Exercise 1: Reading Comprehension","points":10,"content":"Complete text...","parts":[{"num":"1","question":"Complete question","points":5},{"num":"2","question":"Complete question","points":5}],"solution":"Detailed solution"},{"id":2,"title":"Exercise 2: Written Expression","points":10,"content":"Writing topic","parts":[{"num":"1","question":"Question","points":10}],"solution":"Model answer"}]}`;
    } else {
      sys = `انت استاذ خبير في المناهج الجزائرية الرسمية. اكتب باللغة العربية الفصحى. اجب بـ JSON صحيح فقط.`;
      usr = `انشئ فرضا رسميا جزائريا باللغة العربية:
المرحلة: ${stage} | السنة: ${grade} | المادة: ${subject} | ${term} | المستوى: ${difficulty} | المدة: ${duration}
مطابق للمنهاج الجزائري الرسمي. المجموع: 20 نقطة.
JSON فقط - ابدا مباشرة بـ { :
{"title":"فرض ${term} في ${subject} - ${grade}","header":"الجمهورية الجزائرية الديمقراطية الشعبية - وزارة التربية الوطنية","subject":"${subject}","grade":"${grade}","term":"${term}","duration":"${duration}","totalPoints":20,"instructions":"يجب الاجابة على جميع التمارين - الورقة النظيفة والخط الواضح","exercises":[{"id":1,"title":"التمرين الاول","points":10,"content":"نص التمرين الكامل مع جميع المعطيات والارقام","parts":[{"num":"1","question":"نص السؤال الاول الكامل","points":5},{"num":"2","question":"نص السؤال الثاني الكامل","points":5}],"solution":"الحل النموذجي الكامل"},{"id":2,"title":"التمرين الثاني","points":10,"content":"نص التمرين الثاني","parts":[{"num":"1","question":"السؤال الاول","points":4},{"num":"2","question":"السؤال الثاني","points":3},{"num":"3","question":"السؤال الثالث","points":3}],"solution":"الحل النموذجي"}]}`;
    }

    const data = await groq(sys, usr);
    res.json({ success: true, exam: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── اختبار ───────────────────────────────────────
app.post('/api/exam/test', async (req, res) => {
  try {
    const { stage, grade, subject, examType, questionCount } = req.body;
    const isMCQ = examType === 'mcq';
    const duration = getDuration(stage, 'test');
    const l = getLang(subject);
    const qc = parseInt(questionCount) || 15;
    const pts = Math.round(20 / qc * 10) / 10;

    let sys, usr;
    if (l === 'fr') {
      sys = `Tu es professeur expert du programme algerien MEN. Redige ENTIEREMENT EN FRANCAIS. JSON uniquement.`;
      usr = `Cree un examen officiel algerien de type ${isMCQ ? 'QCM (4 choix par question)' : 'questions ouvertes'} EN FRANCAIS:
Matiere: ${subject} | Niveau: ${grade} | Nombre: ${qc} questions | Duree: ${duration} | Total: 20 points
Suit le programme MEN algerien pour ce niveau.
JSON uniquement - commence par { :
{"title":"Examen de ${subject} - ${grade}","subject":"${subject}","grade":"${grade}","duration":"${duration}","totalPoints":20,"questions":[{"id":1,"question":"Question complete en francais","points":${pts},${isMCQ ? '"options":["A) Premier choix","B) Deuxieme choix","C) Troisieme choix","D) Quatrieme choix"],"correctAnswer":0,' : ''}"explanation":"Reponse complete en francais"}]}`;
    } else if (l === 'en') {
      sys = `You are an expert Algerian MEN curriculum teacher. Write ENTIRELY IN ENGLISH. JSON only.`;
      usr = `Create an official Algerian ${isMCQ ? 'MCQ (4 options each)' : 'open-ended'} exam IN ENGLISH:
Subject: ${subject} | Level: ${grade} | Questions: ${qc} | Duration: ${duration} | Total: 20 points
Follows Algerian MEN curriculum for this level.
JSON only - start with { :
{"title":"${subject} Exam - ${grade}","subject":"${subject}","grade":"${grade}","duration":"${duration}","totalPoints":20,"questions":[{"id":1,"question":"Complete question in English","points":${pts},${isMCQ ? '"options":["A) First option","B) Second option","C) Third option","D) Fourth option"],"correctAnswer":0,' : ''}"explanation":"Complete answer in English"}]}`;
    } else {
      sys = `انت استاذ خبير في المناهج الجزائرية. اكتب باللغة العربية. JSON فقط.`;
      usr = `انشئ اختبارا رسميا جزائريا من نوع ${isMCQ ? 'اختيار متعدد (4 خيارات لكل سؤال)' : 'مقالي'} باللغة العربية:
المادة: ${subject} | السنة: ${grade} | عدد الاسئلة: ${qc} | المدة الرسمية: ${duration} | المجموع: 20 نقطة
مطابق للمنهاج الجزائري الرسمي لهذا المستوى.
JSON فقط - ابدا بـ { :
{"title":"اختبار في ${subject} - ${grade}","subject":"${subject}","grade":"${grade}","duration":"${duration}","totalPoints":20,"questions":[{"id":1,"question":"نص السؤال الكامل باللغة العربية وفق المنهاج","points":${pts},${isMCQ ? '"options":["أ) الخيار الاول","ب) الخيار الثاني","ج) الخيار الثالث","د) الخيار الرابع"],"correctAnswer":0,' : ''}"explanation":"الحل الكامل باللغة العربية"}]}`;
    }

    const data = await groq(sys, usr);
    res.json({ success: true, test: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── تقويم تشخيصي ─────────────────────────────────
app.post('/api/exam/diag', async (req, res) => {
  try {
    const { grade, subject, term } = req.body;
    const l = getLang(subject);

    let sys, usr;
    if (l === 'fr') {
      sys = `Expert programme algerien MEN. Reponds EN FRANCAIS. JSON uniquement.`;
      usr = `Evaluation diagnostique EN FRANCAIS pour ${subject} - ${grade} - ${term} selon programme MEN algerien.
JSON uniquement - commence par { :
{"summary":"Resume du niveau attendu selon le programme algerien officiel pour ${grade}","skills":[{"name":"Competence 1 du programme","pct":75,"status":"good"},{"name":"Competence 2","pct":50,"status":"avg"},{"name":"Competence 3","pct":30,"status":"weak"},{"name":"Competence 4","pct":60,"status":"avg"}],"recommendations":["Recommandation pedagogique 1","Recommandation 2","Recommandation 3"]}`;
    } else if (l === 'en') {
      sys = `Algerian MEN curriculum expert. Respond IN ENGLISH. JSON only.`;
      usr = `Diagnostic assessment IN ENGLISH for ${subject} - ${grade} - ${term} following Algerian MEN curriculum.
JSON only - start with { :
{"summary":"Summary of expected level per official Algerian curriculum for ${grade}","skills":[{"name":"Curriculum skill 1","pct":75,"status":"good"},{"name":"Skill 2","pct":50,"status":"avg"},{"name":"Skill 3","pct":30,"status":"weak"},{"name":"Skill 4","pct":60,"status":"avg"}],"recommendations":["Pedagogical recommendation 1","Recommendation 2","Recommendation 3"]}`;
    } else {
      sys = `استاذ خبير في المناهج الجزائرية. اكتب باللغة العربية. JSON فقط.`;
      usr = `تقويم تشخيصي باللغة العربية لمادة ${subject} - ${grade} - ${term} وفق المنهاج الجزائري الرسمي.
JSON فقط - ابدا بـ { :
{"summary":"ملخص المستوى المطلوب وفق المنهاج الجزائري الرسمي للسنة ${grade} في مادة ${subject}","skills":[{"name":"مهارة من المنهاج الرسمي","pct":75,"status":"good"},{"name":"مهارة ثانية من المنهاج","pct":50,"status":"avg"},{"name":"مهارة تحتاج تعزيز","pct":30,"status":"weak"},{"name":"مهارة رابعة","pct":65,"status":"avg"}],"recommendations":["توصية بيداغوجية 1 وفق المنهاج","توصية 2","توصية 3"]}`;
    }

    const data = await groq(sys, usr);
    res.json({ success: true, diag: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── جلب مواضيع ────────────────────────────────────
app.post('/api/scrape/search', async (req, res) => {
  try {
    const { grade, subject } = req.body;
    const l = getLang(subject);

    let sys, usr;
    if (l === 'fr') {
      sys = `Expert programme algerien MEN. Reponds EN FRANCAIS. JSON uniquement.`;
      usr = `Propose exactement 8 titres de devoirs et examens algeriens officiels EN FRANCAIS pour ${subject} - ${grade}.
Style exactement comme les documents officiels MEN algeriens avec annee et type.
JSON uniquement - commence par { :
{"results":[{"title":"Devoir du 1er trimestre de Francais - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"Devoir"},{"title":"Examen du 2eme trimestre de Francais - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"Examen"},{"title":"Devoir de Francais - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"Devoir"},{"title":"Composition de fin d annee - Francais - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"Composition"},{"title":"Devoir du 3eme trimestre - ${subject} - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"Devoir"},{"title":"Examen Francais - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"Examen"},{"title":"Devoir maison - Francais - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"Devoir"},{"title":"Test de niveau - Francais - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"Test"}]}`;
    } else if (l === 'en') {
      sys = `Algerian MEN curriculum expert. Respond IN ENGLISH. JSON only.`;
      usr = `Propose exactly 8 official Algerian exam titles IN ENGLISH for ${subject} - ${grade}.
Exactly like official MEN Algerian documents with year and type.
JSON only - start with { :
{"results":[{"title":"First Term English Exam - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"Exam"},{"title":"Second Term English Test - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"Test"},{"title":"English Composition - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"Composition"},{"title":"End of Year English Exam - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"Exam"},{"title":"Third Term English Test - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"Test"},{"title":"English Exam - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"Exam"},{"title":"English Test - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"Test"},{"title":"Level Test - English - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"Test"}]}`;
    } else {
      sys = `استاذ خبير في المناهج الجزائرية. اكتب باللغة العربية. JSON فقط.`;
      usr = `اقترح بالضبط 8 عناوين فروض واختبارات جزائرية رسمية باللغة العربية لمادة ${subject} للسنة ${grade}.
بنفس اسلوب الوثائق الرسمية لوزارة التربية الجزائرية مع السنة والنوع.
JSON فقط - ابدا بـ { :
{"results":[{"title":"فرض الفصل الاول في ${subject} - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"فرض"},{"title":"فرض الفصل الثاني في ${subject} - ${grade} - 2024","grade":"${grade}","subject":"${subject}","year":"2024","type":"فرض"},{"title":"اختبار نهاية الفصل الثالث - ${subject} - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"اختبار"},{"title":"موضوع مقترح في ${subject} - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"موضوع مقترح"},{"title":"فرض الفصل الثالث - ${subject} - ${grade} - 2023","grade":"${grade}","subject":"${subject}","year":"2023","type":"فرض"},{"title":"اختبار في ${subject} - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"اختبار"},{"title":"فرض نهاية الفصل الاول - ${subject} - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"فرض"},{"title":"موضوع مقترح - ${subject} - ${grade} - 2022","grade":"${grade}","subject":"${subject}","year":"2022","type":"موضوع مقترح"}]}`;
    }

    const data = await groq(sys, usr);
    // تأكد أن results موجود دائماً
    const results = Array.isArray(data.results) ? data.results : Array.isArray(data) ? data : [];
    res.json({ success: true, count: results.length, results: results });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;
