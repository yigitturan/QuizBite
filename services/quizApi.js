import Constants from "expo-constants";
const API_BASE = Constants.expoConfig?.extra?.API_BASE;

export async function fetchQuizSession({ count = 10, lang = "en", topics = [] } = {}) {
  if (!API_BASE) throw new Error("API_BASE missing. Set app.json -> extra.API_BASE");
  const r = await fetch(`${API_BASE}/api/quiz/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count, lang, topics })
  });
  if (!r.ok) throw new Error(`quiz_session_failed: ${r.status} ${await r.text().catch(()=> "")}`);
  const data = await r.json();
  // server {questions:[{stem,options,correct_index,...}]} döner
  return data.questions || [];
}
