import { runPoll } from "./poller.js";

// ---- cron trigger (every 10 min) ----
async function handleScheduled(env) {
  await runPoll(env);
}

// ---- HTTP: dashboard + status API ----
async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/status") {
    const raw = await env.MAP_STATE.get("state");
    const state = raw ? JSON.parse(raw) : {};
    return json({
      lastPollAt:   state.lastPollAt   || null,
      scanned:      state.lastScan || state.scanned || 0,
      checked:      state.lastChecked || state.checked || 0,
      alertTotal:   state.alertTotal   || 0,
      discordConfigured: Boolean(env.DISCORD_WEBHOOK_URL),
      ccuThreshold: Number(env.CCU_THRESHOLD || 200),
      maxMapAgeDays:Number(env.MAX_MAP_AGE_DAYS || 14),
      pollInterval: 10,
    });
  }

  if (url.pathname === "/api/maps") {
    const raw = await env.MAP_STATE.get("state");
    const state = raw ? JSON.parse(raw) : { maps: {} };
    const DAY = 86400000;
    const maxDays = Number(env.MAX_MAP_AGE_DAYS || 14);
    const maps = Object.values(state.maps)
      .filter(m => m.alerted || (ageDays(m) <= maxDays))
      .map(m => ({
        code:      m.code,
        title:     m.title,
        creator:   m.creator,
        image:     m.image || null,
        trend:     m.trend || null,
        ccu:       m.ccu ?? null,
        ageDays:   +ageDays(m).toFixed(2),
        alerted:   !!m.alerted,
        alertedAt: m.alertedAt || null,
        firstSeen: m.firstSeen,
      }))
      .sort((a, b) => (b.ccu ?? -1) - (a.ccu ?? -1));
    return json(maps);
  }

  if (url.pathname === "/api/poll") {
    // Manual trigger — useful for testing
    const state = await runPoll(env);
    return json({ ok: true, scanned: state.lastScan || state.scanned || 0 });
  }

  // Everything else → dashboard HTML
  return new Response(DASHBOARD_HTML, {
    headers: { "content-type": "text/html;charset=UTF-8" },
  });
}

function ageDays(m) {
  const basis = m.createdDate ? new Date(m.createdDate) : new Date(m.firstSeen);
  return (Date.now() - basis.getTime()) / 86400000;
}
function json(data) {
  return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
}

export default {
  fetch: handleRequest,
  scheduled: handleScheduled,
};

