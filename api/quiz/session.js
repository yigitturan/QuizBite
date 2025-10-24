// api/quiz/session.js

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = await readJson(req);
    const { count = 10, lang = "en", topics = [] } = body;

    const plan = buildDifficultyPlan(count);

    const promptText = `
You are a rigorous quiz generator. Output ONLY a valid JSON object (no code fences, no prose).
Schema:
{
  "questions": [
    {
      "id": "string",
      "stem": "string",
      "options": ["string","string","string","string"],
      "correct_index": 0,
      "explanation": "string",
      "difficulty": "easy|medium|hard",
      "category": "string",
      "tags": ["string", "..."],
      "lang": "${lang}"
    }
  ]
}
Constraints:
- Exactly 4 unique options and one correct_index in [0..3]
- Difficulty distribution must follow the provided plan
- All text must be in language: ${lang}
- Topic(s): ${topics.join(", ") || "general knowledge"}
- Keep explanations short and safe.
`.trim();

    const userPrompt = JSON.stringify({
      instruction: "Generate multiple-choice questions",
      topics,
      difficulty_plan: plan,
      count
    });

    const provider = "gemini";
    console.log("[/api/quiz/session] provider:", provider);

    const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
    const raw = await callGemini({ promptText, userPrompt, model });

    const cleaned = sanitizeAndValidate(raw);
    return res.status(200).json({ questions: cleaned.questions });

  } catch (err) {
    console.error("LLM error -> using fallback:", err?.message || err);
    return res.status(200).json({ questions: fallbackQuestions() });
  }
}

/* ---------- Gemini çağrısı ---------- */
async function callGemini({ promptText, userPrompt, model }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: promptText },
          { text: userPrompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048
    }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.error("[Gemini HTTP ERROR]", r.status, t?.slice(0, 800));
    throw new Error(`Gemini failed ${r.status}`);
  }

  const data = await r.json();
  const txt =
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
    data.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n")?.trim() ||
    "{}";

  try {
    return JSON.parse(stripCodeFences(txt));
  } catch {
    console.error("[Gemini PARSE FAIL] raw:", txt?.slice(0, 800));
    throw new Error("gemini_parse_failed");
  }
}

/* ---------- Helpers (değişmedi) ---------- */
function buildDifficultyPlan(n) {
  if (n <= 3) return Array(n).fill("easy");
  const e = Math.max(1, Math.floor(n * 0.3));
  const m = Math.max(1, Math.floor(n * 0.4));
  const h = Math.max(1, n - e - m);
  return [...Array(e).fill("easy"), ...Array(m).fill("medium"), ...Array(h).fill("hard")];
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sanitizeAndValidate(payload) {
  const out = { questions: [] };
  const arr = payload?.questions || [];
  for (const q of arr) {
    if (!q) continue;
    const opts = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
    const idx = Number(q.correct_index);
    if (opts.length !== 4) continue;
    if (new Set(opts.map(s => (s ?? "").toString().trim())).size !== 4) continue;
    if (!(idx >= 0 && idx <= 3)) continue;

    out.questions.push({
      id: String(q.id || Math.random().toString(36).slice(2)),
      stem: String(q.stem || q.q || q.question || "").trim(),
      options: opts.map(String),
      correct_index: idx,
      explanation: String(q.explanation || "").trim(),
      difficulty: ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "medium",
      category: String(q.category || "general"),
      tags: Array.isArray(q.tags) ? q.tags.slice(0, 8).map(String) : [],
      lang: String(q.lang || "en")
    });
  }
  if (!out.questions.length) throw new Error("no_valid_questions");
  return out;
}

function stripCodeFences(s = "") {
  return s.replace(/^\s*```json\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

function fallbackQuestions() {
  return [
    { id: "f1", stem: "Which planet is known as the Red Planet?", options: ["Mercury", "Mars", "Jupiter", "Venus"], correct_index: 1, explanation: "Iron oxide gives Mars its color.", difficulty: "easy" },
    { id: "f2", stem: "What is the capital of Japan?", options: ["Seoul", "Tokyo", "Beijing", "Osaka"], correct_index: 1, difficulty: "easy" },
    { id: "f3", stem: "H2O is the chemical formula for what?", options: ["Oxygen", "Hydrogen", "Salt", "Water"], correct_index: 3, difficulty: "easy" },
    { id: "f4", stem: "What is 9 × 7?", options: ["56", "72", "63", "81"], correct_index: 2, difficulty: "easy" },
    { id: "f5", stem: "Which ocean is largest by area?", options: ["Indian", "Pacific", "Atlantic", "Arctic"], correct_index: 1, difficulty: "medium" },
    { id: "f6", stem: "Who wrote '1984'?", options: ["George Orwell", "J.K. Rowling", "Ernest Hemingway", "F. Scott Fitzgerald"], correct_index: 0, difficulty: "medium" },
    { id: "f7", stem: "Smallest prime number?", options: ["0", "1", "2", "3"], correct_index: 2, difficulty: "medium" },
    { id: "f8", stem: "Which gas do plants absorb?", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Helium"], correct_index: 2, difficulty: "medium" },
    { id: "f9", stem: "Which language in Brazil?", options: ["Spanish", "Portuguese", "French", "English"], correct_index: 1, difficulty: "hard" },
    { id: "f10", stem: "Instrument with keys, pedals, strings?", options: ["Guitar", "Piano", "Violin", "Flute"], correct_index: 1, difficulty: "hard" },
  ];
}
