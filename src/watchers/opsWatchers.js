import fs from "fs";
import path from "path";
import { getChannels, getRecentPosts } from "../tools/postiz.js";
import { makeIncident, readRecentIncidents, recordIncident, saveLastOpsReport } from "../tools/opsIncidents.js";

const WORKER_HEALTH_URL = process.env.WORKER_HEALTH_URL || process.env.PUBLIC_WORKER_URL || "https://empire-os-worker-production.up.railway.app/health";
const GITHUB_REPO = process.env.GITHUB_REPO || "jaskarnb/empire-os-worker";
const WATCH_PR_NUMBER = process.env.WATCH_PR_NUMBER || "1";

function ok(agent, details = {}) {
  return { agent, status: "ok", severity: "P3", details };
}

function notice(agent, details = {}) {
  return { agent, status: "notice", severity: "P3", details };
}

function fail({ agent, severity = "P2", service, problem, evidence = [], recommendedOwner = "Codex", recommendedAction }) {
  const incident = recordIncident(makeIncident({
    agent,
    severity,
    service,
    problem,
    evidence,
    recommendedOwner,
    recommendedAction,
  }));
  return { agent, status: "incident", severity, incident };
}

async function checkRailwayHealth() {
  const agent = "Railway Watcher";
  try {
    const res = await fetch(WORKER_HEALTH_URL, { method: "GET" });
    const text = await res.text();
    if (!res.ok) {
      return fail({
        agent,
        severity: "P0",
        service: "railway-worker",
        problem: "Worker health endpoint is not healthy",
        evidence: [`${WORKER_HEALTH_URL} returned ${res.status}`, text.slice(0, 300)],
        recommendedAction: "Inspect Railway deployment logs and worker startup health path",
      });
    }
    return ok(agent, { url: WORKER_HEALTH_URL, statusCode: res.status });
  } catch (error) {
    return fail({
      agent,
      severity: "P0",
      service: "railway-worker",
      problem: "Worker health endpoint could not be reached",
      evidence: [error.message, WORKER_HEALTH_URL],
      recommendedAction: "Check Railway service status, deployment logs, and public domain settings",
    });
  }
}

async function checkPostiz() {
  const agent = "Postiz Watcher";
  try {
    const channels = await getChannels();
    if (!channels.length) {
      return fail({
        agent,
        severity: "P1",
        service: "postiz",
        problem: "No connected Postiz channels were found",
        evidence: ["GET /integrations returned an empty list"],
        recommendedAction: "Connect TikTok, YouTube Shorts, Instagram, or confirm Postiz API access",
      });
    }
    const recentPosts = await getRecentPosts(10);
    return ok(agent, { channels: channels.length, recentPosts: recentPosts.length });
  } catch (error) {
    return fail({
      agent,
      severity: "P0",
      service: "postiz",
      problem: "Postiz API check failed",
      evidence: [error.message],
      recommendedAction: "Verify POSTIZ_API_KEY, POSTIZ_API_URL, and connected social accounts",
    });
  }
}

