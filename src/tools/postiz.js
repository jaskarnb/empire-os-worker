/**
 * Postiz cloud API wrapper — schedules posts to connected channels.
 * Base URL: POSTIZ_API_URL (https://platform.postiz.com)
 * Auth:     Bearer POSTIZ_API_KEY
 */

const base = () => (process.env.POSTIZ_API_URL || "https://platform.postiz.com").replace(/\/$/, "");
const key = () => process.env.POSTIZ_API_KEY;

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key()}`,
  };
}

// ─── Channel cache ────────────────────────────────────────────────────────────
let _channels = null;
let _channelsFetched = 0;

export async function getChannels() {
  if (_channels && Date.now() - _channelsFetched < 10 * 60 * 1000) return _channels;
  if (!key()) throw new Error("POSTIZ_API_KEY not set");
  const res = await fetch(`${base()}/api/v1/integrations`, { headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Postiz GET /integrations ${res.status}: ${text}`);
  }
  const data = await res.json();
  _channels = Array.isArray(data) ? data : data.integrations ?? data.channels ?? [];
  _channelsFetched = Date.now();
  console.log(`[Postiz] Loaded ${_channels.length} channel(s)`);
  return _channels;
}

export async function getRecentPosts(limit = 15) {
  try {
    if (!key()) return [];
    const res = await fetch(`${base()}/api/v1/posts?limit=${limit}&display=list`, { headers: headers() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.posts ?? [];
  } catch { return []; }
}

export async function schedulePost({ integrationId, content, date }) {
  if (!key()) throw new Error("POSTIZ_API_KEY not set");
  const body = {
    type: "schedule",
    date,
    content: [{ id: integrationId, content }],
  };
  const res = await fetch(`${base()}/api/v1/posts`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Postiz POST /posts ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
