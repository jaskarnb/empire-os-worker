import http from "http";
import { startCronJobs } from "./cron.js";
import { runDailyMeeting } from "./agents/dailyMeeting.js";
import { runBrainRotMeeting } from "./agents/brainRotMeeting.js";
import { runKidsMeeting } from "./agents/kidsMeeting.js";
import { readRecentIncidents } from "./tools/opsIncidents.js";
import { runOpsWatchers } from "./watchers/opsWatchers.js";

const PORT = process.env.PORT || 3001;

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// HTTP server: /health, /standup, /ops/status, /ops/check
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { status: "ok", ts: new Date().toISOString() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/ops/status") {
    sendJson(res, 200, {
      status: "ok",
      ts: new Date().toISOString(),
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

  if (req.method === "POST" && url.pathname === "/standup") {
    sendJson(res, 202, { status: "running", ts: new Date().toISOString() });
    (async () => {
      console.log("[Standup] Manual trigger received");
      try { await runDailyMeeting(); } catch (e) { console.error("[Standup] dailyMeeting:", e.message); }
      try { await runBrainRotMeeting(); } catch (e) { console.error("[Standup] brainRotMeeting:", e.message); }
      try { await runKidsMeeting(); } catch (e) { console.error("[Standup] kidsMeeting:", e.message); }
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
