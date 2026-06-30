/**
 * Daily Meeting - Empire OS
 * Adult/general channels plus remapped entertainment channels.
 */
import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { getChannels, getRecentPosts, schedulePost } from "../tools/postiz.js";
import { assertPolicySafePost } from "../tools/policyGuard.js";
import { generateVideo } from "../tools/videoGen.js";
import { assertContentQuality } from "./contentQuality.js";
import { isAutomationPaused, recordScheduledPost } from "../tools/opsState.js";

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CHANNEL_CONFIG = [
  {
    match: "vault",
    niche: "Kids-safe cheerful animated stories, bright funny characters, simple adventures, colors, jokes, and playful lessons for ages 4-8",
    postsPerDay: 2,
    times: ["19:00", "22:00"],
    affiliate: null,
    style: "kids",
    audience: "kids",
  },
  {
    match: "alibi",
    niche: "True crime, cold cases, murder mysteries, criminal psychology",
    postsPerDay: 3,
    times: ["00:00", "02:00", "22:00"],
    affiliate: { name: "NordVPN", offer: "67% off + 3 months free", cta: "Lock down your browsing -> link in bio" },
    style: "horror",
    audience: "general",
  },
  {
    match: "tech",
    niche: "Gen Z brainrot videos, chaotic meme storytelling, absurd internet humor, fast visual jokes, and viral TikTok-style comedy",
    postsPerDay: 3,
    times: ["20:30", "22:30", "01:30"],
    affiliate: null,
    style: "brainrot",
    audience: "teen",
  },
  {
    match: "lift",
    niche: "Fitness, gym motivation, workout tips, body transformation",
    postsPerDay: 2,
    times: ["11:00", "17:00"],
    affiliate: { name: "WHOOP", offer: "Get 1 month free on WHOOP", cta: "Try WHOOP free -> link in bio" },
    style: "dark",
    audience: "general",
  },
  {
    match: "hub",
    niche: "AI productivity tools and automation for beginners",
    postsPerDay: 2,
    times: ["13:00", "22:00"],
    affiliate: { name: "Hostinger", offer: "Launch your automation business online for $2.99/mo", cta: "Get your site live today -> link in bio" },
    style: "dark",
    audience: "general",
  },
];

function getChannelConfig(name = "") {
  const lower = name.toLowerCase();
  return CHANNEL_CONFIG.find((c) => lower.includes(c.match)) || {
    niche: "viral short-form content",
    postsPerDay: 1,
    times: ["12:00"],
    affiliate: null,
    style: "dark",
    audience: "general",
  };
}

async function scoutTrends(niche) {
  try {
    const resp = await client().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      messages: [{ role: "user", content: `Search for what is trending TODAY in "${niche}" content on TikTok and Instagram Reels. Give me 3 specific viral video formats or topics. Be concrete. Study active creators and extract what is working without copying exact footage or wording.` }],
    });
    const textBlock = resp.content.find((b) => b.type === "text");
    return textBlock?.text || "Focus on evergreen, high-retention hooks and creator-inspired original formats.";
  } catch (e) {
    console.warn("[Scout] Web search failed, fallback:", e.message);
    const resp = await client().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: `3 viral video formats for "${niche}" on TikTok/Reels? Study creator patterns but keep outputs original.` }],
    });
    return resp.content[0].text;
  }
}

function formatInstructions(config) {
  if (config.style === "kids") {
    return "Each concept must be a bright, kid-safe 20-59 second animated video with cheerful voice, simple captions, motion, a complete mini-story, and a clear playful payoff. No scary, violent, unsafe, or adult topics.";
  }
  if (config.style === "brainrot") {
    return "Each concept must be a 20-59 second brainrot/meme video with chaotic motion, punchy captions, fast sound/voice, a clear setup, and a clear joke payoff. Chaotic is fine; confusing random words are not.";
  }
  if (config.style === "horror") {
    return "Each concept must be a 20-59 second horror/true-crime video: either a jump-scare clip with enough buildup and aftermath, or a longer story-style narration, platform-safe, non-graphic, with tension and a clear payoff.";
  }
  return "Each must be a standalone 20-59 second motion-first video concept with a strong hook, escalation, payoff, and niche-matched sound/voice.";
}

