/**
 * Cron jobs — optional automated standup.
 */
import cron from "node-cron";
import { standup } from "./agents/atlas.js";

export function startCronJobs() {
  if (process.env.AUTO_STANDUP !== "true") return;
  const hour = process.env.STANDUP_HOUR || "7";
  cron.schedule(`0 ${hour} * * *`, async () => {
    console.log("[cron] Atlas standup running…");
    try {
      const brief = await standup({ pageCount: 8, followersK: 496, revMonth: 12690, ideasInPipeline: 0 });
      console.log("[Atlas standup]\n" + brief);
    } catch (e) { console.error("[cron] standup failed:", e.message); }
  });
  console.log(`[cron] Atlas standup scheduled at ${hour}:00 UTC`);
}
