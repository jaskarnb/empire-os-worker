import http from "http";
import { startCronJobs } from "./cron.js";
import { runDailyMeeting } from "./agents/dailyMeeting.js";
import { runBrainRotMeeting } from "./agents/brainRotMeeting.js";
import { runKidsMeeting } from "./agents/kidsMeeting.js";

const PORT = process.env.PORT || 3001;

// ── HTTP server: /health + /standup ──────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", ts: new Date().toISOString() }));
    return;
  }

  if (req.method === "POST" && req.url === "/standup") {
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "running", ts: new Date().toISOString() }));
    // Fire all 3 meetings async after response
    (async () => {
      console.log("[Standup] Manual trigger received");
      try { await runDailyMeeting();    } catch (e) { console.error("[Standup] dailyMeeting:", e.message); }
      try { await runBrainRotMeeting(); } catch (e) { console.error("[Standup] brainRotMeeting:", e.message); }
      try { await runKidsMeeting();     } catch (e) { console.error("[Standup] kidsMeeting:", e.message); }
      console.log("[Standup] Complete");
    })();
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`[Empire OS] Worker online — port ${PORT}`);
});

// ── Cron ─────────────────────────────────────────────────────────────────────
startCronJobs();
console.log("[Empire OS] Cron scheduled.");
