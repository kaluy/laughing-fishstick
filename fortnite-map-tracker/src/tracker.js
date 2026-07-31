import { config } from "./config.js";
import * as api from "./api.js";
import * as store from "./store.js";
import { sendMapAlert } from "./discord.js";
import { classifyTrend } from "./trends.js";
import { classifyWithClaude } from "./ai.js";

const DAY = 86400000;

let snapshot = { lastPollAt: null, lastPollOk: null, scanned: 0, tracked: [], error: null };

export function getSnapshot() {
  return snapshot;
}

function ageDaysFrom(map) {
  // Prefer a real publish date; fall back to when we first saw it.
  const basis = map.createdDate ? new Date(map.createdDate) : new Date(map.firstSeen);
  return (Date.now() - basis.getTime()) / DAY;
}

/**
 * A map qualifies as "new" if it's within the age window AND we can trust that
 * it's genuinely new — i.e. it either reports a real publish date, or we first
 * saw it appear after the tracker was already running (not part of the initial
 * catalog snapshot).
 */
function isNew(map) {
  const age = ageDaysFrom(map);
  if (age > config.maxMapAgeDays) return false;
  if (map.createdDate) return true;
  if (map.preExisting && !config.alertOnFirstRun) return false;
  return true;
}

// tiny concurrency limiter for metrics lookups
async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function pollOnce() {
  const state = store.getState();
  const firstRun = !state.initialized;
  if (firstRun) {
    state.initialized = true;
    state.firstRunAt = new Date().toISOString();
  }

  let islands;
  try {
    islands = await api.listIslandsBulk(config.islandsPerPoll);
  } catch (err) {
    snapshot = { ...snapshot, lastPollAt: new Date().toISOString(), lastPollOk: false, error: err.message };
    console.error("[tracker] failed to list islands:", err.message);
    return;
  }

  const nowIso = new Date().toISOString();

  // 1. Record/refresh every island we can see.
  for (const island of islands) {
    const code = api.islandCode(island);
    if (!code) continue;

    const existing = store.getMap(code);
    const created = api.islandCreatedDate(island);

    if (!existing) {
      store.upsertMap(code, {
        code,
        title: api.islandTitle(island),
        creator: api.islandCreator(island),
        firstSeen: nowIso,
        createdDate: created ? created.toISOString() : null,
        // On the very first run, anything without a real publish date is treated
        // as pre-existing so we don't alert on the whole back catalogue at once.
        preExisting: firstRun && !created,
        alerted: false,
      });
    } else {
      store.upsertMap(code, {
        title: api.islandTitle(island),
        creator: api.islandCreator(island),
        createdDate: existing.createdDate || (created ? created.toISOString() : null),
      });
    }
  }

  // 2. Candidates: new, not yet alerted.
  const candidates = islands
    .map((i) => store.getMap(api.islandCode(i)))
    .filter(Boolean)
    .filter((m) => !m.alerted && isNew(m));

  // 3. For each candidate: enrich (name, thumbnail, what it's based on), then
  //    look up recent peak CCU. Only candidates are touched, so request volume
  //    stays low.
  const checked = [];
  await mapLimit(candidates, config.metricsConcurrency, async (m) => {
    // 3a. Enrich once — pull description/tags/thumbnail + a real publish date,
    //     and detect the trend it's riding.
    if (!m.enriched) {
      try {
        const meta = await api.getIslandMetadata(m.code);
        const description = api.islandDescription(meta);
        const tags = api.islandTags(meta);
        const image = api.islandImage(meta);
        const created = api.islandCreatedDate(meta);
        const trend = classifyTrend({ title: api.islandTitle(meta) || m.title, description, tags });
        m = store.upsertMap(m.code, {
          title: api.islandTitle(meta) || m.title,
          creator: api.islandCreator(meta) || m.creator,
          description,
          tags,
          image: image || m.image || null,
          createdDate: m.createdDate || (created ? created.toISOString() : null),
          trend: trend || m.trend || null,
          enriched: true,
        });
      } catch (err) {
        console.warn(`[tracker] metadata lookup failed for ${m.code}: ${err.message}`);
      }
    }

    // 3b. Recent peak CCU.
    let peak = 0;
    try {
      peak = await api.getRecentPeakCcu(m.code, { days: 1, interval: "hour" });
    } catch (err) {
      console.warn(`[tracker] metrics lookup failed for ${m.code}: ${err.message}`);
      return;
    }
    m = store.upsertMap(m.code, { peakCcu: peak, lastCheckedAt: nowIso });
    m.ageDays = ageDaysFrom(m);
    checked.push(m);

    // 4. Alert if it crossed the threshold (and hasn't been alerted before).
    if (peak >= config.ccuThreshold && !m.alerted) {
      // If the keyword list didn't recognise it, ask Claude (optional).
      let trend = m.trend;
      if (!trend) {
        trend = await classifyWithClaude({ title: m.title, description: m.description, tags: m.tags });
        if (trend) m = store.upsertMap(m.code, { trend });
      }
      const ok = await sendMapAlert(m);
      store.upsertMap(m.code, { alerted: true, alertedAt: nowIso, alertDelivered: ok });
      console.log(
        `[tracker] ALERT ${m.code} "${m.title}" peak=${peak}` +
        `${trend ? ` [${trend.origin}]` : ""}${ok ? "" : " (delivery failed)"}`
      );
    }
  });

  state.lastPollAt = nowIso;
  await store.save();

  // 5. Publish a dashboard snapshot: current new maps + anything already alerted.
  const tracked = Object.values(state.maps)
    .filter((m) => m.alerted || isNew(m))
    .map((m) => ({
      code: m.code,
      title: m.title,
      creator: m.creator,
      image: m.image || null,
      trend: m.trend || null,
      peakCcu: m.peakCcu ?? null,
      ageDays: Number(ageDaysFrom(m).toFixed(2)),
      hasPublishDate: !!m.createdDate,
      alerted: !!m.alerted,
      alertedAt: m.alertedAt || null,
      firstSeen: m.firstSeen,
    }))
    .sort((a, b) => (b.peakCcu ?? -1) - (a.peakCcu ?? -1));

  snapshot = {
    lastPollAt: nowIso,
    lastPollOk: true,
    scanned: islands.length,
    checked: checked.length,
    tracked,
    error: null,
  };

  console.log(
    `[tracker] poll done: scanned ${islands.length}, checked ${checked.length} new candidate(s), ` +
    `${tracked.filter((t) => t.alerted).length} alerted total`
  );
}

export async function start() {
  await store.load();
  console.log(
    `[tracker] watching for maps <= ${config.maxMapAgeDays}d old that reach ` +
    `${config.ccuThreshold}+ CCU. Polling every ${config.pollIntervalMinutes} min.`
  );
  await pollOnce();
  setInterval(() => {
    pollOnce().catch((e) => console.error("[tracker] poll crashed:", e));
  }, config.pollIntervalMinutes * 60 * 1000);
}
