import * as api from "./api.js";
import { classifyTrend } from "./trends.js";
import { sendAlert } from "./discord.js";

const DAY = 86400000;

function ageDays(map) {
  const basis = map.createdDate ? new Date(map.createdDate) : new Date(map.firstSeen);
  return (Date.now() - basis.getTime()) / DAY;
}

function isNew(map, maxDays) {
  const age = ageDays(map);
  if (age > maxDays) return false;
  if (map.createdDate) return true;
  if (map.preExisting) return false;
  return true;
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

export async function runPoll(env) {
  const cfg = {
    threshold:  Number(env.CCU_THRESHOLD  || 200),
    maxDays:    Number(env.MAX_MAP_AGE_DAYS || 14),
    scanCount:  Number(env.ISLANDS_PER_POLL || 500),
    webhook:    env.DISCORD_WEBHOOK_URL || "",
  };

  // Load state from KV
  const raw = await env.MAP_STATE.get("state");
  const state = raw ? JSON.parse(raw) : { initialized: false, maps: {} };
  const firstRun = !state.initialized;
  if (firstRun) state.initialized = true;

  const now = new Date().toISOString();

  // 1. Fetch islands
  const islands = [];
  const pageSize = 100;
  for (let offset = 0; islands.length < cfg.scanCount; offset += pageSize) {
    const page = await api.listIslands(pageSize, offset).catch(() => []);
    if (!page.length) break;
    islands.push(...page);
    if (page.length < pageSize) break;
    await new Promise(r => setTimeout(r, 200));
  }

  // 2. Record every island
  for (const isl of islands) {
    const code = api.islandCode(isl);
    if (!code) continue;
    const created = api.islandCreatedDate(isl);
    if (!state.maps[code]) {
      state.maps[code] = {
        code,
        title: api.islandTitle(isl),
        creator: api.islandCreator(isl),
        firstSeen: now,
        createdDate: created ? created.toISOString() : null,
        preExisting: firstRun && !created,
        alerted: false,
      };
    } else {
      const m = state.maps[code];
      m.title = api.islandTitle(isl);
      m.creator = api.islandCreator(isl);
      if (!m.createdDate && created) m.createdDate = created.toISOString();
    }
  }

  // 3. Candidates: all maps within the age window
  const candidates = islands
    .map(i => state.maps[api.islandCode(i)])
    .filter(Boolean)
    .filter(m => isNew(m, cfg.maxDays));

  let alertCount = 0;
  await mapLimit(candidates, 4, async (m) => {
    // Enrich once
    if (!m.enriched) {
      try {
        const meta = await api.getMetadata(m.code);
        m.title      = api.islandTitle(meta)   || m.title;
        m.creator    = api.islandCreator(meta)  || m.creator;
        m.description= api.islandDesc(meta);
        m.tags       = api.islandTags(meta);
        m.image      = api.islandImage(meta)    || null;
        const c      = api.islandCreatedDate(meta);
        if (!m.createdDate && c) m.createdDate = c.toISOString();
        m.trend      = classifyTrend(m.title, m.description, m.tags) || null;
        m.enriched   = true;
      } catch {}
    }

    // Live CCU
    const ccu = await api.getLiveCcu(m.code).catch(() => 0);
    m.ccu = ccu;
    m.lastChecked = now;
    m.ageDays = ageDays(m);

    // Alert if crossed threshold and not yet alerted
    if (ccu >= cfg.threshold && !m.alerted) {
      await sendAlert(m, cfg.webhook, cfg.threshold);
      m.alerted = true;
      m.alertedAt = now;
      alertCount++;
      console.log(`[alert] ${m.code} "${m.title}" ccu=${ccu}`);
    }
  });

  // Prune maps older than 30 days to keep KV small
  for (const code of Object.keys(state.maps)) {
    if (ageDays(state.maps[code]) > 30) delete state.maps[code];
  }

  state.lastPollAt = now;
  state.lastScan = islands.length;
  state.scanned = islands.length;
  state.lastChecked = candidates.length;
  state.checked = candidates.length;
  state.alertTotal = Object.values(state.maps).filter(m => m.alerted).length;

  await env.MAP_STATE.put("state", JSON.stringify(state));
  console.log(`[poll] scanned=${islands.length} candidates=${candidates.length} alerts=${alertCount}`);
  return state;
}
