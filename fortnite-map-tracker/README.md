# Fortnite Map Watch

Watches Epic's public **Fortnite Ecosystem API**, spots **newly published maps**
(≤ 7 days old by default), and the moment one reaches **200+ concurrent players**
it fires a **Discord alert** and shows it on a live **web dashboard**.

Each alert includes the map **name**, its **thumbnail**, peak players, age, creator,
the island code, and — where it can tell — **what the map is based on** (e.g. the
Roblox game it clones or the trend it's riding) plus a one-line **idea behind it**.

- Data source: `https://api.fortnite.com/ecosystem/v1` — official, public, no API key.
- Notifications: a Discord **webhook** (no bot token, no gateway, no hosting a bot).
- Dashboard: a small self-hosted page at `http://localhost:3000`.

## Setup

Requires Node.js 18+ (uses built-in `fetch`).

```bash
cp .env.example .env      # then open .env and paste your Discord webhook URL
npm install
npm run probe             # optional but recommended — see below
npm start
```

Open http://localhost:3000.

### Getting a Discord webhook URL
In Discord: **Server Settings → Integrations → Webhooks → New Webhook**, pick the
channel you want alerts in, then **Copy Webhook URL** and paste it into `.env` as
`DISCORD_WEBHOOK_URL`.

## Configuration (`.env`)

| Setting | Default | Meaning |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | — | Where alerts are posted. |
| `CCU_THRESHOLD` | `200` | Alert when a new map's peak concurrent players hits this. |
| `MAX_MAP_AGE_DAYS` | `7` | A map only counts as "new" up to this age. |
| `POLL_INTERVAL_MINUTES` | `10` | How often to scan. |
| `ISLANDS_PER_POLL` | `300` | How many islands to scan each pass (busiest first). |
| `ALERT_ON_FIRST_RUN` | `false` | See "First run" below. |
| `PORT` | `3000` | Dashboard port. |

## How "new" is decided

Each map is alerted **at most once**. A map qualifies as new when it's within the
age window **and** the tracker can trust it's genuinely new — either because the API
reports a real publish date, or because the map first appeared *after* the tracker
was already running.

**First run:** on the very first scan the tracker can't tell which existing maps are
new, so it silently records the current catalogue and only alerts on maps that show
up afterwards (or that report a real publish date inside the window). Set
`ALERT_ON_FIRST_RUN=true` to override. State is saved to `state.json`, so restarts
pick up where you left off.

## What a map is "based on"

Fortnite's biggest new maps are usually clones of a viral Roblox game or ride a
recognisable Creative trend. The tracker labels each alert with the likely origin
and the core idea:

- **Built-in keyword list** (`src/trends.js`) — recognises current trends out of the
  box: the brainrot wave (*Steal a Brainrot* → *Steal the Brainrot*, *Fruits vs
  Brainrots*…), *Grow a Garden*, *Dress to Impress*, *Fisch*, *Blade Ball*, plus
  homegrown Fortnite formats (box fights, zone wars, prop hunt, tycoons, …). Edit
  this file to add new trends as they emerge — it's just a list.
- **Optional AI classifier** (`src/ai.js`) — set `ANTHROPIC_API_KEY` and the tracker
  will ask Claude to identify anything the keyword list doesn't know. This is what
  names a **brand-new** trend the first time a map rides it. Without a key, unknown
  maps simply alert without a "based on" label. Uses a cheap model by default
  (`ANTHROPIC_MODEL`, defaults to Haiku) and only runs at alert time, so cost is tiny.

## Deploy as a website (hosted, always-on)

The dashboard is already a website — it just needs to run somewhere that stays on,
so the poller keeps checking and Discord alerts keep firing when your own computer
is off. The whole app (dashboard + poller) is one process, so any host that runs a
Node web service works. A `Dockerfile`, `.dockerignore` and `render.yaml` are included.

Pick a host that **stays running** — free tiers that sleep when idle will pause the
poller, so you'd miss alerts. Options that keep a process alive include Railway,
Fly.io, or a paid Render/VPS instance.

**General steps (any host):**
1. Put this folder in a GitHub repo (or deploy the folder directly if the host supports it).
2. Create a new **web service** from that repo. The included `Dockerfile` handles the build; hosts also auto-detect Node (`npm install` / `npm start`).
3. In the host's dashboard, add your environment variables — at minimum `DISCORD_WEBHOOK_URL`. Copy the rest from `.env.example` (defaults are fine). Don't upload your `.env` file; set these in the host instead.
4. Deploy. The host gives you a public URL — open it to see the live dashboard. The poller starts automatically and alerts your Discord channel.

You don't need to set `PORT` — hosts provide it and the app uses it automatically.

Note: on hosts with an ephemeral filesystem, `state.json` (the "maps already seen"
memory) resets on redeploy. That won't spam you — a reset just re-seeds silently —
but a map that turned new during the redeploy gap might not alert. Add a persistent
disk/volume mounted at the project root if you want that memory to survive redeploys.

## `npm run probe`

Epic's docs don't fully pin down their JSON field names, so the API client in
`src/api.js` accepts several likely names for each field (island code, creator,
publish date, peak CCU). `npm run probe` hits the live API once and prints the raw
response plus what got parsed. If anything shows as blank or wrong, add the correct
key to the matching list at the top of `src/api.js` — no other changes needed.

## Running it 24/7

The alerting only works while the process is running. Options:
- **pm2:** `npm i -g pm2 && pm2 start src/server.js --name map-watch`
- **systemd**, a small VPS, Railway/Render/Fly, or any always-on box.
- A laptop that sleeps will pause the watch — that's fine for testing, not for coverage.

## Notes

- Discovery data is per-island peak CCU; a brand-new map may take a scan or two to
  register measurable traffic.
- Respect Epic's rate limits — the defaults are gentle; if you raise
  `ISLANDS_PER_POLL` a lot, also raise `POLL_INTERVAL_MINUTES`.
- Not affiliated with or endorsed by Epic Games.
