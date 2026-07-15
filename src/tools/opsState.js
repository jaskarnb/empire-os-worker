import fs from "fs";
import path from "path";

const stateDir = () => path.resolve(process.env.OPS_STATE_DIR || "./output/ops");
const controlPath = () => path.join(stateDir(), "control.json");
const spendPath = () => path.join(stateDir(), "spend-ledger.json");
const scheduledPath = () => path.join(stateDir(), "scheduled-posts.json");
const analyticsPath = () => path.join(stateDir(), "analytics-snapshots.json");
const automationRunsPath = () => path.join(stateDir(), "automation-runs.json");
const POST_VERIFY_GRACE_MS = 2 * 60 * 60 * 1000;

function ensureDir() {
  fs.mkdirSync(stateDir(), { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  return value;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function getAutomationControl() {
  const control = readJson(controlPath(), {});
  return {
    paused: Boolean(control.paused),
    reason: control.reason || null,
    updatedAt: control.updatedAt || null,
  };
}

export function setAutomationPaused(paused, reason = "") {
  return writeJson(controlPath(), {
    paused: Boolean(paused),
    reason: reason || (paused ? "Paused from ops dashboard" : "Resumed from ops dashboard"),
    updatedAt: new Date().toISOString(),
  });
}

export function isAutomationPaused() {
  return getAutomationControl().paused;
}

export function getSpendState() {
  const ledger = readJson(spendPath(), { days: {} });
  const day = todayKey();
  const today = ledger.days?.[day] || { estimatedSpend: 0, renders: 0, events: [] };
  const dailyBudget = Number(process.env.DAILY_SPEND_LIMIT_USD || 0);
  return {
    day,
    estimatedSpend: Number(today.estimatedSpend || 0),
    renders: Number(today.renders || 0),
    dailyBudget,
    remaining: dailyBudget > 0 ? Math.max(0, dailyBudget - Number(today.estimatedSpend || 0)) : null,
    enforced: dailyBudget > 0,
    recentEvents: (today.events || []).slice(-10),
  };
}

export function assertSpendAllowed(estimatedCost = 0) {
  const state = getSpendState();
  if (state.enforced && state.estimatedSpend + estimatedCost > state.dailyBudget) {
    throw new Error(`SpendGuard: daily budget exceeded (${state.estimatedSpend + estimatedCost} > ${state.dailyBudget})`);
  }
  return state;
}

export function recordRenderSpend({ source = "unknown", estimatedCost = 0, videoPath = null } = {}) {
  const ledger = readJson(spendPath(), { days: {} });
  const day = todayKey();
  const current = ledger.days[day] || { estimatedSpend: 0, renders: 0, events: [] };
  const cost = Number(estimatedCost || 0);
  current.estimatedSpend = Number((Number(current.estimatedSpend || 0) + cost).toFixed(4));
  current.renders = Number(current.renders || 0) + 1;
  current.events = [
    ...(current.events || []).slice(-99),
    { ts: new Date().toISOString(), source, estimatedCost: cost, videoPath },
  ];
  ledger.days[day] = current;
  return writeJson(spendPath(), ledger);
}

export function recordScheduledPost(entry) {
  const existing = readJson(scheduledPath(), []);
  const postizIds = extractPostizIds(entry?.postiz);
  const item = {
    id: entry?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    title: entry?.title || null,
    channelName: entry?.channelName || null,
    integrationId: entry?.integrationId || null,
    scheduledFor: entry?.scheduledFor || null,
    postiz: entry?.postiz || null,
    postizIds,
    status: entry?.status || "scheduled",
    statusUpdatedAt: new Date().toISOString(),
    publishCheckedAt: null,
    publishEvidence: null,
    videoPath: entry?.videoPath || null,
    niche: entry?.niche || null,
  };
  return writeJson(scheduledPath(), [item, ...existing].slice(0, 200));
}

export function getScheduledPosts(limit = 50) {
  return readJson(scheduledPath(), []).slice(0, limit);
}

export function getUpcomingScheduledPosts(limit = 50) {
  const now = Date.now();
  return getScheduledPosts(200)
    .filter((post) => Date.parse(post.scheduledFor || "") > now)
    .slice(0, limit);
}

export function getScheduleSummary(limit = 200) {
  const posts = getScheduledPosts(limit);
  const now = Date.now();
  const counts = { total: posts.length, upcoming: 0, due: 0, published: 0, failed: 0, expired: 0, unknown: 0 };
  for (const post of posts) {
    const status = scheduleStatus(post, now);
    counts[status] = (counts[status] || 0) + 1;
  }
  return { ...counts, latest: posts.slice(0, 10) };
}

function extractPostizIds(value, found = new Set()) {
  if (!value) return [];
  if (Array.isArray(value)) {
    for (const item of value) extractPostizIds(item, found);
    return [...found];
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (/^(id|postId|post_id|_id)$/i.test(key) && nested) found.add(String(nested));
      else extractPostizIds(nested, found);
    }
  }
  return [...found];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function postMatchesSchedule(scheduled, postizPost) {
  const ids = new Set([...(scheduled.postizIds || []), ...extractPostizIds(scheduled.postiz)]);
  const recentIds = extractPostizIds(postizPost);
  if (recentIds.some((id) => ids.has(id))) return true;
  const title = normalizeText(scheduled.title);
  const content = normalizeText([
    postizPost?.title,
    postizPost?.content,
    postizPost?.caption,
    postizPost?.message,
    postizPost?.text,
  ].filter(Boolean).join(" "));
  return title && content.includes(title.slice(0, 40));
}

function scheduleStatus(post, now = Date.now()) {
  if (["published", "failed", "expired"].includes(post?.status)) return post.status;
  const scheduledAt = Date.parse(post?.scheduledFor || "");
  if (!Number.isFinite(scheduledAt)) return "unknown";
  if (scheduledAt > now) return "upcoming";
  if (now - scheduledAt <= POST_VERIFY_GRACE_MS) return "due";
  return "expired";
}

export function reconcileScheduledPosts({ recentPosts = [], now = Date.now() } = {}) {
  const existing = getScheduledPosts(200);
  let changed = false;
  const reconciled = existing.map((post) => {
    const matched = recentPosts.find((recent) => postMatchesSchedule(post, recent));
    if (matched) {
      changed = true;
      return {
        ...post,
        status: "published",
        statusUpdatedAt: new Date(now).toISOString(),
        publishCheckedAt: new Date(now).toISOString(),
        publishEvidence: {
          source: "postiz",
          matchedId: extractPostizIds(matched)[0] || matched?.id || null,
          title: matched?.title || null,
        },
      };
    }
    const status = scheduleStatus(post, now);
    if (status !== (post.status || "scheduled")) {
      changed = true;
      return {
        ...post,
        status,
        statusUpdatedAt: new Date(now).toISOString(),
        publishCheckedAt: status === "expired" || status === "due" ? new Date(now).toISOString() : post.publishCheckedAt || null,
      };
    }
    return post;
  });
  if (changed) writeJson(scheduledPath(), reconciled);
  return reconciled;
}

export function recordAnalyticsSnapshot(snapshot) {
  const existing = readJson(analyticsPath(), []);
  return writeJson(analyticsPath(), [
    { ts: new Date().toISOString(), ...snapshot },
    ...existing,
  ].slice(0, 200));
}

export function getAnalyticsSnapshots(limit = 25) {
  return readJson(analyticsPath(), []).slice(0, limit);
}

export function getAutomationRuns(limit = 25) {
  return readJson(automationRunsPath(), []).slice(0, limit);
}

export function startAutomationRun({ type = "meeting", reason = "manual", source = "system" } = {}) {
  const existing = getAutomationRuns(100);
  const run = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    reason,
    source,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    steps: [],
    result: null,
    error: null,
  };
  writeJson(automationRunsPath(), [run, ...existing].slice(0, 100));
  return run;
}

export function updateAutomationRun(runId, patch = {}) {
  if (!runId) return null;
  const runs = getAutomationRuns(100);
  const index = runs.findIndex((run) => run.id === runId);
  if (index === -1) return null;
  const current = runs[index];
  const next = {
    ...current,
    ...patch,
    steps: patch.steps || current.steps || [],
    updatedAt: new Date().toISOString(),
  };
  runs[index] = next;
  writeJson(automationRunsPath(), runs);
  return next;
}

export function appendAutomationRunStep(runId, step) {
  const runs = getAutomationRuns(100);
  const run = runs.find((item) => item.id === runId);
  const steps = [...(run?.steps || []), { ts: new Date().toISOString(), ...step }];
  return updateAutomationRun(runId, { steps });
}
