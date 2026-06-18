// RCH-02 · Nova — scheduling
import { schedulePost } from "../tools/postiz.js";

const SLOTS = ["Today 18:00", "Today 20:30", "Tomorrow 12:00", "Tomorrow 17:00"];

export async function scheduleContent(job) {
  const slot = SLOTS[Math.floor(Math.random() * SLOTS.length)];
  let postizId;
  if (process.env.POSTIZ_API_KEY) {
    try {
      const result = await schedulePost({ caption: `${job.caption}\n\n${(job.hashtags || []).join(" ")}`, platform: job.platform, videoPath: job.videoPath, slot });
      postizId = result.id;
    } catch (e) { console.warn("[nova] Postiz/Buffer failed:", e.message); }
  }
  return { slot, postizId };
}
