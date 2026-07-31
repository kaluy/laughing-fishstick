# Fortnite Map Watch — Cloudflare Workers

Runs entirely on Cloudflare's free plan:
- **Worker** serves the dashboard and API
- **Cron Trigger** polls every 10 minutes
- **KV** stores state between polls

No Railway, no VPS, no always-on computer needed. Cloudflare's IPs are not blocked by Epic.

---

## Deploy steps

### 1. Install Wrangler
```bash
npm install
```

### 2. Log in to Cloudflare
```bash
npx wrangler login
```
This opens a browser to authorise Wrangler with your Cloudflare account (free account is fine).

### 3. Create the KV namespace
```bash
npx wrangler kv namespace create MAP_STATE
```
It prints something like:
```
id = "abc123def456..."
```
Copy that id and paste it into `wrangler.toml`, replacing `PASTE_KV_ID_HERE`.

### 4. Add your Discord webhook as a secret
```bash
npx wrangler secret put DISCORD_WEBHOOK_URL
```
Paste your webhook URL when prompted. It's stored encrypted — never in your code.

### 5. Deploy
```bash
npx wrangler deploy
```
Done. Wrangler prints your worker URL, e.g. `https://fortnite-map-tracker.YOUR-NAME.workers.dev`.

---

## First poll

The cron runs every 10 minutes automatically. To trigger it immediately, open:
```
https://fortnite-map-tracker.YOUR-NAME.workers.dev/api/poll
```

The first poll is silent — it records the current map catalog without alerting.
Alerts fire from the second poll onward.

---

## Environment variables (optional overrides)

Set these with `npx wrangler secret put VARIABLE_NAME`:

| Variable | Default | Meaning |
|---|---|---|
| `CCU_THRESHOLD` | `200` | Alert when live CCU reaches this |
| `MAX_MAP_AGE_DAYS` | `14` | Only watch maps this many days old or newer |
| `ISLANDS_PER_POLL` | `500` | How many islands to scan each poll |

---

## Dashboard

Open your worker URL in a browser. It refreshes every 30 seconds and shows every new map currently in view with its live CCU, thumbnail, and trend label.
