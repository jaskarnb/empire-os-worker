import fs from "fs";
import path from "path";
import { getChannels, getRecentPosts } from "../tools/postiz.js";
import { makeIncident, readRecentIncidents, recordIncident, saveLastOpsReport } from "../tools/opsIncidents.js";
import { getScheduledPosts, getSpendState, recordAnalyticsSnapshot } from "../tools/opsState.js";
import { notifyOpsReport } from "../tools/slackNotify.js";

const WORKER_HEALTH_URL = process.env.WORKER_HEALTH_URL || process.env.PUBLIC_WORKER_URL || "https://empire-os-worker-production.up.railway.app/health";
const POSTIZ_WEB_URL = process.env.POSTIZ_WEB_URL || "";
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

function summarizeChannel(channel) {
  return {
    id: channel?.id || channel?._id || channel?.integrationId || null,
    name: channel?.name || channel?.username || channel?.identifier || channel?.provider || "unknown",
    provider:
      channel?.type ||
      channel?.provider ||
      channel?.networkId ||
      channel?.network ||
      channel?.social ||
      channel?.platform ||
      channel?.internalType ||
      "unknown",
  };
}

function channelLooksDisconnected(channel) {
  const text = JSON.stringify(channel || {}).toLowerCase();
  return /\b(disconnected|expired|revoked|reauth|unauthorized|invalid token|token expired|failed)\b/.test(text);
}

