// api/quiz/session.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = await readJson(req);
    const { count = 10, lang = "en", topics = [], model = process.env.LLM_MODEL || "gpt-4o-mini" } = body;

    const plan = buildDifficultyPlan(count);
    const systemPrompt = `
You are a rigorous quiz generator. Output ONLY JSON.
4 unique options, one correct_index (0..3), short explanation, difficulty in "easy|medium|hard".
Language: ${lang}. Safe/neutral content.
`;
    const userPrompt = JSON.stringify({ instruction: "Generate MCQs", topics, difficulty_plan: plan, count });

    const json = await callLLM({ systemPrompt, userPrompt, model });
    const cleaned = sanitizeAndValidate(json);
    return res.status(200).json({ questions: cleaned.questions });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "quiz_generation_failed", detail: String(err?.message || err) });
  }
}

/* helpers */
function buildDifficultyPlan(n) {
  if (n <= 3) return Array(n).fill("easy");
  const e = Math.max(1, Math.floor(n * 0.3));
  const m = Math.max(1, Math.floor(n * 0.4));
  const h = Math.max(1, n - e - m);
  return [...Array(e).fill("easy"), ...Array(m).fill("medium"), ...Array(h).fill("hard")];
}
async function readJson(req) {
  const chunks = []; for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
async function callLLM({ systemPrompt, userPrompt, model }) {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  if (!apiKey) throw new Error("LLM_API_KEY missing");

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      temperature: 0.7
    })
  });
  if (!r.ok) throw new Error(`LLM failed ${r.status} ${await r.text().catch(()=> "")}`);

  const data = await r.json();
  const content = data.choices?.[0]?.message?.content?.trim() || "{}";
  try { return JSON.parse(content); }
  catch { return JSON.parse(content.replace(/```json|```/g, "").trim()); }
}
function sanitizeAndValidate(payload) {
  const out = { questions: [] };
  const arr = payload?.questions || [];
  for (const q of arr) {
    if (!q) continue;
    const opts = Array.isArray(q.options) ? q.options.slice(0,4) : [];
    const idx = Number(q.correct_index);
    if (opts.length !== 4) continue;
    if (new Set(opts.map(s => (s ?? "").trim())).size !== 4) continue;
    if (!(idx >= 0 && idx <= 3)) continue;
    out.questions.push({
      id: String(q.id || Math.random().toString(36).slice(2)),
      stem: String(q.stem || "").trim(),
      options: opts,
      correct_index: idx,
      explanation: String(q.explanation || "").trim(),
      difficulty: ["easy","medium","hard"].includes(q.difficulty) ? q.difficulty : "medium",
      category: String(q.category || "general"),
      tags: Array.isArray(q.tags) ? q.tags.slice(0,8).map(String) : [],
      lang: String(q.lang || "en")
    });
  }
  if (!out.questions.length) throw new Error("no_valid_questions");
  return out;
}
