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
import { getChannels, schedulePost } from "./tools/postiz.js";
import { generateVideo } from "./tools/videoGen.js";
import { getScheduledPosts, getSpendState, isAutomationPaused, recordScheduledPost } from "./tools/opsState.js";

let meetingsRunning = false;
let fallbackRunning = false;

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

function timeoutMs(name) {
  const envName = `${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_TIMEOUT_MS`;
  return Number(process.env[envName] || process.env.MEETING_TIMEOUT_MS || 4 * 60 * 1000);
}

async function withTimeout(promise, label, ms = timeoutMs(label)) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function channelId(channel) {
  return channel?.id || channel?._id || channel?.integrationId || null;
}

function channelName(channel) {
  return channel?.name || channel?.username || channel?.identifier || channelId(channel) || "Empire OS Channel";
}

function fallbackPostFor(channel) {
  const name = channelName(channel);
  const lower = name.toLowerCase();
  if (/alibi|horror|scary|crime|mystery/.test(lower)) {
    return {
      title: "The Porch Light Glitch",
      niche: "True crime, cold cases, mystery storytelling, non-graphic suspense, eerie found-footage horror",
      style: "horror",
      hook: "The porch camera caught this first",
      script: "The porch camera caught this first. At 2:13 in the morning, the light turned on by itself, even though the switch inside was off. Then the camera audio picked up one soft knock, followed by a whisper that sounded like the homeowner's name. When the family checked the footage, nobody was standing there. But one frame showed a shadow stretching across the door from inside the house. The strangest part is what happened next. The camera cut out for exactly seven seconds, and when it came back, the door was already open.",
      caption: "The camera missed the worst seven seconds.\nWould you check the door?\n#scary #horror #mystery #creepy #fyp",
    };
  }
  if (/tech|brain|meme|talk/.test(lower)) {
    return {
      title: "AI Learns Group Chat",
      niche: "Gen Z brainrot videos, chaotic meme storytelling, absurd internet humor, fast visual jokes, and viral TikTok-style comedy",
      style: "brainrot",
      hook: "The AI entered the group chat",
      script: "The AI entered the group chat and immediately tried to be normal. First it said hello with perfect punctuation, which was already suspicious. Then somebody sent one blurry meme, and the AI responded with a three paragraph emotional analysis. The chat went silent. So it tried again, posted a dancing toaster, and accidentally became the funniest person there. By the end, everyone was asking it for advice, but the AI only replied with one sentence: I have become the algorithm.",
      caption: "It adapted way too fast.\nThe algorithm is awake.\n#brainrot #memes #genz #aitok #fyp",
    };
  }
  return {
    title: "Rainbow Rescue Race",
    niche: "Kids-safe cheerful animated stories, bright funny characters, simple adventures, colors, jokes, and playful lessons for ages 4-8",
    style: "kids",
    hook: "Can you spot the rainbow key",
    script: "Can you spot the rainbow key? Benny the little bear found a tiny door in the garden, but it would only open with the right color. First he tried red, and the flowers clapped. Then he tried blue, and the puddle giggled. Finally, a yellow butterfly showed him a rainbow key hiding behind a leaf. Benny opened the door and found a picnic for all his friends. Count the colors with Benny, then wave goodbye before the door sparkles shut.",
    caption: "A cheerful color hunt for little explorers.\nCan you name every color?\n#kidsvideo #learncolors #storytime #funforkids #animation",
  };
}

