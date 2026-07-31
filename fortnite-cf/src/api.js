const BASE = "https://api.fortnite.com/ecosystem/v1";

async function getJson(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.status === 429) { await sleep(3000); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(800 * (i + 1));
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = (o, ks) => { for (const k of ks) if (o?.[k] != null) return o[k]; };
const listOf = p => Array.isArray(p) ? p : (pick(p, ["islands","data","results","items"]) || []);

export const islandCode   = i => pick(i, ["code","islandCode","mnemonic","id"]);
export const islandTitle  = i => pick(i, ["title","name","displayName"]) || "(untitled)";
export const islandCreator= i => { const c = pick(i, ["creatorName","author","creator"]); return (c && typeof c === "object") ? (pick(c, ["name","code"]) || "unknown") : (c || "unknown"); };
export const islandDesc   = i => pick(i, ["description","summary","tagline"]) || "";
export const islandTags   = i => { const t = pick(i, ["tags","categories","genres"]); if (!t) return []; if (Array.isArray(t)) return t.map(x => typeof x === "object" ? pick(x,["name","tag","value"]) : x).filter(Boolean); return typeof t === "string" ? t.split(",").map(s=>s.trim()) : []; };

function urlIn(v) {
  if (!v) return null;
  if (typeof v === "string") return /^https?:\/\//.test(v) ? v : null;
  if (Array.isArray(v)) { for (const x of v) { const u = urlIn(x); if (u) return u; } return null; }
  if (typeof v === "object") { for (const k of ["url","src","cover","thumbnail","large","medium"]) { const u = urlIn(v[k]); if (u) return u; } }
  return null;
}
export const islandImage  = i => urlIn(pick(i, ["image","imageUrl","thumbnail","thumbnailUrl","coverImage","coverUrl","images","media"]));
export function islandCreatedDate(i) {
  const r = pick(i, ["createdAt","created","createdDate","firstPublished","publishedDate","releaseDate","dateCreated"]);
  if (!r) return null;
  const d = new Date(r);
  return isNaN(d) ? null : d;
}

function latestCcu(payload) {
  const CCU_KEYS = ["ccu","concurrentUsers","concurrent_users","activePlayers","active_players","peakCcu","peakCCU"];
  const pts = listOf(payload);
  const ccuOf = o => { const v = pick(o, CCU_KEYS); const n = Number(v); return isFinite(n) ? n : 0; };
  if (pts.length) {
    const sorted = [...pts].sort((a,b) => new Date(pick(a,["timestamp","time","date","t"])||0) - new Date(pick(b,["timestamp","time","date","t"])||0));
    return ccuOf(sorted[sorted.length - 1]);
  }
  return ccuOf(payload);
}

export async function listIslands(limit = 100, offset = 0) {
  const u = new URL(`${BASE}/islands`);
  u.searchParams.set("limit", limit);
  u.searchParams.set("offset", offset);
  u.searchParams.set("sortBy", "plays");
  u.searchParams.set("order", "desc");
  return listOf(await getJson(u.toString()));
}

export async function getMetadata(code) {
  return getJson(`${BASE}/islands/${encodeURIComponent(code)}`);
}

export async function getLiveCcu(code) {
  const end = new Date(), start = new Date(Date.now() - 2 * 3600000);
  const iso = d => d.toISOString().slice(0, 10);
  for (const q of [
    `from=${iso(start)}&to=${iso(end)}&interval=hour`,
    `startDate=${iso(start)}&endDate=${iso(end)}&interval=hour`,
    `interval=hour`,
  ]) {
    try { return latestCcu(await getJson(`${BASE}/islands/${encodeURIComponent(code)}/metrics?${q}`, 1)); }
    catch {}
  }
  return 0;
}
