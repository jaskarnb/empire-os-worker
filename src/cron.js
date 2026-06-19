/**
 * Empire OS — Cron Scheduler
 * Runs all three meeting agents sequentially at 7 AM UTC every day.
 *
 * Order:
 *   1. Daily Meeting   (adult channels — finance, crime, tech, fitness, AI)
 *   2. Brain Rot       (Gen Z meme channels — sigma, ohio, skibidi, npc, rizz)
 *   3. Kids            (children's channels — tiny, fruit, rainbow, happy, fun)
 *
 * Each agent filters Postiz channels by keyword so they only touch their own accounts.
 * Failures in one meeting do NOT stop the others.
 *
 * ENV VARS:
 *   AUTO_STANDUP=true   — must be set to enable cron
 *   STANDUP_HOUR=7      — UTC hour to run (default 7)
 */
import cron from "node-cron";
import { runDailyMeeting } from "./agents/dailyMeeting.js";
import { runBrainRotMeeting } from "./agents/brainRotMeeting.js";
import { runKidsMeeting } from "./agents/kidsMeeting.js";

export function startCronJobs() {
  if (process.env.AUTO_STANDUP !== "true") {
    console.log("[Cron] AUTO_STANDUP not set — skipping schedule.");
    return;
  }

  const hour = process.env.STANDUP_HOUR || "7";
  console.log(`[Cron] Scheduling all 3 Empire meetings at ${hour}:00 UTC daily.`);

  cron.schedule(`0 ${hour} * * *`, async () => {
    console.log("\n[Cron] ⚡ Firing all empire meetings…");

    // 1. Adult channels (finance, crime, tech, fitness, AI)
    try {
      await runDailyMeeting();
    } catch (e) {
      console.error("[Cron] Daily meeting crashed:", e.message);
    }

    // 2. Brain rot / Gen Z channels (sigma, ohio, skibidi, npc, rizz)
    try {
      await runBrainRotMeeting();
    } catch (e) {
      console.error("[Cron] Brain rot meeting crashed:", e.message);
    }

    // 3. Kids channels (tiny, fruit, rainbow, happy, fun)
    try {
      await runKidsMeeting();
    } catch (e) {
      console.error("[Cron] Kids meeting crashed:", e.message);
    }

    console.log("[Cron] ✓ All meetings complete. Empire running.\n");
  });
}
