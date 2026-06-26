import http from "http";
import { startCronJobs } from "./cron.js";
import { runDailyMeeting } from "./agents/dailyMeeting.js";
import { runBrainRotMeeting } from "./agents/brainRotMeeting.js";
import { runKidsMeeting } from "./agents/kidsMeeting.js";
import { verifyAutomationReady, verifyMediaSource, verifyTaskCompletion } from "./agents/verifier.js";
import { generateVideo } from "./tools/videoGen.js";
import { renderOpsDashboard } from "./tools/opsDashboard.js";
import { readLastOpsReport, readRecentIncidents } from "./tools/opsIncidents.js";
import { runOpsWatchers } from "./watchers/opsWatchers.js";

const PORT = process.env.PORT || 3001;

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendHtml(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
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
