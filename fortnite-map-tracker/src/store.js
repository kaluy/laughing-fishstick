import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, "..", "state.json");

const empty = { initialized: false, firstRunAt: null, lastPollAt: null, maps: {} };

let state = null;

export async function load() {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    state = { ...empty, ...JSON.parse(raw) };
    state.maps = state.maps || {};
  } catch {
    state = structuredClone(empty);
  }
  return state;
}

export async function save() {
  const tmp = `${FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, FILE); // atomic replace
}

export function getState() {
  return state;
}

export function getMap(code) {
  return state.maps[code];
}

export function upsertMap(code, patch) {
  state.maps[code] = { ...(state.maps[code] || { code }), ...patch };
  return state.maps[code];
}
