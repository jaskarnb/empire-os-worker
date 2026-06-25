/**
 * Empire OS Cron Scheduler
 *
 * AUTO_STANDUP=true enables daily content meetings.
 * OPS_WATCHERS_ENABLED=true enables recurring production health checks.
 */
import cron from "node-cron";
import { runDailyMeeting } from "./agents/dailyMeeting.js";
import { runBrainRotMeeting } from "./agents/brainRotMeeting.js";
import { runKidsMeeting } from "./agents/kidsMeeting.js";
import { runOpsWatchers } from "./watchers/opsWatchers.js";

async function runAllMeetings() {
  console.log("\n[Cron] Firing all empire meetings...");

  try {
    await runDailyMeeting();
  } catch (e) {
    console.error("[Cron] Daily meeting crashed:", e.message);
  }

  try {
    await runBrainRotMeeting();
  } catch (e) {
    console.error("[Cron] Brain rot meeting crashed:", e.message);
  }

  try {
    await runKidsMeeting();
  } catch (e) {
    console.error("[Cron] Kids meeting crashed:", e.message);
  }

  console.log("[Cron] All meetings complete. Empire running.\n");
}

function startStandupCron() {
  if (process.env.AUTO_STANDUP !== "true") {
    console.log("[Cron] AUTO_STANDUP not set - skipping content schedule.");
    return;
  }

  const hour = process.env.STANDUP_HOUR || "7";
  console.log(`[Cron] Scheduling all 3 Empire meetings at ${hour}:00 UTC daily.`);
  cron.schedule(`0 ${hour} * * *`, runAllMeetings);
}

function opsCronExpression(minutes) {
  if (minutes >= 60) return "0 * * * *";
  const safeMinutes = Math.min(Math.max(Math.floor(minutes), 15), 59);
  return `*/${safeMinutes} * * * *`;
}

function startOpsWatcherCron() {
  if (process.env.OPS_WATCHERS_ENABLED !== "true") {
    console.log("[Cron] OPS_WATCHERS_ENABLED not set - skipping ops watcher schedule.");
    return;
  }

  const minutes = Number(process.env.OPS_WATCHERS_INTERVAL_MINUTES || 60);
  const expression = opsCronExpression(Number.isFinite(minutes) ? minutes : 60);
  console.log(`[Cron] Scheduling Ops Watchers with cron: ${expression}`);

  cron.schedule(expression, async () => {
    try {
      const report = await runOpsWatchers();
      console.log(`[Ops] Watchers complete: ${report.status}`);
    } catch (e) {
      console.error("[Ops] Watchers crashed:", e.message);
    }
  });
}

export function startCronJobs() {
  startStandupCron();
  startOpsWatcherCron();
}
