import "dotenv/config";

function num(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

export const config = {
  apiBase: (process.env.FORTNITE_API_BASE || "https://api.fortnite.com/ecosystem/v1").replace(/\/+$/, ""),
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || "",

  ccuThreshold: num("CCU_THRESHOLD", 200),
  maxMapAgeDays: num("MAX_MAP_AGE_DAYS", 7),

  pollIntervalMinutes: num("POLL_INTERVAL_MINUTES", 10),
  islandsPerPoll: num("ISLANDS_PER_POLL", 300),
  alertOnFirstRun: bool("ALERT_ON_FIRST_RUN", false),

  port: num("PORT", 3000),

  // Optional: enables AI trend detection for maps the keyword list doesn't know.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",

  // How many metrics lookups to run at once. Kept low to respect API rate limits.
  metricsConcurrency: num("METRICS_CONCURRENCY", 4),
};
