import { config } from "./config.js";

/**
 * Optional: ask Claude what a map is based on / the idea behind it.
 * Only runs if ANTHROPIC_API_KEY is set. Used as a fallback when the rule-based
 * detector (trends.js) doesn't recognise the map — this is what lets the tracker
 * describe brand-new trends that aren't in the keyword list yet.
 * Never throws; returns null on any problem so a poll never breaks.
 */
export async function classifyWithClaude({ title = "", description = "", tags = [] } = {}) {
  if (!config.anthropicApiKey) return null;

  const prompt =
    `You identify what a Fortnite Creative map is based on.\n\n` +
    `Map title: ${title}\n` +
    `Description: ${description || "(none)"}\n` +
    `Tags: ${(Array.isArray(tags) ? tags.join(", ") : tags) || "(none)"}\n\n` +
    `If it clones or is inspired by a specific game (often a Roblox hit) or rides a known trend, say which. ` +
    `Then describe the core gameplay idea in one plain sentence.\n` +
    `Reply with ONLY minified JSON, no markdown: ` +
    `{"origin":"<game/platform or 'original'>","idea":"<one sentence>","confidence":"high|medium|low"}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.anthropicModel,
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.warn("[ai] classify failed:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    const json = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (!json.idea) return null;
    return {
      origin: json.origin && json.origin !== "original" ? json.origin : "Looks original",
      idea: json.idea,
      confidence: json.confidence || "low",
      source: "AI guess",
    };
  } catch (err) {
    console.warn("[ai] classify error:", err.message);
    return null;
  }
}
