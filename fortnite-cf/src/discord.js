export async function sendAlert(map, webhookUrl, threshold) {
  if (!webhookUrl) return;

  const fields = [
    { name: "Peak players", value: `**${map.ccu.toLocaleString()}**`, inline: true },
    { name: "Map age",      value: `${map.ageDays.toFixed(1)} days`,  inline: true },
    { name: "Creator",      value: map.creator || "unknown",           inline: true },
  ];
  if (map.trend) {
    fields.push({ name: "Based on", value: map.trend.origin, inline: false });
    if (map.trend.idea) fields.push({ name: "The idea", value: map.trend.idea, inline: false });
  }
  fields.push({ name: "Island code", value: `\`${map.code}\``, inline: false });

  const embed = {
    title: `📈 ${map.title}`,
    url: `https://www.fortnite.com/creative/island/${map.code}`,
    description: `A new map just crossed **${threshold} concurrent players**.`,
    color: 0x35e0c8,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: "Fortnite Map Watch" },
  };
  if (map.image) embed.image = { url: map.image };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch {}
}