async function generatePosts(channelName, config, trends, perfSummary, postIndex = 0) {
  const { niche, postsPerDay, affiliate } = config;
  const perfContext = perfSummary
    ? `RECENT PERFORMANCE:\n${perfSummary}\n\nLearn from what worked.`
    : "NEW CHANNEL: Prioritise proven high-retention hooks and curiosity gaps.";

  const affiliateBlock = affiliate && postIndex % 2 === 0
    ? `MONETIZATION - include naturally in this post:\n- Partner: ${affiliate.name}\n- Offer: ${affiliate.offer}\n- End caption with: "${affiliate.cta}"\n- Tie the CTA to the video topic so it feels organic.`
    : "MONETIZATION: Skip affiliate CTA this post - pure entertainment/value builds trust.";

  const prompt = `You are the content strategist for "${channelName}", a ${niche} channel on TikTok and Instagram Reels.

TRENDING RIGHT NOW:
${trends}

${perfContext}

${affiliateBlock}

${formatInstructions(config)}

Generate exactly ${postsPerDay} post(s). They must be actual video ideas, not photo-with-caption posts.
Every script must read like a real spoken story with setup, escalation, payoff, and ending.
The video direction must clearly match the script beat by beat, not just the niche.
Use creator/reference patterns from trends, but never copy exact wording, footage, logos, characters, or creator identity.
No random-word scripts, disconnected fragments, or low-motion static concepts.

Return ONLY valid JSON - no markdown, no explanation:
[
  {
    "title": "Internal title (3-6 words)",
    "hook": "The exact first 5-8 spoken words - the scroll-stopping opener",
    "script": "55-150 word voiceover for a 20-59 second video. Natural sentences only. Clear setup, escalation, payoff, and ending. No stage directions unless needed for Higgsfield visuals.",
    "caption": "Social media caption: hook sentence first, 1-2 short lines, then 5 relevant hashtags on a new line."
  }
]`;

  const resp = await client().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1400,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = resp.content[0].text;
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) {
    console.error(`[Muse] No JSON for ${channelName}`);
    return [];
  }
  try {
    return JSON.parse(match[0]).slice(0, postsPerDay);
  } catch (e) {
    console.error(`[Muse] Parse error: ${e.message}`);
    return [];
  }
}

function buildScheduleTimes(times) {
  return times.map((t) => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setUTCHours(h, m, 0, 0);
    if (d < new Date()) d.setDate(d.getDate() + 1);
    return d.toISOString();
  });
}

function cleanup(filePath) {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch {}
}

export async function runDailyMeeting() {
  const stamp = new Date().toISOString();
  console.log("\n" + "=".repeat(50));
  console.log(`[Empire OS] Daily Meeting ${stamp}`);
  console.log("=".repeat(50));

  if (isAutomationPaused()) {
    console.log("[Control] Automation is paused - skipping Daily Meeting.");
    return;
  }

  let channels;
  try {
    channels = await getChannels();
    if (!channels.length) throw new Error("No channels returned");
    console.log(`\n[Atlas] ${channels.length} channel(s): ${channels.map((c) => c.name).join(", ")}`);
  } catch (e) {
    console.error("[Atlas] Cannot fetch channels:", e.message);
    return;
  }

  const recentPosts = await getRecentPosts(15);
  let perfSummary = null;
  if (recentPosts.length) {
    perfSummary = recentPosts.slice(0, 6).map((p) => {
      const text = String(p.content || p.message || p.text || "").slice(0, 70);
      const views = p.statistics?.views ?? p.views ?? "?";
      const likes = p.statistics?.likes ?? p.likes ?? "?";
      return `"${text}..." -> ${views} views, ${likes} likes`;
    }).join("\n");
    console.log("\n[Ledger] Recent performance:\n" + perfSummary);
  } else {
    console.log("\n[Ledger] No analytics yet");
  }

  const postCounters = {};

  for (const ch of channels) {
    const name = ch.name || ch.identifier || ch.id;
    const config = getChannelConfig(name);
    if (!(name in postCounters)) postCounters[name] = 0;

    console.log("\n" + "-".repeat(40));
    console.log(`[Atlas] ${name} (${config.niche.split(",")[0].trim()})`);

    console.log("[Scout] Scanning trends and creator patterns...");
    const trends = await scoutTrends(config.niche);
    console.log("[Scout] Done:", trends.slice(0, 80) + "...");

    console.log(`[Muse] Generating ${config.postsPerDay} post idea(s)...`);
    const posts = await generatePosts(name, config, trends, perfSummary, postCounters[name]);
    postCounters[name] += posts.length;

    if (!posts.length) {
      console.error("[Muse] No posts generated - skipping");
      continue;
    }

    const times = buildScheduleTimes(config.times);

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const date = times[i] || times[0];
      let videoPath = null;
      console.log(`\n[Smith] "${post.title}"`);

      try {
        assertPolicySafePost({ post, channelName: name, audience: config.audience || "general", niche: config.niche });
        assertContentQuality({ post, niche: config.niche, audience: config.audience || "general" });
        videoPath = await generateVideo({ script: post.script || post.caption, hook: post.hook, niche: config.niche, style: config.style || "dark" });
        console.log(`[Nova] Scheduling video at ${date}...`);
        const postiz = await schedulePost({ integrationId: ch.id, content: post.caption, date, mediaPath: videoPath, requireMedia: true });
        recordScheduledPost({ title: post.title, channelName: name, integrationId: ch.id, scheduledFor: date, postiz, videoPath, niche: config.niche });
        console.log("[Nova] Scheduled with video");
      } catch (e) {
        console.error(`[RenderGuard] Skipped post because video pipeline failed: ${e.message}`);
      } finally {
        cleanup(videoPath);
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("[Atlas] Meeting complete. Empire running.\n");
}
