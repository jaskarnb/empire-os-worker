/**
 * Cron jobs — daily meeting + posting pipeline.
 * Runs at STANDUP_HOUR (default 7) UTC every day when AUTO_STANDUP=true.
 */
import cron from "node-cron";
import { runDailyMeeting } from "./agents/dailyMeeting.js";

export function startCronJobs() {
  if (process.env.AUTO_STANDUP !== "true") {
    console.log("[cron] AUTO_STANDUP=false — skipping scheduled jobs");
    return;
  }
  const hour = process.env.STANDUP_HOUR || "7";
  cron.schedule(`0 ${hour} * * *`, async () => {
    console.log(`[cron] Daily meeting triggered at ${new Date().toISOString()}`);
    try {
      await runDailyMeeting();
    } catch (e) {
      console.error("[cron] Daily meeting failed:", e.message, e.stack);
    }
  });
  console.log(`[cron] Daily meeting scheduled at ${hour}:00 UTC`);
}
