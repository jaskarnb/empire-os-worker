/**
 * Postiz public API wrapper - schedules posts to connected channels.
 * Cloud base URL: https://api.postiz.com/public/v1
 * Self-hosted base URL: https://{your-domain}/api/public/v1
 * Auth: Authorization: POSTIZ_API_KEY
 */
import fs from "fs";
import path from "path";
import { assertRenderableVideo } from "./renderGuard.js";

const CLOUD_BASE = "https://api.postiz.com/public/v1";

function normalizeBase(rawValue) {
  const raw = String(rawValue || CLOUD_BASE).replace(/\/$/, "");
  if (/\/public\/v1$/i.test(raw)) return raw;
  if (/\/api\/v1$/i.test(raw)) return raw.replace(/\/api\/v1$/i, "/api/public/v1");
  if (/platform\.postiz\.com$/i.test(raw) || /api\.postiz\.com$/i.test(raw)) return CLOUD_BASE;
  return `${raw}/api/public/v1`;
}

const base = () => normalizeBase(process.env.POSTIZ_API_URL);
const key = () => process.env.POSTIZ_API_KEY;

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: key(),
  };
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function postizUrl(pathname) {
  return `${base()}${pathname}`;
}

function channelType(channel) {
  return channel?.identifier || channel?.provider || channel?.type || channel?.social || channel?.platform || "instagram";
}

function postSettings(channel) {
  return {
    __type: channelType(channel),
    privacy_level: "PUBLIC_TO_EVERYONE",
    duet: false,
    stitch: false,
    comment: true,
    autoAddMusic: "no",
    brand_content_toggle: false,
    brand_organic_toggle: false,
    content_posting_method: "DIRECT_POST",
  };
}

function findChannel(integrationId) {
  return (_channels || []).find((channel) => {
    const ids = [channel?.id, channel?._id, channel?.integrationId].filter(Boolean).map(String);
    return ids.includes(String(integrationId));
  });
}

async function readError(res) {
  const text = await res.text();
  return text.slice(0, 1200);
}

let _channels = null;
let _channelsFetched = 0;

export async function getChannels() {
  if (_channels && Date.now() - _channelsFetched < 10 * 60 * 1000) return _channels;
  if (!key()) throw new Error("POSTIZ_API_KEY not set");
  const res = await fetch(postizUrl("/integrations"), { headers: headers() });
  if (!res.ok) throw new Error(`Postiz GET /integrations ${res.status}: ${await readError(res)}`);
  const data = await res.json();
  _channels = Array.isArray(data) ? data : data.integrations ?? data.channels ?? [];
  _channelsFetched = Date.now();
  console.log(`[Postiz] Loaded ${_channels.length} channel(s)`);
  return _channels;
}

export async function getRecentPosts(limit = 15) {
  try {
    if (!key()) return [];
    const res = await fetch(postizUrl(`/posts?limit=${limit}`), { headers: headers() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.posts ?? data.items ?? [];
  } catch {
    return [];
  }
}

export async function uploadMedia(filePath) {
  if (!key()) throw new Error("POSTIZ_API_KEY not set");
  if (!filePath) throw new Error("Postiz upload requires a media path");

  if (isRemoteUrl(filePath)) {
    const res = await fetch(postizUrl("/upload-from-url"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ url: filePath }),
    });
    if (!res.ok) throw new Error(`Postiz upload-from-url ${res.status}: ${await readError(res)}`);
    return res.json();
  }

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

  const res = await fetch(postizUrl("/upload"), {
    method: "POST",
    headers: { Authorization: key() },
    body: formData,
  });
  if (!res.ok) throw new Error(`Postiz upload ${res.status}: ${await readError(res)}`);

  const media = await res.json();
  const url = media.path || media.url;
  if (!media.id || !url) throw new Error("Postiz upload response did not include media id and path/url");

  console.log(`[Postiz] Upload done. Path: ${url}`);
  return media;
}

export async function schedulePost({ integrationId, content, date, mediaPath, mediaUrl, requireMedia = true }) {
  if (!key()) throw new Error("POSTIZ_API_KEY not set");
  if (!integrationId) throw new Error("Postiz schedule requires integrationId");
  if (!content) throw new Error("Postiz schedule requires content");

  const mediaSource = mediaUrl || mediaPath;
  if (requireMedia && !mediaSource) throw new Error("RenderGuard: refusing to schedule without video media");

  let mediaArray = [];
  if (mediaSource) {
    const media = await uploadMedia(mediaSource);
    const url = media.path || media.url;
    if (!media.id || !url) throw new Error("Postiz media step produced no usable media id/path");
    mediaArray = [{ id: media.id, path: url }];
    console.log(`[Postiz] Media URL: ${url}`);
  }

  if (requireMedia && !mediaArray.length) {
    throw new Error("RenderGuard: refusing to schedule because media upload produced no video asset");
  }

  const channel = findChannel(integrationId);
  const body = {
    type: "schedule",
    date,
    shortLink: false,
    tags: [],
    posts: [{
      integration: { id: integrationId },
      value: [{ content, image: mediaArray }],
      settings: postSettings(channel),
    }],
  };

  const res = await fetch(postizUrl("/posts"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Postiz POST /posts ${res.status}: ${await readError(res)}`);
  try { return await res.json(); } catch { return { ok: true }; }
}
