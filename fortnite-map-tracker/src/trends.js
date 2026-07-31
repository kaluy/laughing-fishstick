/**
 * Rule-based trend detection.
 *
 * Fortnite Creative's biggest maps are usually clones of a viral Roblox game or
 * ride a recognisable Creative trend. This maps recognisable keywords in a map's
 * title / description / tags to what it's based on and the idea behind it.
 *
 * Ordered most-specific (branded Roblox clones) first, most-generic last — the
 * first match wins. Keep it current; new trends appear constantly. If the AI
 * classifier is enabled (see ai.js), it fills in whatever the rules miss.
 */

const TRENDS = [
  // ---- Roblox originals being cloned into Fortnite ----
  {
    keywords: ["steal a brainrot", "steal the brainrot", "fruits vs brainrots", "escape tsunami for brainrots", "brainrot", "brainrots"],
    origin: "Roblox — Steal a Brainrot",
    idea: "Steal-and-upgrade tycoon: collect meme 'brainrot' characters that generate cash, defend your base, and raid other players' collections.",
    confidence: "high",
  },
  {
    keywords: ["grow a garden", "grow garden", "garden tycoon"],
    origin: "Roblox — Grow a Garden",
    idea: "Idle gardening sim: plant seeds, wait for them to grow, harvest and sell, then reinvest in rarer seeds and mutations.",
    confidence: "high",
  },
  {
    keywords: ["dress to impress", "dti", "fashion show"],
    origin: "Roblox — Dress to Impress",
    idea: "Fashion competition: assemble an outfit to a theme against the clock, then players rate each other's looks.",
    confidence: "high",
  },
  {
    keywords: ["fisch", "fishing"],
    origin: "Roblox — Fisch",
    idea: "Fishing progression: catch and sell fish, upgrade rods, and unlock new spots and rare species.",
    confidence: "medium",
  },
  { keywords: ["blade ball"], origin: "Roblox — Blade Ball", idea: "Reflex deflection duel: parry an accelerating ball back at rivals; last one alive wins.", confidence: "high" },
  { keywords: ["99 nights", "nights in the forest"], origin: "Roblox — 99 Nights in the Forest", idea: "Co-op survival: gather resources and outlast escalating nights in the woods.", confidence: "high" },
  { keywords: ["blox fruits", "one piece", "sea of fruits"], origin: "Roblox — Blox Fruits", idea: "Anime pirate RPG: eat fruits for powers, grind levels, and fight sea bosses.", confidence: "medium" },
  { keywords: ["rivals"], origin: "Roblox — Rivals", idea: "Hero-shooter style competitive FPS with distinct character abilities.", confidence: "medium" },
  { keywords: ["doors"], origin: "Roblox — Doors", idea: "Horror escape: advance door to door through a haunted hotel while dodging entities.", confidence: "medium" },
  { keywords: ["rainbow friends"], origin: "Roblox — Rainbow Friends", idea: "Co-op horror: complete tasks while hiding from colourful monsters.", confidence: "high" },
  { keywords: ["pls donate", "please donate"], origin: "Roblox — Pls Donate", idea: "Social economy: run a stand and give/receive donations.", confidence: "high" },
  { keywords: ["sol's rng", "sols rng", " rng"], origin: "Roblox — Sol's RNG", idea: "Luck grind: roll for ultra-rare 'auras' with escalating odds.", confidence: "medium" },
  { keywords: ["tower of hell", "obby"], origin: "Roblox — Tower of Hell (obby)", idea: "Timed vertical parkour with no checkpoints — one fall sends you back down.", confidence: "medium" },
  { keywords: ["murder mystery", "mm2"], origin: "Roblox — Murder Mystery 2", idea: "Social deduction with innocent / sheriff / murderer roles.", confidence: "high" },
  { keywords: ["adopt me"], origin: "Roblox — Adopt Me", idea: "Pet-raising and trading roleplay.", confidence: "high" },
  { keywords: ["brookhaven"], origin: "Roblox — Brookhaven", idea: "Open-ended town roleplay.", confidence: "high" },
  { keywords: ["a dusty trip", "dusty trip"], origin: "Roblox — A Dusty Trip", idea: "Co-op road-trip survival: keep a car running across a wasteland while scavenging.", confidence: "high" },
  { keywords: ["dig it", " dig ", "digging"], origin: "Roblox — Dig", idea: "Dig-for-treasure loop: mine materials, sell them, and upgrade your shovel.", confidence: "low" },

  // ---- Homegrown Fortnite Creative trends (not from Roblox) ----
  { keywords: ["red vs blue", "rvb"], origin: "Fortnite Creative trend", idea: "Large-scale team PvP with weapon and rank progression.", confidence: "medium" },
  { keywords: ["box fight", "boxfight"], origin: "Fortnite Creative trend", idea: "Small-arena building duels (1v1/2v2/4v4).", confidence: "medium" },
  { keywords: ["zone wars", "zonewars"], origin: "Fortnite Creative trend", idea: "Shrinking-storm skirmish practice with rotating loadouts.", confidence: "medium" },
  { keywords: ["build fight", "1v1"], origin: "Fortnite Creative trend", idea: "Head-to-head build-battle duels.", confidence: "low" },
  { keywords: ["prop hunt", "prophunt"], origin: "Fortnite Creative trend", idea: "Hide disguised as objects while seekers hunt you down.", confidence: "high" },
  { keywords: ["hide and seek"], origin: "Fortnite Creative trend", idea: "Classic hide and seek across a themed map.", confidence: "medium" },
  { keywords: ["deathrun", "death run"], origin: "Fortnite Creative trend", idea: "Trap-filled parkour race to the finish.", confidence: "high" },
  { keywords: ["escape room", "escape "], origin: "Fortnite Creative trend", idea: "Puzzle-solving room-escape.", confidence: "low" },
  { keywords: ["tycoon"], origin: "Fortnite Creative trend", idea: "Build-and-earn base that generates income to reinvest.", confidence: "low" },
  { keywords: ["simulator"], origin: "Fortnite Creative trend", idea: "Repeat a simple action to grow a stat or number.", confidence: "low" },
  { keywords: ["clicker", "idle "], origin: "Fortnite Creative trend", idea: "Idle/incremental progression — numbers go up over time.", confidence: "low" },
  { keywords: ["tower defense", " td "], origin: "Fortnite Creative trend", idea: "Place units to stop waves of enemies.", confidence: "medium" },
  { keywords: ["horror"], origin: "Fortnite Creative trend", idea: "Atmospheric scares / survival horror.", confidence: "low" },
  { keywords: ["parkour"], origin: "Fortnite Creative trend", idea: "Movement and parkour challenge course.", confidence: "low" },
  { keywords: ["gun game"], origin: "Fortnite Creative trend", idea: "Cycle through weapons, advancing on each elimination.", confidence: "medium" },
  { keywords: ["free for all", "ffa"], origin: "Fortnite Creative trend", idea: "Everyone-versus-everyone combat.", confidence: "low" },
  { keywords: ["piece control", "edit course", "aim trainer", "aim map"], origin: "Fortnite Creative trend", idea: "Mechanics trainer for editing, piece control, or aim.", confidence: "medium" },
];

/**
 * Classify a map from its text. Returns { origin, idea, confidence, source, matched }
 * or null if nothing matched.
 */
export function classifyTrend({ title = "", description = "", tags = [] } = {}) {
  const hay = `${title} ${description} ${Array.isArray(tags) ? tags.join(" ") : tags}`.toLowerCase();
  for (const t of TRENDS) {
    const hit = t.keywords.find((k) => hay.includes(k));
    if (hit) {
      return { origin: t.origin, idea: t.idea, confidence: t.confidence, source: "known trend", matched: hit.trim() };
    }
  }
  return null;
}
