import fs from "fs";
import path from "path";

const stateDir = () => path.resolve(process.env.OPS_STATE_DIR || "./output/ops");
const controlPath = () => path.join(stateDir(), "control.json");
const spendPath = () => path.join(stateDir(), "spend-ledger.json");
const scheduledPath = () => path.join(stateDir(), "scheduled-posts.json");
const analyticsPath = () => path.join(stateDir(), "analytics-snapshots.json");

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
  const item = {
    ts: new Date().toISOString(),
    title: entry?.title || null,
    channelName: entry?.channelName || null,
    integrationId: entry?.integrationId || null,
    scheduledFor: entry?.scheduledFor || null,
    postiz: entry?.postiz || null,
    videoPath: entry?.videoPath || null,
    niche: entry?.niche || null,
  };
  return writeJson(scheduledPath(), [item, ...existing].slice(0, 200));
}

export function getScheduledPosts(limit = 50) {
  return readJson(scheduledPath(), []).slice(0, limit);
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
