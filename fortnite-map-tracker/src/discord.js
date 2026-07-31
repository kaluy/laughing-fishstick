import { config } from "./config.js";

/**
 * Post a rich embed to the configured Discord webhook.
 * Returns true if delivered, false if skipped/failed (never throws).
 */
export async function sendMapAlert(map) {
  if (!config.discordWebhookUrl) {
    console.warn("[discord] No webhook configured — alert not sent for", map.code);
    return false;
  }

  const fortniteUrl = `https://www.fortnite.com/@${encodeURIComponent(
    map.creator || "")}/${encodeURIComponent(map.code)}`;

  const fields = [
    { name: "Peak players", value: `**${map.peakCcu.toLocaleString()}**`, inline: true },
    { name: "Map age", value: `${map.ageDays.toFixed(1)} days`, inline: true },
    { name: "Creator", value: map.creator || "unknown", inline: true },
  ];

  // What it's based on / the idea behind it.
  if (map.trend) {
    const conf = map.trend.confidence ? ` _(${map.trend.confidence} confidence · ${map.trend.source})_` : "";
    fields.push({ name: "Based on", value: `${map.trend.origin}${conf}`, inline: false });
    if (map.trend.idea) fields.push({ name: "The idea", value: map.trend.idea, inline: false });
  }

  fields.push({ name: "Island code", value: `\`${map.code}\``, inline: false });

  const embed = {
    title: `📈 ${map.title}`,
    url: fortniteUrl,
    description: `A new map just crossed **${config.ccuThreshold} concurrent players**.`,
    color: 0x35e0c8,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: "Fortnite map tracker" },
  };

  // The map's thumbnail, shown large in the embed.
  if (map.image) embed.image = { url: map.image };

  try {
    const res = await fetch(config.discordWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const wait = (body.retry_after ?? 2) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      return sendMapAlert(map);
    }
    if (!res.ok) {
      console.error("[discord] webhook error", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[discord] send failed:", err.message);
    return false;
  }
}