async function scheduleVerifiedFallback(reason) {
  if (fallbackRunning) return { status: "skipped", reason: "fallback-running" };
  if (getScheduledPosts(1).length > 0) return { status: "skipped", reason: "already-scheduled" };

  fallbackRunning = true;
  try {
    const channels = await getChannels();
    const schedulable = channels.filter((channel) => channelId(channel));
    if (!schedulable.length) throw new Error("No schedulable Postiz channel found for fallback");

    const channel = schedulable.find((item) => /alibi|horror|scary|crime|mystery/i.test(channelName(item))) || schedulable[0];
    const post = fallbackPostFor(channel);
    const scheduleAt = new Date(Date.now() + Number(process.env.FALLBACK_SCHEDULE_DELAY_MINUTES || 35) * 60 * 1000).toISOString();

    console.log(`[Cron] Running verified fallback post for ${channelName(channel)} (${reason})...`);
    const videoPath = await generateVideo({
      script: post.script,
      hook: post.hook,
      niche: post.niche,
      style: post.style,
    });
    const postiz = await schedulePost({
      integrationId: channelId(channel),
      content: post.caption,
      date: scheduleAt,
      mediaPath: videoPath,
      requireMedia: true,
    });
    recordScheduledPost({
      title: post.title,
      channelName: channelName(channel),
      integrationId: channelId(channel),
      scheduledFor: scheduleAt,
      postiz,
      videoPath,
      niche: post.niche,
    });
    console.log(`[Cron] Verified fallback scheduled at ${scheduleAt}`);
    return { status: "scheduled", title: post.title, channel: channelName(channel), scheduledFor: scheduleAt, videoPath };
  } finally {
    fallbackRunning = false;
  }
}

async function ensureQueueHasPost(reason) {
  if (getScheduledPosts(1).length > 0) return { status: "ok", reason: "already-scheduled" };
  try {
    return await scheduleVerifiedFallback(reason);
  } catch (error) {
    console.error(`[Cron] Verified fallback failed (${reason}):`, error.message);
    try {
      await notifySlack({
        title: "Verified fallback failed",
        level: "urgent",
        message: error.message,
        url: `${process.env.PUBLIC_WORKER_URL || ""}/ops/dashboard`,
      });
    } catch (slackError) {
      console.error("[Slack] Fallback failure notification failed:", slackError.message);
    }
    return { status: "failed", error: error.message };
  }
}

async function runMeetingStep({ label, meeting, verifier }) {
  try {
    await withTimeout(meeting(), `${label} meeting`);
    await withTimeout(runVerifierAfterTask(verifier), `${label} verifier`, Number(process.env.VERIFIER_TIMEOUT_MS || 90_000));
    return `${label} meeting passed`;
  } catch (e) {
    console.error(`[Cron] ${label} meeting crashed:`, e.message);
    return `${label} meeting failed: ${e.message}`;
  }
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
    results.push(await runMeetingStep({ label: "Daily", meeting: runDailyMeeting, verifier: "daily-meeting" }));
    results.push(await runMeetingStep({ label: "Brainrot", meeting: runBrainRotMeeting, verifier: "brainrot-meeting" }));
    results.push(await runMeetingStep({ label: "Kids", meeting: runKidsMeeting, verifier: "kids-meeting" }));

    const fallbackResult = await ensureQueueHasPost(`meetings-finished:${reason}`);
    if (fallbackResult.status === "scheduled") {
      results.push(`Verified fallback scheduled: ${fallbackResult.title}`);
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
  if (process.env.AUTO_STANDUP === "false") return false;
  if (process.env.AUTO_STANDUP === "true") return true;
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
  const lastFinishedAt = Date.parse(state.lastFinishedAt || 0) || 0;
  const staleRunningMs = Number(process.env.CATCHUP_STALE_RUNNING_MINUTES || 20) * 60 * 1000;
  const isStillRunning = lastStartedAt && !lastFinishedAt && now - lastStartedAt < staleRunningMs;
  const recentlyFinished = lastFinishedAt && now - lastFinishedAt < minMs;
  if (isStillRunning || recentlyFinished) {
    console.log(`[Cron] Queue catch-up skipped (${reason}); recent attempt still within guard window.`);
    return;
  }

  writeCatchupState({
    ...state,
    lastStartedAt: new Date().toISOString(),
    lastFinishedAt: null,
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