function getPostMetric(post, names) {
  for (const name of names) {
    const value = post?.[name] ?? post?.analytics?.[name] ?? post?.stats?.[name] ?? post?.metrics?.[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
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

async function checkPostizWeb() {
  const agent = "Postiz Web Watcher";
  if (!POSTIZ_WEB_URL) return notice(agent, { note: "POSTIZ_WEB_URL not configured; API watcher is still active" });
  try {
    const res = await fetch(POSTIZ_WEB_URL, { method: "GET" });
    if (!res.ok) {
      return fail({
        agent,
        severity: res.status >= 500 ? "P1" : "P2",
        service: "postiz-web",
        problem: "Postiz web app is not healthy",
        evidence: [`${POSTIZ_WEB_URL} returned ${res.status}`],
        recommendedAction: "Inspect Postiz Railway logs; API may still work while web UI is down",
      });
    }
    return ok(agent, { url: POSTIZ_WEB_URL, statusCode: res.status });
  } catch (error) {
    return fail({
      agent,
      severity: "P1",
      service: "postiz-web",
      problem: "Postiz web app could not be reached",
      evidence: [error.message, POSTIZ_WEB_URL],
      recommendedAction: "Inspect Postiz Railway service health and deployment logs",
    });
  }
}

async function checkSocialAccounts() {
  const agent = "Social Account Watcher";
  try {
    const channels = await getChannels();
    if (!channels.length) return notice(agent, { channels: 0, note: "No social accounts connected yet" });

    const disconnected = channels.filter(channelLooksDisconnected).map(summarizeChannel);
    if (disconnected.length) {
      return fail({
        agent,
        severity: "P1",
        service: "social-accounts",
        problem: "One or more connected social accounts may need reauthorization",
        evidence: disconnected.slice(0, 5).map((channel) => JSON.stringify(channel)),
        recommendedAction: "Open Postiz integrations and reconnect any expired TikTok, YouTube, or Instagram accounts",
      });
    }

    const providers = [...new Set(channels.map((channel) => summarizeChannel(channel).provider))].filter(Boolean);
    return ok(agent, { channels: channels.length, providers });
  } catch (error) {
    return fail({
      agent,
      severity: "P1",
      service: "social-accounts",
      problem: "Social account health could not be checked",
      evidence: [error.message],
      recommendedAction: "Verify Postiz integration access and inspect connected account status manually",
    });
  }
}

async function checkAnalytics() {
  const agent = "Analytics Watcher";
  try {
    const posts = await getRecentPosts(25);
    if (!posts.length) {
      return notice(agent, { posts: 0, note: "No recent posts available for analytics yet" });
    }

    const scored = posts.map((post) => {
      const views = getPostMetric(post, ["views", "viewCount", "plays", "impressions"]);
      const likes = getPostMetric(post, ["likes", "likeCount"]);
      const comments = getPostMetric(post, ["comments", "commentCount"]);
      const shares = getPostMetric(post, ["shares", "shareCount"]);
      const score = [views, likes, comments, shares]
        .filter((value) => value !== null)
        .reduce((sum, value) => sum + value, 0);
      return {
        title: String(post?.title || post?.content || post?.caption || post?.id || "untitled").slice(0, 90),
        metricsFound: [views, likes, comments, shares].filter((value) => value !== null).length,
        views,
        likes,
        comments,
        shares,
        score,
      };
    });

    const measurable = scored.filter((post) => post.metricsFound > 0);
    if (!measurable.length) {
      return notice(agent, {
        posts: posts.length,
        measurable: 0,
        note: "Recent posts are visible, but Postiz did not return analytics fields yet",
      });
    }

    measurable.sort((a, b) => b.score - a.score);
    recordAnalyticsSnapshot({
      posts: posts.length,
      measurable: measurable.length,
      topPosts: measurable.slice(0, 5),
      lowSignalPosts: measurable.filter((post) => post.score === 0).length,
    });
    return ok(agent, {
      posts: posts.length,
      measurable: measurable.length,
      topPosts: measurable.slice(0, 3),
      lowSignalPosts: measurable.filter((post) => post.score === 0).length,
    });
  } catch (error) {
    return fail({
      agent,
      severity: "P2",
      service: "analytics",
      problem: "Recent post analytics could not be checked",
      evidence: [error.message],
      recommendedAction: "Confirm analytics data is available through Postiz or add native platform analytics connectors",
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
  const recommended = ["HIGGSFIELD_CLI_PATH"];
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
  return ok(agent, { requiredPresent: required.length, recommendedMissing: missingRecommended });
}

function checkHiggsfield() {
  const agent = "Higgsfield Watcher";
  const enabled = process.env.HIGGSFIELD_ENABLED === "true";
  const cliPath = process.env.HIGGSFIELD_CLI_PATH || "higgsfield";
  if (!enabled) {
    return fail({
      agent,
      severity: "P1",
      service: "higgsfield",
      problem: "Higgsfield is not enabled, so production video posting is blocked",
      evidence: ["HIGGSFIELD_ENABLED is not true"],
      recommendedAction: "Enable Higgsfield after CLI/MCP auth is ready, or keep automation paused until setup is complete",
    });
  }
  return ok(agent, {
    enabled,
    cliPath,
    model: process.env.HIGGSFIELD_VIDEO_MODEL || "cinematic_studio_video_v2",
    mode: "production-required",
  });
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
  const spend = getSpendState();
  const dailyBudget = spend.dailyBudget;
  const estimatedSpend = spend.estimatedSpend;
  if (process.env.HIGGSFIELD_ENABLED === "true" && dailyBudget <= 0) {
    return fail({
      agent,
      severity: "P1",
      service: "costs",
      problem: "Paid video generation is enabled without a daily spend limit",
      evidence: ["HIGGSFIELD_ENABLED=true", "DAILY_SPEND_LIMIT_USD=missing"],
      recommendedAction: "Set DAILY_SPEND_LIMIT_USD before enabling automatic paid posting",
    });
  }
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
  return ok(agent, { estimatedSpend, dailyBudget, renders: spend.renders, remaining: spend.remaining, enforced: dailyBudget > 0 });
}

function checkScheduledPosts() {
  const agent = "Schedule Watcher";
  const posts = getScheduledPosts(50);
  if (!posts.length) return notice(agent, { scheduled: 0, note: "No locally recorded scheduled posts yet" });
  const now = Date.now();
  const upcoming = posts.filter((post) => Date.parse(post.scheduledFor || "") > now);
  const recent = posts.filter((post) => now - Date.parse(post.ts || "") < 24 * 60 * 60 * 1000);
  return ok(agent, {
    scheduled: posts.length,
    upcoming: upcoming.length,
    recordedLast24h: recent.length,
    latest: posts.slice(0, 3).map((post) => ({
      title: post.title,
      channelName: post.channelName,
      scheduledFor: post.scheduledFor,
      niche: post.niche,
    })),
  });
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
    checkHiggsfield(),
    checkRenderOutput(),
    checkCosts(),
    await checkRailwayHealth(),
    await checkPostiz(),
    await checkPostizWeb(),
    await checkSocialAccounts(),
    await checkAnalytics(),
    checkScheduledPosts(),
    await checkGitHub(),
  ];

  const report = saveLastOpsReport({
    status: overallStatus(checks),
    startedAt,
    finishedAt: new Date().toISOString(),
    checks,
    recentIncidents: readRecentIncidents(20),
  });
  try {
    await notifyOpsReport(report);
  } catch (error) {
    console.error("[Slack] Ops notification failed:", error.message);
  }
  return report;
}
