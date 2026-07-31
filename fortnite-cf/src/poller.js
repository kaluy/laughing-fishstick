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
    scanCount:  Number(env.ISLANDS_PER_POLL || 5000), // max safety cap
    webhook:    env.DISCORD_WEBHOOK_URL || "",
  };

  // Load state from KV
  const raw = await env.MAP_STATE.get("state");
  const state = raw ? JSON.parse(raw) : { initialized: false, maps: {} };
  const firstRun = !state.initialized;
  if (firstRun) state.initialized = true;

  const now = new Date().toISOString();

  // 1. Fetch ALL islands paginated, but stop as soon as every island on a page
  //    is older than the age window — since the API returns newest first when
  //    sorted by createdAt (or falls back to plays), we can stop early.
  //    We run pages in parallel batches of 5 for speed.
  const islands = [];
  const pageSize = 100;
  const cutoff = Date.now() - cfg.maxDays * DAY;
  const BATCH = 5;
  let offset = 0;
  let keepGoing = true;

  while (keepGoing) {
    const offsets = Array.from({length: BATCH}, (_, i) => offset + i * pageSize);
    offset += BATCH * pageSize;

    const pages = await Promise.all(offsets.map(off => api.listIslandsByDate(pageSize, off).catch(() => [])));

    for (const page of pages) {
      if (!page.length) { keepGoing = false; break; }
      for (const isl of page) {
        const created = api.islandCreatedDate(isl);
        // If the island has a publish date and it's within the window, keep it.
        // If it has no publish date, keep it (we'll re-evaluate after enrichment).
        if (!created || created.getTime() >= cutoff) {
          islands.push(isl);
        }
      }
      // If the entire page's dated islands are all older than the window,
      // we can stop — but only if more than half have dates (avoid early exit on undated maps).
      const dated = page.filter(i => api.islandCreatedDate(i));
      const allOld = dated.length > page.length / 2 && dated.every(i => api.islandCreatedDate(i).getTime() < cutoff);
      if (allOld || page.length < pageSize) { keepGoing = false; break; }
    }

    // Safety cap — never scan more than 5000 islands total
    if (islands.length >= 5000 || offset > 5000) keepGoing = false;
  }

  console.log(\`[poll] found \${islands.length} islands within \${cfg.maxDays}d window\`);

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

  // 3. Candidates: maps within the age window, prioritising ones not recently checked.
  // We skip CCU lookup for maps checked in the last 8 min to stay within CF's 30s CPU limit.
  const RECHECK_MS = 8 * 60 * 1000;
  const allNew = islands
    .map(i => state.maps[api.islandCode(i)])
    .filter(Boolean)
    .filter(m => isNew(m, cfg.maxDays));

  // Always check un-alerted maps; throttle already-seen ones
  const candidates = allNew.filter(m =>
    !m.alerted ||
    !m.lastChecked ||
    (Date.now() - new Date(m.lastChecked).getTime()) > RECHECK_MS
  ).slice(0, 80); // hard cap: 80 CCU lookups max per poll to stay under timeout

  let alertCount = 0;
  await mapLimit(candidates, 6, async (m) => {
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
