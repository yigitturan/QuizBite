// services/quizApi.js
const API_BASE = process.env.EXPO_PUBLIC_API_BASE || "https://<senin-domainin>";

export async function fetchQuizSession({ count = 10, lang = "en", topics = [] } = {}) {
  const r = await fetch(`${API_BASE}/api/quiz/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count, lang, topics }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`quiz_session_failed: ${r.status} ${text}`);
  }
  const data = await r.json();
  return data.questions; // array
}

