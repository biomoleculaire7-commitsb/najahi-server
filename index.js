const express = require('express');
const cors    = require('cors');
const https   = require('https');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'نجاحي', version: '6.0.0' });
});

// ── لغة كل مادة ──────────────────────────────────
const LANG = { 'اللغة الفرنسية': 'fr', 'اللغة الإنجليزية': 'en' };
function getLang(sub) { return LANG[sub] || 'ar'; }

function getExamDuration(stage) {
  if (stage.includes('ابتدائي')) return '45 دقيقة';
  if (stage.includes('ثانوي'))   return 'ساعة ونصف';
  return 'ساعة واحدة';
}
function getTestDuration(stage, subject) {
  const isLang = ['اللغة العربية','اللغة الفرنسية','اللغة الإنجليزية'].includes(subject);
  const isSci  = ['الرياضيات','الفيزياء','الكيمياء','العلوم الطبيعية'].includes(subject);
  if (stage.includes('ابتدائي')) return isLang ? 'ساعة واحدة' : '45 دقيقة';
  if (stage.includes('ثانوي'))   return isSci ? '3 ساعات' : isLang ? 'ساعتان ونصف' : 'ساعتان';
  return isSci ? 'ساعتان' : isLang ? 'ساعة ونصف' : 'ساعة واحدة';
}