async function checkGitHub() {
  const agent = "GitHub Watcher";
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/pulls/${WATCH_PR_NUMBER}`, {
      headers: { "User-Agent": "empire-os-worker" },
    });
    if (res.status === 404) return ok(agent, { repo: GITHUB_REPO, watchedPr: null });
    const data = await res.json();
    if (!res.ok) {
      return fail({
        agent,
        severity: "P2",
        service: "github",
        problem: "GitHub PR status could not be read",
        evidence: [`GitHub returned ${res.status}`, JSON.stringify(data).slice(0, 300)],
        recommendedAction: "Check GitHub API availability and repository access",
      });
    }
    if (data.draft) {
      return notice(agent, {
        repo: GITHUB_REPO,
        watchedPr: Number(WATCH_PR_NUMBER),
        state: data.state,
        draft: true,
        url: data.html_url,
      });
    }
    return ok(agent, { repo: GITHUB_REPO, watchedPr: Number(WATCH_PR_NUMBER), state: data.state, draft: false });
  } catch (error) {
    return fail({
      agent,
      severity: "P2",
      service: "github",
      problem: "GitHub watcher crashed",
      evidence: [error.message],
      recommendedAction: "Inspect GitHub watcher network/API handling",
    });
  }
}

function checkSecrets() {
  const agent = "Secrets Watcher";
  const required = ["ANTHROPIC_API_KEY", "POSTIZ_API_KEY"];
  const recommended = ["AGENT_MEDIA_API_KEY"];
  const missingRequired = required.filter((name) => !process.env[name]);
  const missingRecommended = recommended.filter((name) => !process.env[name]);

  if (missingRequired.length) {
    return fail({
      agent,
      severity: "P0",
      service: "environment",
      problem: "Required secrets are missing",
      evidence: missingRequired.map((name) => `${name}=missing`),
      recommendedAction: "Add missing environment variables in Railway before running automation",
    });
  }
  if (process.env.AGENT_MEDIA_ENABLED === "true" && missingRecommended.length) {
    return fail({
      agent,
      severity: "P1",
      service: "environment",
      problem: "AgentMedia is enabled but its API key is missing",
      evidence: missingRecommended.map((name) => `${name}=missing`),
      recommendedAction: "Add AGENT_MEDIA_API_KEY or disable AGENT_MEDIA_ENABLED",
    });
  }
  return ok(agent, { requiredPresent: required.length, recommendedMissing: missingRecommended });
}

function checkRenderOutput() {
  const agent = "Render Watcher";
  const videoDir = path.resolve(process.env.VIDEO_DIR || "./output/video");
  try {
    if (!fs.existsSync(videoDir)) return ok(agent, { videoDir, files: 0, note: "video output folder not created yet" });
    const mp4s = fs.readdirSync(videoDir).filter((name) => name.toLowerCase().endsWith(".mp4"));
    const tiny = mp4s.filter((name) => fs.statSync(path.join(videoDir, name)).size < 100_000);
    if (tiny.length) {
      return fail({
        agent,
        severity: "P1",
        service: "rendering",
        problem: "Tiny MP4 files found in render output",
        evidence: tiny.slice(0, 5),
        recommendedAction: "Inspect RenderGuard failures and remove bad video outputs",
      });
    }
    return ok(agent, { videoDir, mp4s: mp4s.length });
  } catch (error) {
    return fail({
      agent,
      severity: "P2",
      service: "rendering",
      problem: "Render output folder could not be inspected",
      evidence: [error.message],
      recommendedAction: "Check filesystem permissions and VIDEO_DIR configuration",
    });
  }
}

function checkCosts() {
  const agent = "Cost Watcher";
  const dailyBudget = Number(process.env.DAILY_SPEND_LIMIT_USD || 0);
  const estimatedSpend = Number(process.env.ESTIMATED_DAILY_SPEND_USD || 0);
  if (dailyBudget > 0 && estimatedSpend > dailyBudget) {
    return fail({
      agent,
      severity: "P0",
      service: "costs",
      problem: "Estimated daily spend is above budget",
      evidence: [`estimated=${estimatedSpend}`, `limit=${dailyBudget}`],
      recommendedAction: "Pause paid generation and review cost drivers before continuing",
    });
  }
  return ok(agent, { estimatedSpend, dailyBudget, enforced: dailyBudget > 0 });
}

function overallStatus(results) {
  if (results.some((item) => item.severity === "P0" && item.status === "incident")) return "p0";
  if (results.some((item) => item.status === "incident")) return "attention";
  if (results.some((item) => item.status === "notice")) return "notice";
  return "ok";
}

export async function runOpsWatchers() {
  const startedAt = new Date().toISOString();
  const checks = [
    checkSecrets(),
    checkRenderOutput(),
    checkCosts(),
    await checkRailwayHealth(),
    await checkPostiz(),
    await checkGitHub(),
  ];

  return saveLastOpsReport({
    status: overallStatus(checks),
    startedAt,
    finishedAt: new Date().toISOString(),
    checks,
    recentIncidents: readRecentIncidents(20),
  });
}
