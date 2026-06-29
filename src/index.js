import http from "http";
import Anthropic from "@anthropic-ai/sdk";
import { startCronJobs } from "./cron.js";
import { runDailyMeeting } from "./agents/dailyMeeting.js";
import { runBrainRotMeeting } from "./agents/brainRotMeeting.js";
import { runKidsMeeting } from "./agents/kidsMeeting.js";
import { verifyAutomationReady, verifyMediaSource, verifyTaskCompletion } from "./agents/verifier.js";
import { generateVideo } from "./tools/videoGen.js";
import { getChannels, schedulePost } from "./tools/postiz.js";
import { assertPolicySafePost } from "./tools/policyGuard.js";
import { assertContentQuality, scorePostQuality } from "./agents/contentQuality.js";
import { runNicheScout } from "./agents/nicheScout.js";
import { listAgents, agentsByTeam } from "./agents/agentRegistry.js";
import { listSquads } from "./agents/agentSquads.js";
import { spawnAgentTask, agentSpawnerStatus } from "./agents/agentSpawner.js";
import { getAgentMemory, getMemoryStatus, getSharedMemory } from "./agents/agentMemory.js";
import { renderOpsDashboard } from "./tools/opsDashboard.js";
import { readLastOpsReport, readRecentIncidents } from "./tools/opsIncidents.js";
import { isSlackConfigured, notifySlack } from "./tools/slackNotify.js";
import {
  getAnalyticsSnapshots,
  getAutomationControl,
  getScheduledPosts,
  getSpendState,
  recordScheduledPost,
  setAutomationPaused,
} from "./tools/opsState.js";
import { runOpsWatchers } from "./watchers/opsWatchers.js";
import fs from "fs";
import path from "path";

