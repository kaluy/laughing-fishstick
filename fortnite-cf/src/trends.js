const TRENDS = [
  { k: ["steal a brainrot","steal the brainrot","fruits vs brainrots","brainrot"], o: "Roblox — Steal a Brainrot", i: "Steal-and-upgrade tycoon: collect meme 'brainrot' characters that generate cash, defend your base, raid others." },
  { k: ["grow a garden","grow garden"], o: "Roblox — Grow a Garden", i: "Idle gardening: plant seeds, wait, harvest and sell, reinvest in rarer seeds." },
  { k: ["dress to impress","dti"], o: "Roblox — Dress to Impress", i: "Fashion contest: build an outfit to a theme on a timer, then players rate each other." },
  { k: ["fisch","fishing"], o: "Roblox — Fisch", i: "Fishing progression: catch and sell fish, upgrade rods, unlock new spots." },
  { k: ["blade ball"], o: "Roblox — Blade Ball", i: "Reflex duel: parry an accelerating ball back at rivals; last one alive wins." },
  { k: ["99 nights","nights in the forest"], o: "Roblox — 99 Nights in the Forest", i: "Co-op survival across escalating nights in the woods." },
  { k: ["blox fruits","one piece"], o: "Roblox — Blox Fruits", i: "Anime pirate RPG: eat fruits for powers, grind levels, fight sea bosses." },
  { k: ["rainbow friends"], o: "Roblox — Rainbow Friends", i: "Co-op horror: do tasks while hiding from colourful monsters." },
  { k: ["doors"], o: "Roblox — Doors", i: "Horror escape: advance door to door dodging entities." },
  { k: ["murder mystery","mm2"], o: "Roblox — Murder Mystery 2", i: "Social deduction: innocent / sheriff / murderer roles." },
  { k: ["pls donate","please donate"], o: "Roblox — Pls Donate", i: "Social economy: run a stand and give/receive donations." },
  { k: ["a dusty trip","dusty trip"], o: "Roblox — A Dusty Trip", i: "Co-op road-trip survival: keep a car running across a wasteland." },
  { k: ["tower of hell","obby"], o: "Roblox — Tower of Hell", i: "Timed parkour tower with no checkpoints." },
  { k: ["red vs blue","rvb"], o: "Fortnite Creative trend", i: "Large-scale team PvP with progression." },
  { k: ["box fight","boxfight"], o: "Fortnite Creative trend", i: "Small-arena building duels." },
  { k: ["zone wars","zonewars"], o: "Fortnite Creative trend", i: "Shrinking-storm skirmish practice." },
  { k: ["prop hunt","prophunt"], o: "Fortnite Creative trend", i: "Hide disguised as objects while seekers hunt you." },
  { k: ["deathrun","death run"], o: "Fortnite Creative trend", i: "Trap-filled parkour race." },
  { k: ["tycoon"], o: "Fortnite Creative trend", i: "Build-and-earn base that generates income." },
  { k: ["simulator"], o: "Fortnite Creative trend", i: "Repeat an action to grow a stat or number." },
  { k: ["gun game"], o: "Fortnite Creative trend", i: "Cycle through weapons, advancing on each elimination." },
  { k: ["horror"], o: "Fortnite Creative trend", i: "Atmospheric scares / survival horror." },
  { k: ["parkour"], o: "Fortnite Creative trend", i: "Movement and parkour challenge course." },
  { k: ["hide and seek"], o: "Fortnite Creative trend", i: "Classic hide and seek across a themed map." },
];

export function classifyTrend(title = "", desc = "", tags = []) {
  const hay = `${title} ${desc} ${tags.join(" ")}`.toLowerCase();
  for (const t of TRENDS) {
    if (t.k.some(k => hay.includes(k))) return { origin: t.o, idea: t.i };
  }
  return null;
}
