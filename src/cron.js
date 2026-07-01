/**
 * Empire OS Cron Scheduler
 *
 * AUTO_STANDUP=true enables daily content meetings.
 * OPS_WATCHERS_ENABLED=true enables recurring production health checks.
 */
import cron from "node-cron";
import fs from "fs";
import path from "path";
import { runDailyMeeting } from "./agents/dailyMeeting.js";
import { runBrainRotMeeting } from "./agents/brainRotMeeting.js";
import { runKidsMeeting } from "./agents/kidsMeeting.js";
import { runVerifierAfterTask } from "./agents/verifier.js";
import { runOpsWatchers } from "./watchers/opsWatchers.js";
import { notifySlack } from "./tools/slackNotify.js";
import { getScheduledPosts, getSpendState, isAutomationPaused } from "./tools/opsState.js";

let meetingsRunning = false;

function stateDir() {
  return path.resolve(process.env.OPS_STATE_DIR || "./output/ops");
}

function catchupStatePath() {
  return path.join(stateDir(), "queue-catchup.json");
}

function readCatchupState() {
  try {
    return JSON.parse(fs.readFileSync(catchupStatePath(), "utf8"));
  } catch {
    return {};
  }
}

function writeCatchupState(value) {
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(catchupStatePath(), JSON.stringify(value, null, 2));
}

async function runAllMeetings(reason = "scheduled") {
  if (meetingsRunning) {
    console.log(`[Cron] Skipping ${reason}; meetings already running.`);
    return { status: "skipped", reason: "already-running" };
  }

  meetingsRunning = true;
  console.log(`\n[Cron] Firing all empire meetings (${reason})...`);
  const results = [];

  try {
    try {
      await runDailyMeeting();
      await runVerifierAfterTask("daily-meeting");
      results.push("Daily meeting passed");
    } catch (e) {
      console.error("[Cron] Daily meeting crashed:", e.message);
      results.push(`Daily meeting failed: ${e.message}`);
    }

    try {
      await runBrainRotMeeting();
      await runVerifierAfterTask("brainrot-meeting");
      results.push("Brainrot meeting passed");
    } catch (e) {
      console.error("[Cron] Brain rot meeting crashed:", e.message);
      results.push(`Brainrot meeting failed: ${e.message}`);
    }

    try {
      await runKidsMeeting();
      await runVerifierAfterTask("kids-meeting");
      results.push("Kids meeting passed");
    } catch (e) {
      console.error("[Cron] Kids meeting crashed:", e.message);
      results.push(`Kids meeting failed: ${e.message}`);
    }

    try {
      await notifySlack({
        title: "Daily automation summary",
        level: "daily",
        message: results.join("\n"),
        url: `${process.env.PUBLIC_WORKER_URL || ""}/ops/dashboard`,
      });
    } catch (e) {
      console.error("[Slack] Daily summary failed:", e.message);
    }

    console.log("[Cron] All meetings complete. Empire running.\n");
    return { status: "complete", results };
  } finally {
    meetingsRunning = false;
  }
}

function standupEnabled() {
  // Explicit opt-out wins
  if (process.env.AUTO_STANDUP === "false") return false;
  // Explicit opt-in
  if (process.env.AUTO_STANDUP === "true") return true;
  // Auto-enable when fully configured: Higgsfield + Postiz key + spend budget
  const higgsfieldOn = process.env.HIGGSFIELD_ENABLED === "true";
  const postizSet = Boolean(process.env.POSTIZ_API_KEY);
  const budgetSet = Number(process.env.DAILY_SPEND_LIMIT_USD || 0) > 0;
  return higgsfieldOn && postizSet && budgetSet;
}

function enoughBudgetForCatchup() {
  const spend = getSpendState();
  if (!spend.enforced) return true;
  const minimum = Number(process.env.CATCHUP_MIN_REMAINING_USD || process.env.HIGGSFIELD_RENDER_COST_USD || 0.35);
  return Number(spend.remaining || 0) >= minimum;
}

async function runQueueCatchup(reason) {
  if (!standupEnabled()) return;
  if (isAutomationPaused()) {
    console.log(`[Cron] Queue catch-up skipped (${reason}); automation is paused.`);
    return;
  }
  if (getScheduledPosts(1).length > 0) {
    console.log(`[Cron] Queue catch-up skipped (${reason}); scheduled posts already exist.`);
    return;
  }
  if (!enoughBudgetForCatchup()) {
    console.log(`[Cron] Queue catch-up skipped (${reason}); spend budget is too low.`);
    return;
  }

  const state = readCatchupState();
  const now = Date.now();
  const minHours = Number(process.env.CATCHUP_MIN_INTERVAL_HOURS || 6);
  const minMs = Math.max(1, minHours) * 60 * 60 * 1000;
  const lastStartedAt = Date.parse(state.lastStartedAt || 0) || 0;
  if (lastStartedAt && now - lastStartedAt < minMs) {
    console.log(`[Cron] Queue catch-up skipped (${reason}); last attempt was less than ${minHours}h ago.`);
    return;
  }

  writeCatchupState({
    ...state,
    lastStartedAt: new Date().toISOString(),
    reason,
  });

  await runAllMeetings(`queue-catchup:${reason}`);

  writeCatchupState({
    ...readCatchupState(),
    lastFinishedAt: new Date().toISOString(),
    scheduledAfterRun: getScheduledPosts(10).length,
  });
}

function startStandupCron() {
  if (!standupEnabled()) {
    console.log("[Cron] Standup not enabled. Set AUTO_STANDUP=true, or ensure HIGGSFIELD_ENABLED=true + POSTIZ_API_KEY + DAILY_SPEND_LIMIT_USD>0.");
    return;
  }
  if (process.env.HIGGSFIELD_ENABLED === "true" && Number(process.env.DAILY_SPEND_LIMIT_USD || 0) <= 0) {
    console.log("[Cron] DAILY_SPEND_LIMIT_USD not set - refusing paid auto-posting schedule.");
    return;
  }

  const hour = process.env.STANDUP_HOUR || "7";
  console.log(`[Cron] Scheduling all 3 Empire meetings at ${hour}:00 UTC daily.`);
  cron.schedule(`0 ${hour} * * *`, () => runAllMeetings("daily-cron"));

  const catchupMinutes = Number(process.env.CATCHUP_CHECK_INTERVAL_MINUTES || 60);
  const catchupExpression = opsCronExpression(Number.isFinite(catchupMinutes) ? catchupMinutes : 60);
  console.log(`[Cron] Scheduling empty-queue catch-up with cron: ${catchupExpression}`);
  cron.schedule(catchupExpression, () => runQueueCatchup("empty-queue-check"));

  const startupDelayMs = Number(process.env.CATCHUP_STARTUP_DELAY_MS || 90_000);
  setTimeout(() => {
    runQueueCatchup("startup-empty-queue").catch((error) => {
      console.error("[Cron] Startup queue catch-up crashed:", error.message);
    });
  }, Math.max(10_000, startupDelayMs));
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
      try {
        await notifySlack({
          title: "Ops watchers crashed",
          level: "urgent",
          message: e.message,
          url: `${process.env.PUBLIC_WORKER_URL || ""}/ops/dashboard`,
        });
      } catch (slackError) {
        console.error("[Slack] Watcher crash notification failed:", slackError.message);
      }
    }
  });
}

export function startCronJobs() {
  startStandupCron();
  startOpsWatcherCron();
}
