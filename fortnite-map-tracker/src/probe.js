import { config } from "./config.js";
import * as api from "./api.js";
import { classifyTrend } from "./trends.js";

/**
 * Diagnostic: confirms the API is reachable and prints the real response shape
 * so you can verify (and if needed adjust) the field names used in api.js.
 * Run with: npm run probe
 */
async function main() {
  console.log("Base URL:", config.apiBase, "\n");

  console.log("→ Fetching one page of islands…");
  const islands = await api.listIslands({ limit: 3, offset: 0 });
  console.log(`Got ${islands.length} island(s).`);
  if (!islands.length) {
    console.log("No islands returned. The list endpoint or its params may differ — inspect the raw response.");
    return;
  }

  const sample = islands[0];
  console.log("\nFirst island (raw):");
  console.log(JSON.stringify(sample, null, 2));

  const code = api.islandCode(sample);
  console.log("\nParsed:");
  console.log("  code        :", code);
  console.log("  title       :", api.islandTitle(sample));
  console.log("  creator     :", api.islandCreator(sample));
  console.log("  publishDate :", api.islandCreatedDate(sample) || "(not found — will fall back to first-seen)");

  if (code) {
    console.log(`\n→ Fetching full metadata for ${code}…`);
    try {
      const meta = await api.getIslandMetadata(code);
      const description = api.islandDescription(meta);
      const tags = api.islandTags(meta);
      const image = api.islandImage(meta);
      console.log("  description :", description ? description.slice(0, 100) + "…" : "(not found)");
      console.log("  tags        :", tags.length ? tags.join(", ") : "(not found)");
      console.log("  thumbnail   :", image || "(not found — check image field names in api.js)");
      const trend = classifyTrend({ title: api.islandTitle(meta) || api.islandTitle(sample), description, tags });
      console.log("  trend guess :", trend ? `${trend.origin} — ${trend.idea}` : "(no keyword match; AI classifier would handle this if enabled)");
    } catch (err) {
      console.log("  metadata lookup failed:", err.message);
    }

    console.log(`\n→ Fetching recent metrics for ${code}…`);
    try {
      const peak = await api.getRecentPeakCcu(code, { days: 1, interval: "hour" });
      console.log("  recent peak CCU:", peak);
    } catch (err) {
      console.log("  metrics lookup failed:", err.message);
      console.log("  (Check the metrics param scheme / field names in api.js.)");
    }
  }

  console.log("\nDone. If any parsed field above is wrong, add the correct key to the matching list in src/api.js.");
}

main().catch((e) => {
  console.error("Probe failed:", e.message);
  process.exit(1);
});