async function groq(system, user, maxTok) {
  return new Promise((resolve, reject) => {
    const key  = process.env.GROQ_API_KEY;
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTok || 3500,
      temperature: 0.25
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
// EXAM — فرض بصيغة dzexams الرسمية (سند + اسئلة + تصحيح)
// ══════════════════════════════════════════════════
app.post('/api/exam/generate', async (req, res) => {
  try {
    const { stage, grade, subject, term, difficulty } = req.body;
    const duration = getExamDuration(stage);
    const l = getLang(subject);

    let sys, usr;

    if (l === 'fr') {
      sys = `Tu es expert du programme algerien MEN, specialise dans la creation de devoirs officiels au format exact des documents dzexams.com. Reponds ENTIEREMENT EN FRANCAIS. JSON valide uniquement.`;
      usr = `Cree un devoir officiel algerien complet EN FRANCAIS, EXACTEMENT au format des sujets officiels (avec un support/texte, puis des questions numerotees, puis un corrige modele separe):
Niveau: ${grade} (${stage}) | Matiere: ${subject} | ${term} | Difficulte: ${difficulty} | Duree: ${duration}

JSON uniquement (commence par {):
{
  "title": "Devoir ${term} de ${subject} - ${grade}",
  "header": "Republique Algerienne Democratique et Populaire\\nMinistere de l Education Nationale",
  "subject": "${subject}", "grade": "${grade}", "term": "${term}", "duration": "${duration}", "totalPoints": 20,
  "support": "Texte/support authentique complet et adapte au niveau (au moins 80 mots)",
  "questions": [
    {"id":1,"section":"Comprehension","question":"Question complete 1","points":3},
    {"id":2,"section":"Comprehension","question":"Question complete 2","points":3},
    {"id":3,"section":"Langue","question":"Question de grammaire/vocabulaire complete","points":4},
    {"id":4,"section":"Production","question":"Sujet de production ecrite complet","points":10}
  ],
  "correction": [
    {"id":1,"answer":"Reponse modele complete et detaillee"},
    {"id":2,"answer":"Reponse modele complete"},
    {"id":3,"answer":"Reponse modele complete"},
    {"id":4,"answer":"Bareme et corrige type de la production ecrite"}
  ]
}`;
    } else if (l === 'en') {
      sys = `You are an Algerian MEN curriculum expert, specialized in creating official exams in the exact dzexams.com format. Respond ENTIRELY IN ENGLISH. Valid JSON only.`;
      usr = `Create a complete official Algerian exam ENTIRELY IN ENGLISH, EXACTLY in the format of official papers (a text/support, then numbered questions, then a separate model correction):
Level: ${grade} (${stage}) | Subject: ${subject} | ${term} | Difficulty: ${difficulty} | Duration: ${duration}

JSON only (start with {):
{
  "title": "${term} Exam in ${subject} - ${grade}",
  "header": "People s Democratic Republic of Algeria\\nMinistry of National Education",
  "subject": "${subject}", "grade": "${grade}", "term": "${term}", "duration": "${duration}", "totalPoints": 20,
  "support": "Complete authentic text adapted to the level (at least 80 words)",
  "questions": [
    {"id":1,"section":"Reading Comprehension","question":"Complete question 1","points":3},
    {"id":2,"section":"Reading Comprehension","question":"Complete question 2","points":3},
    {"id":3,"section":"Mastery of Language","question":"Complete grammar/vocabulary question","points":4},
    {"id":4,"section":"Written Expression","question":"Complete writing topic","points":10}
  ],
  "correction": [
    {"id":1,"answer":"Complete detailed model answer"},
    {"id":2,"answer":"Complete model answer"},
    {"id":3,"answer":"Complete model answer"},
    {"id":4,"answer":"Marking scheme and model answer for written expression"}
  ]
}`;
    } else {
      sys = `انت استاذ خبير في المناهج الجزائرية الرسمية، متخصص في انشاء فروض رسمية بنفس الصيغة الدقيقة لمواقع dzexams. اكتب باللغة العربية الفصحى. اجب فقط بـ JSON صحيح.`;
      usr = `انشئ فرضا رسميا جزائريا كاملا باللغة العربية الفصحى، بنفس الصيغة الدقيقة للمواضيع الرسمية (سند نصي ثم اسئلة مرقمة منظمة في وضعيات ثم تصحيح نموذجي منفصل):
المرحلة: ${stage} | السنة: ${grade} | المادة: ${subject} | ${term} | المستوى: ${difficulty} | المدة: ${duration}

يجب ان يحتوي على:
- سند (نص او معطيات حسب طبيعة المادة)
- اسئلة مقسمة الى وضعيات (الوضعية الاولى، الثانية، الوضعية الادماجية) كما في الفروض الرسمية الجزائرية
- توزيع نقاط دقيق يصل الى 20
- تصحيح نموذجي مفصل لكل سؤال

JSON فقط (ابدا بـ {):
{
  "title": "فرض ${term} في ${subject} - ${grade}",
  "header": "الجمهورية الجزائرية الديمقراطية الشعبية\\nوزارة التربية الوطنية",
  "subject": "${subject}", "grade": "${grade}", "term": "${term}", "duration": "${duration}", "totalPoints": 20,
  "support": "نص السند الكامل او المعطيات الكاملة حسب طبيعة المادة (نص قرائي للغات، معطيات وارقام للرياضيات والعلوم)",
  "questions": [
    {"id":1,"section":"الوضعية الاولى","question":"نص السؤال الاول الكامل","points":4},
    {"id":2,"section":"الوضعية الاولى","question":"نص السؤال الثاني الكامل","points":4},
    {"id":3,"section":"الوضعية الثانية","question":"نص السؤال الثالث الكامل","points":4},
    {"id":4,"section":"الوضعية الثانية","question":"نص السؤال الرابع الكامل","points":4},
    {"id":5,"section":"الوضعية الادماجية","question":"وضعية ادماجية متكاملة وفق السياق والسند والتعليمة","points":4}
  ],
  "correction": [
    {"id":1,"answer":"الحل النموذجي الكامل والمفصل للسؤال الاول"},
    {"id":2,"answer":"الحل النموذجي الكامل للسؤال الثاني"},
    {"id":3,"answer":"الحل النموذجي الكامل للسؤال الثالث"},
    {"id":4,"answer":"الحل النموذجي الكامل للسؤال الرابع"},
    {"id":5,"answer":"معايير التصحيح والحل النموذجي للوضعية الادماجية"}
  ]
}`;
    }

    const data = await groq(sys, usr, 3500);
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
      sys = `Expert programme algerien MEN. Redige ENTIEREMENT EN FRANCAIS. JSON uniquement.`;
      usr = `Cree un examen officiel algerien ${isMCQ ? 'QCM (4 choix)' : 'a questions ouvertes'} EN FRANCAIS:
Matiere: ${subject} | Niveau: ${grade} (${stage}) | Questions: ${qc} | Duree: ${duration} | Total: 20 pts
JSON uniquement (commence par {):
{"title":"Examen de ${subject} - ${grade}","subject":"${subject}","grade":"${grade}","duration":"${duration}","totalPoints":20,
"questions":[{"id":1,"question":"Question complete","points":${pts},${isMCQ?'"options":["A) ...","B) ...","C) ...","D) ..."],"correctAnswer":0,':''}"explanation":"Reponse detaillee"}]}`;
    } else if (l === 'en') {
      sys = `Algerian MEN curriculum expert. Write ENTIRELY IN ENGLISH. JSON only.`;
      usr = `Create an official Algerian ${isMCQ ? 'MCQ' : 'open-ended'} exam IN ENGLISH:
Subject: ${subject} | Level: ${grade} (${stage}) | Questions: ${qc} | Duration: ${duration} | Total: 20 pts
JSON only (start with {):
{"title":"${subject} Exam - ${grade}","subject":"${subject}","grade":"${grade}","duration":"${duration}","totalPoints":20,
"questions":[{"id":1,"question":"Complete question","points":${pts},${isMCQ?'"options":["A) ...","B) ...","C) ...","D) ..."],"correctAnswer":0,':''}"explanation":"Detailed answer"}]}`;
    } else {
      sys = `استاذ خبير في المناهج الجزائرية. اكتب باللغة العربية. JSON فقط.`;
      usr = `انشئ اختبارا رسميا جزائريا من نوع ${isMCQ ? 'اختيار متعدد' : 'مقالي'} باللغة العربية:
المادة: ${subject} | السنة: ${grade} (${stage}) | عدد الاسئلة: ${qc} | المدة: ${duration} | المجموع: 20 نقطة
JSON فقط (ابدا بـ {):
{"title":"اختبار في ${subject} - ${grade}","subject":"${subject}","grade":"${grade}","duration":"${duration}","totalPoints":20,
"questions":[{"id":1,"question":"نص السؤال الكامل وفق المنهاج","points":${pts},${isMCQ?'"options":["أ) ...","ب) ...","ج) ...","د) ..."],"correctAnswer":0,':''}"explanation":"الحل الكامل"}]}`;
    }

    const data = await groq(sys, usr, 3000);
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
      sys = `Expert programme algerien MEN. Reponds EN FRANCAIS. JSON uniquement.`;
      usr = `Evaluation diagnostique EN FRANCAIS pour ${subject} - ${grade} (${stage}) - ${term}.
JSON uniquement (commence par {):
{"summary":"Resume detaille du niveau selon programme algerien","skills":[{"name":"Competence 1","pct":75,"status":"good"},{"name":"Competence 2","pct":50,"status":"avg"},{"name":"Competence 3","pct":30,"status":"weak"},{"name":"Competence 4","pct":65,"status":"avg"}],"recommendations":["Recommandation 1","Recommandation 2","Recommandation 3"]}`;
    } else if (l === 'en') {
      sys = `Algerian MEN curriculum expert. Respond IN ENGLISH. JSON only.`;
      usr = `Diagnostic assessment IN ENGLISH for ${subject} - ${grade} (${stage}) - ${term}.
JSON only (start with {):
{"summary":"Detailed level summary per Algerian curriculum","skills":[{"name":"Skill 1","pct":75,"status":"good"},{"name":"Skill 2","pct":50,"status":"avg"},{"name":"Skill 3","pct":30,"status":"weak"},{"name":"Skill 4","pct":65,"status":"avg"}],"recommendations":["Recommendation 1","Recommendation 2","Recommendation 3"]}`;
    } else {
      sys = `استاذ خبير في المناهج الجزائرية. اكتب باللغة العربية. JSON فقط.`;
      usr = `تقويم تشخيصي باللغة العربية لـ ${subject} - ${grade} (${stage}) - ${term}.
JSON فقط (ابدا بـ {):
{"summary":"ملخص مفصل للمستوى وفق المنهاج الجزائري الرسمي","skills":[{"name":"كفاءة 1 من المنهاج","pct":75,"status":"good"},{"name":"كفاءة 2","pct":50,"status":"avg"},{"name":"كفاءة 3 تحتاج تعزيز","pct":30,"status":"weak"},{"name":"كفاءة 4","pct":65,"status":"avg"}],"recommendations":["توصية 1 وفق المنهاج","توصية 2","توصية 3"]}`;
    }

    const data = await groq(sys, usr, 2000);
    res.json({ success: true, diag: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════
// FETCH — استخراج موضوع من ملف مرفوع (PDF نصي مستخرج مسبقا)
// ══════════════════════════════════════════════════
app.post('/api/extract/parse', async (req, res) => {
  try {
    const { text, fileName } = req.body;
    if (!text || text.length < 30) {
      return res.status(400).json({ error: 'لم يتم العثور على نص كافٍ في الملف' });
    }

    const sys = `انت خبير في تنسيق المواضيع التعليمية الجزائرية. مهمتك استخراج وتنظيم محتوى موضوع من نص مستخرج من ملف PDF، والابقاء على نفس اللغة الاصلية للموضوع (عربي، فرنسي، او انجليزي) دون اي ترجمة. اجب فقط بـ JSON صحيح.`;
    const usr = `استخرج ونظم محتوى هذا الموضوع التعليمي من النص التالي المستخرج من ملف "${fileName}":
حافظ على نفس لغة النص الاصلية تماما (لا تترجم اي شيء).
حدد العنوان، المادة، المستوى، المدة، السند ان وجد، الاسئلة، والتصحيح النموذجي ان وجد بشكل منفصل.

النص المستخرج:
"""
${text.substring(0, 6000)}
"""

JSON فقط (ابدا بـ {):
{
  "title": "عنوان الموضوع كما يظهر في النص",
  "subject": "اسم المادة",
  "grade": "المستوى الدراسي",
  "term": "الفصل ان وجد",
  "duration": "المدة الزمنية ان وجدت",
  "totalPoints": 20,
  "support": "نص السند ان وجد بنفس اللغة الاصلية",
  "questions": [
    {"id":1,"section":"اسم الوضعية ان وجد","question":"نص السؤال بنفس اللغة الاصلية","points":4}
  ],
  "correction": [
    {"id":1,"answer":"الحل النموذجي ان وجد في النص بنفس اللغة الاصلية، او اتركه فارغا ان لم يوجد تصحيح"}
  ]
}`;

    const data = await groq(sys, usr, 4000);
    res.json({ success: true, exam: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;
