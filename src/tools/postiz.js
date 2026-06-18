/**
 * Postiz / Buffer wrapper.
 */
const BACKEND = process.env.POSTING_BACKEND || "postiz";

async function postizSchedule({ caption, platform, videoPath, slot }) {
  const baseUrl = process.env.POSTIZ_API_URL || "http://localhost:5000";
  const apiKey = process.env.POSTIZ_API_KEY;
  if (!apiKey) throw new Error("POSTIZ_API_KEY not set");
  const scheduledAt = slotToISO(slot);
  const res = await fetch(`${baseUrl}/api/v1/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ content: caption, platform, scheduledAt, ...(videoPath ? { media: [{ url: videoPath }] } : {}) }),
  });
  if (!res.ok) throw new Error(`Postiz ${res.status}: ${await res.text()}`);
  return res.json();
}

async function bufferSchedule({ caption, platform, slot }) {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) throw new Error("BUFFER_ACCESS_TOKEN not set");
  const profileMap = JSON.parse(process.env.BUFFER_PROFILE_IDS || "{}");
  const profileId = profileMap[platform];
  if (!profileId) throw new Error(`No Buffer profile_id for ${platform}`);
  const res = await fetch("https://api.bufferapp.com/1/updates/create.json", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: token, "profile_ids[]": profileId, text: caption, scheduled_at: Math.floor(slotToISO(slot)/1000) }),
  });
  if (!res.ok) throw new Error(`Buffer ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function schedulePost(opts) {
  if (BACKEND === "buffer") return bufferSchedule(opts);
  return postizSchedule(opts);
}

function slotToISO(slot) {
  const now = new Date();
  const [dayPart, timePart] = slot.split(" ");
  const [h, m] = timePart.split(":").map(Number);
  const d = new Date(now);
  if (dayPart.toLowerCase() === "tomorrow") d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
