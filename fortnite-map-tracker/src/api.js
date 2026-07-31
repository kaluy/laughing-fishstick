import { config } from "./config.js";

/**
 * Client for Epic's public Fortnite Ecosystem API.
 *   Base:  https://api.fortnite.com/ecosystem/v1
 *   Auth:  none (public)
 *   Docs:  https://dev.epicgames.com/documentation/fortnite/using-fortnite-data-api-in-fortnite
 *
 * The API is public but Epic's response field names aren't fully pinned down in
 * their public docs, so the extractors below accept several likely key names.
 * If something comes back empty, run `npm run probe` to print the raw shape and
 * add the correct key to the relevant list.
 */

const UA = "fortnite-map-tracker/1.0 (+https://github.com/)";

async function getJson(url, { retries = 3 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { accept: "application/json", "user-agent": UA } });
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(800 * (attempt + 1));
      continue;
    }

    if (res.status === 429) {
      // Rate limited — honour Retry-After if present, otherwise back off.
      const retryAfter = Number(res.headers.get("retry-after")) || 5;
      await sleep(retryAfter * 1000);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const e = new Error(`GET ${url} -> ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
      e.status = res.status;
      throw e;
    }

    return res.json();
  }
  throw new Error(`GET ${url} failed after ${retries} retries`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- extractors (tolerant of naming differences) -------------------------

function firstDefined(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

export function extractList(payload) {
  if (Array.isArray(payload)) return payload;
  return (
    firstDefined(payload, ["islands", "data", "results", "items", "elements"]) || []
  );
}

export function islandCode(island) {
  return firstDefined(island, ["code", "islandCode", "mnemonic", "id"]);
}

export function islandTitle(island) {
  return firstDefined(island, ["title", "name", "displayName"]) || "(untitled)";
}

export function islandCreator(island) {
  const c = firstDefined(island, ["creatorName", "creatorCode", "author", "creator"]);
  if (c && typeof c === "object") return firstDefined(c, ["name", "displayName", "code"]) || "unknown";
  return c || "unknown";
}

/** Returns a Date for when the island was first published, or null if unknown. */
export function islandCreatedDate(island) {
  const raw = firstDefined(island, [
    "createdAt", "created", "createdDate", "creationDate",
    "firstPublished", "firstPublishedDate", "publishedDate", "publishDate",
    "releaseDate", "firstReleaseDate", "dateCreated",
  ]);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function islandDescription(island) {
  return firstDefined(island, ["description", "summary", "tagline", "shortDescription"]) || "";
}

export function islandTags(island) {
  const t = firstDefined(island, ["tags", "categories", "genres", "islandTags"]);
  if (!t) return [];
  if (Array.isArray(t)) return t.map((x) => (typeof x === "object" ? firstDefined(x, ["name", "tag", "value"]) : x)).filter(Boolean);
  if (typeof t === "string") return t.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Find a usable thumbnail/cover URL, handling strings, arrays and nested objects. */
export function islandImage(island) {
  const candidate = firstDefined(island, [
    "image", "imageUrl", "thumbnail", "thumbnailUrl", "coverImage",
    "coverUrl", "cover", "images", "media", "thumbnails",
  ]);
  return firstUrl(candidate);
}

function firstUrl(v) {
  if (!v) return null;
  if (typeof v === "string") return /^https?:\/\//.test(v) ? v : null;
  if (Array.isArray(v)) {
    for (const item of v) {
      const u = firstUrl(item);
      if (u) return u;
    }
    return null;
  }
  if (typeof v === "object") {
    // common nested shapes: {url}, {src}, {thumbnail: {url}}, {cover, thumbnail}
    for (const k of ["url", "src", "href", "cover", "thumbnail", "large", "medium", "small"]) {
      const u = firstUrl(v[k]);
      if (u) return u;
    }
    for (const val of Object.values(v)) {
      const u = firstUrl(val);
      if (u) return u;
    }
  }
  return null;
}

const CCU_KEYS = ["ccu", "concurrentUsers", "concurrent_users", "activePlayers", "active_players",
  "peakCcu", "peakCCU", "peak_ccu", "maxCcu", "peakConcurrentUsers", "peak_concurrent_users"];

function ccuFromObj(obj) {
  const v = firstDefined(obj, CCU_KEYS);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Pull the highest CCU value out of a metrics payload (used for peak mode). */
export function peakCcuFromMetrics(payload) {
  const points = extractList(payload);
  let peak = 0;
  if (Array.isArray(points) && points.length) points.forEach(p => { const n = ccuFromObj(p); if (n > peak) peak = n; });
  else { const n = ccuFromObj(payload); if (n > peak) peak = n; }
  return peak;
}

/**
 * Pull the MOST RECENT CCU value — the last hourly bucket in the time series.
 * This is as close to "live right now" as Epic's API exposes.
 * Falls back to peak if payload is a single object.
 */
export function latestCcuFromMetrics(payload) {
  const points = extractList(payload);
  if (Array.isArray(points) && points.length) {
    const sorted = [...points].sort((a, b) => {
      const ta = new Date(firstDefined(a, ["timestamp","time","date","t"]) || 0).getTime();
      const tb = new Date(firstDefined(b, ["timestamp","time","date","t"]) || 0).getTime();
      return ta - tb;
    });
    return ccuFromObj(sorted[sorted.length - 1]);
  }
  return ccuFromObj(payload);
}

// ---- endpoints ------------------------------------------------------------

/** GET /islands — one page. sortBy is optional; omit to use API default. */
export async function listIslands({ limit = 100, offset = 0, sortBy = null } = {}) {
  const u = new URL(`${config.apiBase}/islands`);
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("offset", String(offset));
  if (sortBy) {
    u.searchParams.set("sortBy", sortBy);
    u.searchParams.set("order", "desc");
  }
  const payload = await getJson(u.toString());
  return extractList(payload);
}

/** Fetch up to `total` islands across pages with an optional sort. */
async function listIslandsBulkSort(total, sortBy = null) {
  const pageSize = 100;
  const out = [];
  for (let offset = 0; out.length < total; offset += pageSize) {
    const page = await listIslands({ limit: pageSize, offset, sortBy });
    if (!page.length) break;
    out.push(...page);
    if (page.length < pageSize) break;
    await sleep(250);
  }
  return out.slice(0, total);
}

/**
 * Multi-pass fetch across known-good sort params, deduplicated.
 * - Pass 1: sortBy=plays  (most popular — almost certain to work)
 * - Pass 2: no sort param (API default, whatever that returns)
 * - Pass 3: sortBy=peakCcu (if the API supports it)
 * Each pass gets half the total quota; duplicates are dropped.
 * If a sort param isn't supported the API usually just ignores it or errors,
 * so unknown params are caught and skipped rather than crashing the poll.
 */
export async function listIslandsBulk(total) {
  const perPass = Math.ceil(total / 2);
  const seen = new Set();
  const out = [];

  const addAll = (islands) => {
    for (const island of islands) {
      const code = islandCode(island);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      out.push(island);
    }
  };

  // Pass 1: by plays — the reliable baseline
  try { addAll(await listIslandsBulkSort(perPass, "plays")); } catch {}

  // Pass 2: no sort (API default order, catches anything pass 1 missed)
  try { addAll(await listIslandsBulkSort(perPass, null)); } catch {}

  return out;
}

/** GET /islands/{code} — full metadata (used to confirm a real publish date). */
export async function getIslandMetadata(code) {
  return getJson(`${config.apiBase}/islands/${encodeURIComponent(code)}`);
}

/**
 * GET /islands/{code}/metrics — recent engagement, including peak CCU.
 * Epic's param names for the date range aren't documented publicly, so we try
 * a few schemes and use whichever the server accepts.
 */
export async function getRecentPeakCcu(code, { days = 1, interval = "hour" } = {}) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10); // YYYY-MM-DD

  const schemes = [
    { from: iso(start), to: iso(end), interval },
    { startDate: iso(start), endDate: iso(end), interval },
    { start: iso(start), end: iso(end), interval },
    { interval }, // last resort: no range
  ];

  let lastErr;
  for (const params of schemes) {
    const u = new URL(`${config.apiBase}/islands/${encodeURIComponent(code)}/metrics`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    try {
      const payload = await getJson(u.toString(), { retries: 1 });
      return peakCcuFromMetrics(payload);
    } catch (err) {
      lastErr = err;
      if (err.status && err.status !== 400 && err.status !== 422) throw err; // only fall through on param errors
    }
  }
  throw lastErr || new Error("metrics request failed");
}

/**
 * GET the most recent hourly CCU bucket — as close to "live right now" as the
 * Fortnite Ecosystem API allows. Requests only the last 2 hours so the most
 * recent data point is always the current hour.
 */
export async function getLiveCcu(code) {
  const end = new Date();
  const start = new Date(end.getTime() - 2 * 3600000); // last 2 hours
  const iso = (d) => d.toISOString().slice(0, 10);

  const schemes = [
    { from: iso(start), to: iso(end), interval: "hour" },
    { startDate: iso(start), endDate: iso(end), interval: "hour" },
    { start: iso(start), end: iso(end), interval: "hour" },
    { interval: "hour" },
  ];

  let lastErr;
  for (const params of schemes) {
    const u = new URL(`${config.apiBase}/islands/${encodeURIComponent(code)}/metrics`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    try {
      const payload = await getJson(u.toString(), { retries: 1 });
      return latestCcuFromMetrics(payload);
    } catch (err) {
      lastErr = err;
      if (err.status && err.status !== 400 && err.status !== 422) throw err;
    }
  }
  throw lastErr || new Error("live ccu request failed");
}
