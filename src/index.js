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
import { renderOpsDashboard } from "./tools/opsDashboard.js";
import { readLastOpsReport, readRecentIncidents } from "./tools/opsIncidents.js";
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
    });
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
      });
      const verification = await verifyMediaSource(video);
      sendJson(res, verification.status === "fail" ? 503 : 200, { status: verification.status, video, verification });
    } catch (error) {
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
      sendJson(res, 200, { status: "pass", integrationId, scheduledFor: scheduleAt, videoPath, verification, postiz: result });
    } catch (error) {
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
      const videoPath = await generateVideo({ script: post.script || post.caption, hook: post.hook, niche, style: payload.style || "dark" });
      const verification = await verifyMediaSource(videoPath);
      if (verification.status === "fail") {
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
      sendJson(res, 200, { status: "pass", channelName, integrationId, niche, scheduledFor: scheduleAt, post, videoPath, verification, postiz });
    } catch (error) {
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
