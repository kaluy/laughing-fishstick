import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { start as startTracker, getSnapshot } from "./tracker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/status", (_req, res) => {
  const snap = getSnapshot();
  res.json({
    ccuThreshold: config.ccuThreshold,
    maxMapAgeDays: config.maxMapAgeDays,
    pollIntervalMinutes: config.pollIntervalMinutes,
    discordConfigured: Boolean(config.discordWebhookUrl),
    lastPollAt: snap.lastPollAt,
    lastPollOk: snap.lastPollOk,
    scanned: snap.scanned,
    checked: snap.checked ?? 0,
    error: snap.error,
  });
});

app.get("/api/maps", (_req, res) => {
  res.json(getSnapshot().tracked || []);
});

app.listen(config.port, () => {
  console.log(`[server] dashboard on http://localhost:${config.port}`);
  startTracker().catch((e) => console.error("[server] tracker failed to start:", e));
});