const PORT = process.env.PORT || 3001;
const anthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendHtml(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

function sendVideo(res, filePath) {
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Content-Length": stat.size,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

async function safeSlack(payload) {
  try {
    return await notifySlack(payload);
  } catch (error) {
    console.error("[Slack] Notification failed:", error.message);
    return { status: "error", error: error.message };
  }
}

function latestVideoPath() {
  const videoDir = path.resolve(process.env.VIDEO_DIR || "./output/video");
  if (!fs.existsSync(videoDir)) throw new Error(`No video directory found at ${videoDir}`);
  const videos = fs.readdirSync(videoDir)
    .filter((name) => name.toLowerCase().endsWith(".mp4"))
    .map((name) => {
      const filePath = path.join(videoDir, name);
      return { filePath, mtime: fs.statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  if (!videos.length) throw new Error(`No MP4 videos found in ${videoDir}`);
  return videos[0].filePath;
}

async function generateE2ePost({ channelName, niche }) {
  const prompt = `Create one original short-form social video concept for "${channelName}".

NICHE: ${niche}
GOAL: high-retention, useful, entertaining, safe for general audiences.

Return ONLY valid JSON:
{
  "title": "Internal title, 3-6 words",
  "hook": "Exact first 5-8 spoken words",
  "script": "A 90-130 word voiceover script. Conversational. No stage directions.",
  "caption": "Caption with a strong first sentence, 2 short lines of value, and 5 hashtags."
}`;

  const resp = await anthropic().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = resp.content?.find((part) => part.type === "text")?.text || "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Claude did not return JSON for e2e post");
  return JSON.parse(match[0]);
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

const DASHBOARD_SQUAD_IDS = {
  "horror-video-production": "horror",
  "kids-video-production": "kids",
  "brainrot-video-production": "brainrot",
  "niche-discovery": "niche",
  "reference-research": "reference",
  publishing: "publishing",
  "analytics-feedback": "analytics",
  "ops-safety": "ops",
  monetization: "monetization",
};

function memoryForSquad(squad) {
  const agentMemories = squad.agents.flatMap((agentId) => getAgentMemory(agentId, 50));
  return agentMemories
    .sort((a, b) => Date.parse(b.ts || 0) - Date.parse(a.ts || 0));
}

function dashboardSquads() {
  return listSquads().map((squad) => {
    const memories = memoryForSquad(squad);
    const lastAssignment = memories.find((item) => item.type === "assignment") || memories[0] || null;
    return {
      id: DASHBOARD_SQUAD_IDS[squad.id] || squad.id,
      sourceId: squad.id,
      name: squad.name,
      lastTask: lastAssignment?.content || null,
      memoryCount: memories.length,
      agentCount: squad.agents.length,
      canSpawnSubagents: true,
      agents: squad.agents,
    };
  });
}

function agentRecommendations() {
  const shared = getSharedMemory(100);
  const spawned = shared.filter((item) => item.type === "task-spawned").slice(0, 5);
  const recommendations = spawned.map((item) => item.content);
  if (!recommendations.length) {
    recommendations.push(
      "Start with one horror test: backyard or dark hallway found-footage clip.",
      "Use Higgsfield only, then let Quality Gate block anything weak or static.",
      "After the first post, compare retention and repeat the strongest hook pattern.",
    );
  }
  return recommendations;
}

function dashboardAgentStatus() {
  const spawner = agentSpawnerStatus();
  const memory = getMemoryStatus();
  const shared = getSharedMemory(100);
  const activeCount = shared.filter((item) => item.type === "task-spawned").length;
  return {
    status: "ok",
    activeCount,
    spawnerStatus: spawner.canSpawn ? "active" : "idle",
    memoryStatus: memory.localMemoryDir ? "online" : "offline",
    spawner,
    memory,
    agents: listAgents(),
    teams: agentsByTeam(),
    squads: dashboardSquads(),
  };
}

// HTTP server: /health, /standup, /ops/status, /ops/check, /ops/dashboard
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { status: "ok", ts: new Date().toISOString() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/ops/dashboard") {
    sendHtml(res, 200, renderOpsDashboard({ incidents: readRecentIncidents(25), lastReport: readLastOpsReport() }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/ops/status") {
    sendJson(res, 200, {
      status: "ok",
      ts: new Date().toISOString(),
      lastReport: readLastOpsReport(),
      recentIncidents: readRecentIncidents(25),
      control: getAutomationControl(),
      spend: getSpendState(),
      scheduledPosts: getScheduledPosts(10),
      analytics: getAnalyticsSnapshots(5),
      slack: {
        configured: isSlackConfigured(),
        enabled: process.env.SLACK_NOTIFICATIONS_ENABLED === "true",
      },
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/ops/automation-status") {
    sendJson(res, 200, {
      status: "ok",
      ts: new Date().toISOString(),
      control: getAutomationControl(),
      spend: getSpendState(),
      scheduledPosts: getScheduledPosts(25),
      analytics: getAnalyticsSnapshots(10),
      niches: runNicheScout(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/pause") {
    const payload = await readJsonBody(req);
    sendJson(res, 200, { status: "ok", control: setAutomationPaused(true, payload.reason || "Paused from ops endpoint") });
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/resume") {
    const payload = await readJsonBody(req);
    sendJson(res, 200, { status: "ok", control: setAutomationPaused(false, payload.reason || "Resumed from ops endpoint") });
    return;
  }

  if (req.method === "GET" && url.pathname === "/ops/analytics") {
    sendJson(res, 200, { status: "ok", snapshots: getAnalyticsSnapshots(50), scheduledPosts: getScheduledPosts(50) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/ops/niches") {
    sendJson(res, 200, runNicheScout());
    return;
  }

  if (req.method === "GET" && url.pathname === "/ops/channels") {
    try {
      const channels = await getChannels();
      sendJson(res, 200, {
        status: "ok",
        channels: channels.map((channel) => ({
          id: channel?.id || channel?._id || channel?.integrationId || null,
          name: channel?.name || channel?.username || channel?.identifier || null,
          provider: channel?.provider || channel?.type || channel?.social || channel?.identifier || null,
        })),
      });
    } catch (error) {
      sendJson(res, 500, { status: "error", error: error.message, ts: new Date().toISOString() });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/ops/agents") {
    sendJson(res, 200, dashboardAgentStatus());
    return;
  }

  if (req.method === "GET" && url.pathname === "/ops/agent-memory") {
    sendJson(res, 200, {
      status: "ok",
      recommendations: agentRecommendations(),
      memory: getMemoryStatus(),
      shared: getSharedMemory(Number(url.searchParams.get("limit") || 50)),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/spawn-agent-task") {
    try {
      const payload = await readJsonBody(req);
      sendJson(res, 200, spawnAgentTask(payload));
    } catch (error) {
      sendJson(res, 500, { status: "error", error: error.message, ts: new Date().toISOString() });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/quality-check") {
    const payload = await readJsonBody(req);
    sendJson(res, 200, { status: "ok", quality: scorePostQuality({ post: payload.post || payload, niche: payload.niche || "", audience: payload.audience || "general" }) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/ops/latest-video") {
    try {
      sendVideo(res, latestVideoPath());
    } catch (error) {
      sendJson(res, 404, { status: "error", error: error.message, ts: new Date().toISOString() });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/ops/latest-video-page") {
    sendHtml(res, 200, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Empire OS Latest Video</title>
  <style>
    :root { color-scheme: dark; background: #0d1117; color: #e6edf3; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0d1117; }
    main { width: min(420px, 92vw); padding: 20px; }
    h1 { font-size: 18px; margin: 0 0 14px; }
    video { width: 100%; aspect-ratio: 9 / 16; background: #000; border: 1px solid #30363d; border-radius: 8px; }
  </style>
</head>
<body>
  <main>
    <h1>Latest Empire OS Video</h1>
    <video controls autoplay muted playsinline src="/ops/latest-video"></video>
  </main>
</body>
</html>`);
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/check") {
    try {
      const report = await runOpsWatchers();
      sendJson(res, report.status === "p0" ? 503 : 200, report);
    } catch (error) {
      sendJson(res, 500, { status: "error", error: error.message, ts: new Date().toISOString() });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/slack-test") {
    const result = await safeSlack({
      title: "Slack test",
      level: "success",
      message: "Empire OS can send notifications to Slack.",
      fields: [
        { label: "Worker", value: process.env.PUBLIC_WORKER_URL || "local" },
        { label: "Time", value: new Date().toISOString() },
      ],
      url: `${process.env.PUBLIC_WORKER_URL || ""}/ops/dashboard`,
    });
    sendJson(res, result.status === "sent" ? 200 : 503, { status: result.status === "sent" ? "pass" : "fail", slack: result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/verify") {
    try {
      const report = await verifyAutomationReady({ requireVideoInventory: url.searchParams.get("requireVideo") === "true" });
      sendJson(res, report.status === "fail" ? 503 : 200, report);
    } catch (error) {
      sendJson(res, 500, { status: "error", error: error.message, ts: new Date().toISOString() });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/verify-task") {
    try {
      const payload = await readJsonBody(req);
      const report = await verifyTaskCompletion(payload);
      sendJson(res, report.status === "fail" ? 503 : 200, report);
    } catch (error) {
      sendJson(res, 500, { status: "error", error: error.message, ts: new Date().toISOString() });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/video-test") {
    try {
      const payload = await readJsonBody(req);
      const video = await generateVideo({
        niche: payload.niche || "AI productivity tools and automation for beginners",
        style: payload.style || "dark",
        hook: payload.hook || "This simple automation saves hours",
        script: payload.script || "This simple automation saves hours every week. First, write down the task you repeat the most. Next, turn it into a checklist. Then let your tools handle the first draft while you review the final result. The win is not replacing your judgment. The win is removing the boring steps so you can focus on decisions that matter.",
        allowLocalFallback: payload.allowLocalDebug === true,
      });
      const verification = await verifyMediaSource(video);
      await safeSlack({
        title: verification.status === "fail" ? "Video test failed quality gate" : "Video test generated",
        level: verification.status === "fail" ? "warning" : "success",
        message: verification.status === "fail"
          ? "A generated video did not pass verification, so it should not be posted."
          : "A Higgsfield video test generated and passed media verification.",
        fields: [
          { label: "Niche", value: payload.niche || "AI productivity tools and automation for beginners" },
          { label: "Style", value: payload.style || "dark" },
          { label: "Video", value: video },
        ],
        url: `${process.env.PUBLIC_WORKER_URL || ""}/ops/latest-video-page`,
      });
      sendJson(res, verification.status === "fail" ? 503 : 200, { status: verification.status, video, verification });
    } catch (error) {
      await safeSlack({
        title: "Video test crashed",
        level: "urgent",
        message: error.message,
        url: `${process.env.PUBLIC_WORKER_URL || ""}/ops/dashboard`,
      });
      sendJson(res, 500, { status: "error", error: error.message, ts: new Date().toISOString() });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/postiz-test") {
    try {
      const payload = await readJsonBody(req);
      const channels = await getChannels();
      const channel = channels.find((item) => item?.id || item?._id || item?.integrationId);
      if (!channel) throw new Error("No schedulable Postiz channel found");
      const integrationId = payload.integrationId || channel.id || channel._id || channel.integrationId;
      const videoPath = payload.videoPath || latestVideoPath();
      const verification = await verifyMediaSource(videoPath);
      if (verification.status === "fail") {
        sendJson(res, 503, { status: "fail", step: "video-verification", videoPath, verification });
        return;
      }
      const scheduleAt = payload.date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = await schedulePost({
        integrationId,
        date: scheduleAt,
        mediaPath: videoPath,
        requireMedia: true,
        content: payload.content || "Ops test: verified Empire OS video pipeline and Postiz scheduling. This is a scheduled test post.",
      });
      await safeSlack({
        title: "Postiz test scheduled",
        level: "success",
        message: "Empire OS successfully scheduled a verified test post through Postiz.",
        fields: [
          { label: "Integration", value: integrationId },
          { label: "Scheduled for", value: scheduleAt },
          { label: "Video", value: videoPath },
        ],
        url: `${process.env.PUBLIC_WORKER_URL || ""}/ops/dashboard`,
      });
      sendJson(res, 200, { status: "pass", integrationId, scheduledFor: scheduleAt, videoPath, verification, postiz: result });
    } catch (error) {
      await safeSlack({
        title: "Postiz test failed",
        level: "urgent",
        message: error.message,
        url: `${process.env.PUBLIC_WORKER_URL || ""}/ops/dashboard`,
      });
      sendJson(res, 500, { status: "error", error: error.message, ts: new Date().toISOString() });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/ops/e2e-test") {
    try {
      const payload = await readJsonBody(req);
      const channels = await getChannels();
      const channel = channels.find((item) => item?.id || item?._id || item?.integrationId);
      if (!channel) throw new Error("No schedulable Postiz channel found");
      const channelName = channel.name || channel.username || channel.identifier || "Empire OS Channel";
      const integrationId = payload.integrationId || channel.id || channel._id || channel.integrationId;
      const niche = payload.niche || "AI productivity tools and automation for beginners";
      const post = await generateE2ePost({ channelName, niche });
      assertPolicySafePost({ post, channelName, audience: "general", niche });
      const quality = assertContentQuality({ post, niche, audience: "general" });
      const videoPath = await generateVideo({ script: post.script || post.caption, hook: post.hook, niche, style: payload.style || "dark" });
      const verification = await verifyMediaSource(videoPath);
      if (verification.status === "fail") {
        await safeSlack({
          title: "E2E stopped at video quality gate",
          level: "warning",
          message: "The post was not scheduled because the generated video failed verification.",
          fields: [
            { label: "Niche", value: niche },
            { label: "Video", value: videoPath },
          ],
          url: `${process.env.PUBLIC_WORKER_URL || ""}/ops/dashboard`,
        });
        sendJson(res, 503, { status: "fail", step: "video-verification", post, videoPath, verification });
        return;
      }
      const scheduleAt = payload.date || new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
      const postiz = await schedulePost({
        integrationId,
        date: scheduleAt,
        mediaPath: videoPath,
        requireMedia: true,
        content: post.caption || post.script,
      });
      recordScheduledPost({ title: post.title, channelName, integrationId, scheduledFor: scheduleAt, postiz, videoPath, niche });
      await safeSlack({
        title: "E2E post scheduled",
        level: "success",
        message: "Empire OS completed idea, policy, quality, Higgsfield video, verification, and Postiz scheduling.",
        fields: [
          { label: "Title", value: post.title },
          { label: "Channel", value: channelName },
          { label: "Niche", value: niche },
          { label: "Scheduled for", value: scheduleAt },
        ],
        url: `${process.env.PUBLIC_WORKER_URL || ""}/ops/dashboard`,
      });
      sendJson(res, 200, { status: "pass", channelName, integrationId, niche, scheduledFor: scheduleAt, post, quality, videoPath, verification, postiz });
    } catch (error) {
      await safeSlack({
        title: "E2E test failed",
        level: "urgent",
        message: error.message,
        url: `${process.env.PUBLIC_WORKER_URL || ""}/ops/dashboard`,
      });
      sendJson(res, 500, { status: "error", error: error.message, ts: new Date().toISOString() });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/standup") {
    sendJson(res, 202, { status: "running", ts: new Date().toISOString() });
    (async () => {
      console.log("[Standup] Manual trigger received");
      try { await runDailyMeeting(); await verifyTaskCompletion({ task: "manual-daily-meeting" }); } catch (e) { console.error("[Standup] dailyMeeting:", e.message); }
      try { await runBrainRotMeeting(); await verifyTaskCompletion({ task: "manual-brainrot-meeting" }); } catch (e) { console.error("[Standup] brainRotMeeting:", e.message); }
      try { await runKidsMeeting(); await verifyTaskCompletion({ task: "manual-kids-meeting" }); } catch (e) { console.error("[Standup] kidsMeeting:", e.message); }
      console.log("[Standup] Complete");
    })();
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`[Empire OS] Worker online - port ${PORT}`);
});

startCronJobs();
console.log("[Empire OS] Cron scheduled.");
