/**
 * Postiz cloud API wrapper - schedules posts to connected channels.
 * Base URL: POSTIZ_API_URL (https://platform.postiz.com)
 * Auth:     Bearer POSTIZ_API_KEY
 */
import fs from "fs";
import path from "path";
import { assertRenderableVideo } from "./renderGuard.js";

const base = () =>
  (process.env.POSTIZ_API_URL || "https://platform.postiz.com").replace(/\/$/, "");
const key = () => process.env.POSTIZ_API_KEY;

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key()}`,
  };
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

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
  } catch {
    return [];
  }
}

export async function uploadMedia(filePath) {
  if (!key()) throw new Error("POSTIZ_API_KEY not set");
  if (!filePath) throw new Error("Postiz upload requires a media path");
  if (isRemoteUrl(filePath)) return { url: filePath };

  await assertRenderableVideo(filePath, { minDuration: 8, requireAudio: true, requireVertical: true });

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === ".mp4" ? "video/mp4" : "application/octet-stream";
  if (mimeType !== "video/mp4") throw new Error(`Postiz upload rejected non-video media: ${fileName}`);

  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append("file", blob, fileName);

  const sizeMb = (fileBuffer.length / 1024 / 1024).toFixed(1);
  console.log(`[Postiz] Uploading ${fileName} (${sizeMb} MB)...`);

  const res = await fetch(`${base()}/api/v1/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}` },
    body: formData,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Postiz upload ${res.status}: ${text}`);

  const media = JSON.parse(text);
  const url = media.path || media.url;
  if (!url) throw new Error("Postiz upload response did not include a media URL/path");

  console.log(`[Postiz] Upload done. Path: ${url}`);
  return media;
}

export async function schedulePost({ integrationId, content, date, mediaPath, mediaUrl, requireMedia = true }) {
  if (!key()) throw new Error("POSTIZ_API_KEY not set");
  if (!integrationId) throw new Error("Postiz schedule requires integrationId");
  if (!content) throw new Error("Postiz schedule requires content");

  const mediaSource = mediaUrl || mediaPath;
  if (requireMedia && !mediaSource) throw new Error("RenderGuard: refusing to schedule without video media");

  let imageArray = [];
  if (mediaSource) {
    const media = await uploadMedia(mediaSource);
    const url = media.path || media.url;
    if (!url) throw new Error("Postiz media step produced no URL");
    imageArray = [{ url }];
    console.log(`[Postiz] Media URL: ${url}`);
  }

  if (requireMedia && !imageArray.length) {
    throw new Error("RenderGuard: refusing to schedule because media upload produced no video URL");
  }

  const contentItem = { id: integrationId, content, ...(imageArray.length ? { image: imageArray } : {}) };
  const body = { type: "schedule", date, content: [contentItem] };
  const res = await fetch(`${base()}/api/v1/posts`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Postiz POST /posts ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