// ---- inline dashboard ----
const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Map Watch — Fortnite new-map CCU monitor</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet"/>
<style>
:root{--bg:#0C1017;--panel:#141B26;--panel-2:#101722;--edge:#22303f;--text:#E6EDF3;--muted:#7C8BA0;--faint:#4d5b6d;--cyan:#35E0C8;--coral:#FF6B5B;--amber:#FFB347;--mono:"JetBrains Mono",monospace;--disp:"Space Grotesk",system-ui,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--disp);background-image:radial-gradient(1200px 600px at 80% -10%,rgba(53,224,200,.06),transparent 60%)}
.wrap{max-width:960px;margin:0 auto;padding:28px 20px 64px}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:12px}
.pulse{width:10px;height:10px;border-radius:50%;background:var(--faint);transition:background .3s}
.pulse.live{background:var(--cyan);box-shadow:0 0 0 0 rgba(53,224,200,.6);animation:pulse 2.4s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(53,224,200,.5)}70%{box-shadow:0 0 0 12px rgba(53,224,200,0)}100%{box-shadow:0 0 0 0 rgba(53,224,200,0)}}
h1{font-size:22px;font-weight:700;letter-spacing:-.01em;margin:0}
.tag{font-family:var(--mono);font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.16em}
.rule{font-family:var(--mono);font-size:13px;color:var(--muted);margin:18px 0 22px}.rule b{color:var(--amber)}.rule .n{color:var(--cyan)}
.strip{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}
.stat{background:var(--panel);border:1px solid var(--edge);border-radius:10px;padding:12px 14px}
.stat .k{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.stat .v{font-family:var(--mono);font-size:19px;font-weight:700;margin-top:6px}.ok{color:var(--cyan)}.bad{color:var(--coral)}.warn{color:var(--amber)}
.section-label{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);margin:0 0 12px}
.card{background:var(--panel);border:1px solid var(--edge);border-radius:12px;padding:16px 18px;margin-bottom:12px}
.card.alerted{border-color:rgba(255,107,91,.55);background:linear-gradient(180deg,rgba(255,107,91,.06),transparent 55%),var(--panel)}
.card-main{display:flex;gap:14px;align-items:flex-start}
.thumb{width:128px;height:72px;border-radius:8px;object-fit:cover;background:var(--panel-2);border:1px solid var(--edge);flex:none}
.card-body{flex:1;min-width:0}
.card-top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.title{font-size:16px;font-weight:600;letter-spacing:-.01em;line-height:1.25}
.meta{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:5px}.meta .code{color:var(--text)}
.ccu{text-align:right;white-space:nowrap}
.ccu .num{font-family:var(--mono);font-size:26px;font-weight:700;line-height:1}
.ccu .num.hot{color:var(--coral)}.ccu .num.live{color:var(--cyan)}.ccu .num.dim{color:var(--muted)}
.ccu .lbl{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-top:4px}
.trend{margin-top:13px;padding:11px 13px;background:var(--panel-2);border:1px solid var(--edge);border-left:2px solid var(--amber);border-radius:8px}
.trend .lab{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--amber)}
.trend .origin{font-weight:600;font-size:14px;margin-top:4px}
.trend .idea{color:var(--muted);font-size:13px;margin-top:5px;line-height:1.45}
.meter{position:relative;height:8px;border-radius:6px;background:var(--panel-2);border:1px solid var(--edge);margin-top:14px;overflow:hidden}
.meter .fill{position:absolute;inset:0 auto 0 0;border-radius:6px 0 0 6px;background:var(--cyan)}.meter .fill.hot{background:var(--coral)}
.thresh{position:relative;height:14px;margin-top:2px}
.thresh .mark{position:absolute;top:0;transform:translateX(-50%);font-family:var(--mono);font-size:9px;color:var(--amber)}
.thresh .mark::before{content:"";position:absolute;top:-16px;left:50%;width:1px;height:14px;background:var(--amber);opacity:.7}
.pill{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;padding:4px 8px;border-radius:999px;border:1px solid;display:inline-block}
.pill.watch{color:var(--cyan);border-color:rgba(53,224,200,.4)}.pill.alert{color:var(--coral);border-color:rgba(255,107,91,.5)}.pill.below{color:var(--muted);border-color:var(--edge)}
.chip{font-family:var(--mono);font-size:11px;color:var(--muted)}
.row-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}
.empty{border:1px dashed var(--edge);border-radius:12px;padding:40px 24px;text-align:center;color:var(--muted)}
.empty .big{font-size:15px;color:var(--text);margin-bottom:6px}
footer{margin-top:30px;font-family:var(--mono);font-size:11px;color:var(--faint)}
@media(max-width:620px){.strip{grid-template-columns:repeat(2,1fr)}h1{font-size:19px}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand"><span class="pulse" id="pulse"></span><h1>Map Watch</h1></div>
    <span class="tag">Fortnite new-map CCU monitor</span>
  </header>
  <p class="rule" id="rule">Loading…</p>
  <div class="strip">
    <div class="stat"><div class="k">Last scan</div><div class="v" id="s-last">—</div></div>
    <div class="stat"><div class="k">Maps scanned</div><div class="v" id="s-scan">—</div></div>
    <div class="stat"><div class="k">Total alerts</div><div class="v ok" id="s-alerts">—</div></div>
    <div class="stat"><div class="k">Discord</div><div class="v" id="s-discord">—</div></div>
  </div>
  <p class="section-label">New maps in view</p>
  <div id="list"><div class="empty"><div class="big">Loading…</div></div></div>
  <footer>Polls every 10 min via Cloudflare Cron · not affiliated with Epic Games</footer>
</div>
<script>
function timeAgo(iso){if(!iso)return"never";const s=Math.floor((Date.now()-new Date(iso))/1000);if(s<60)return s+"s ago";if(s<3600)return Math.floor(s/60)+"m ago";if(s<86400)return Math.floor(s/3600)+"h ago";return Math.floor(s/86400)+"d ago";}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function tick(){
  let st, maps;
  try {
    [st, maps] = await Promise.all([fetch("/api/status").then(r=>r.json()), fetch("/api/maps").then(r=>r.json())]);
  } catch(e) {
    document.getElementById("list").innerHTML='<div class="empty"><div class="big">Error loading data: '+e.message+'</div></div>';
    return;
  }
  const thr = st.ccuThreshold;
  document.getElementById("rule").innerHTML = \`Watching maps <span class="n">≤ \${st.maxMapAgeDays} days</span> old reaching <b>\${thr}+</b> players. Polls every \${st.pollInterval} min.\`;
  document.getElementById("s-last").textContent = timeAgo(st.lastPollAt);
  document.getElementById("s-scan").textContent = st.scanned || "—";
  document.getElementById("s-alerts").textContent = st.alertTotal || 0;
  const dis = document.getElementById("s-discord");
  dis.textContent = st.discordConfigured ? "connected" : "not set";
  dis.className = "v " + (st.discordConfigured ? "ok" : "warn");
  const pulse = document.getElementById("pulse");
  pulse.className = st.lastPollAt ? "pulse live" : "pulse";

  const list = document.getElementById("list");
  if(!maps||!maps.length){list.innerHTML='<div class="empty"><div class="big">No new maps in window yet.</div>Maps appear here once the cron has run. Hit /api/poll to trigger now.</div>';return;}
  list.innerHTML = maps.map(m=>{
    const ccu=m.ccu, known=ccu!=null, hot=known&&ccu>=thr;
    const scaleMax=Math.max(thr*1.5,ccu||0), fill=known?Math.min(100,(ccu/scaleMax)*100):0, tp=Math.min(100,(thr/scaleMax)*100);
    const status=m.alerted?["alert","Alerted"]:hot?["alert","Over the line"]:known?["below","Below "+thr]:["watch","Watching"];
    const nc=(m.alerted||hot)?"hot":known?"live":"dim";
    const thumb=m.image?'<img class="thumb" src="'+esc(m.image)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':"";
    const trend=m.trend?'<div class="trend"><div class="lab">Based on</div><div class="origin">'+esc(m.trend.origin)+'</div>'+(m.trend.idea?'<div class="idea">'+esc(m.trend.idea)+'</div>':'')+'</div>':"";
    return '<div class="card '+(m.alerted?"alerted":"")+'"><div class="card-main">'+thumb+'<div class="card-body"><div class="card-top"><div><div class="title">'+esc(m.title)+'</div><div class="meta">by '+esc(m.creator||"unknown")+' · <span class="code">'+esc(m.code)+'</span></div></div><div class="ccu"><div class="num '+nc+'">'+(known?ccu.toLocaleString():"—")+'</div><div class="lbl">live CCU</div></div></div></div></div><div class="meter"><div class="fill '+(hot?"hot":"")+'" style="width:'+fill+'%"></div></div><div class="thresh"><span class="mark" style="left:'+tp+'%">'+thr+'</span></div>'+trend+'<div class="row-foot"><span class="chip">'+m.ageDays.toFixed(1)+'d old</span><span class="pill '+status[0]+'">'+status[1]+'</span></div></div>';
  }).join("");
}
tick();
setInterval(tick, 30000);
</script>
</body>
</html>`;
