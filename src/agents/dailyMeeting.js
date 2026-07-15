/**
 * Daily Meeting - Empire OS
 * Adult channels: finance, crime, tech, fitness, and AI.
 */
import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { getChannels, getRecentPosts, schedulePost } from "../tools/postiz.js";
import { assertPolicySafePost } from "../tools/policyGuard.js";
import { generateVideo } from "../tools/videoGen.js";
import { addPexelsAttribution } from "../tools/stockVideoGen.js";
import { assertContentQuality } from "./contentQuality.js";
import { isAutomationPaused, recordScheduledPost } from "../tools/opsState.js";

const client = () => new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: Number(process.env.ANTHROPIC_TIMEOUT_MS || 90_000),
});

const SPECIALTY_AGENT_CHANNELS = [
  "vaultmmnbul", "vaultrise", "thevaultrise", "vault rise",
  "techtaks", "thetechtaks", "tech taks", "techtalks", "thetechtalks", "tech talks",
];

const CHANNEL_CONFIG = [
  {
    match: "beyondthealibi",
    niche: "Realistic caught-on-camera horror shorts, unsettling POV clips, dark hallway and backyard scares, scary voiceover, jump scares, suspenseful reveals, and scary-but-safe paranormal mystery",
    style: "horror",
    postsPerDay: 3,
    times: ["00:00", "02:00", "22:00"],
    affiliate: { name: "NordVPN", offer: "67% off + 3 months free", cta: "Lock down your browsing -> link in bio" },
  },
  {
    match: "vault",
    niche: "Finance, wealth building, passive income, money mindset for 18-35 year olds",
    style: "faceless-reels",
    postsPerDay: 3,
    times: ["11:00", "17:00", "00:00"],
    affiliate: { name: "Webull", offer: "Get a FREE stock (worth up to $1,600) when you sign up", cta: "Get your free stock -> link in bio" },
  },
  {
    match: "alibi",
    niche: "Realistic caught-on-camera horror shorts, unsettling POV clips, dark hallway and backyard scares, scary voiceover, jump scares, suspenseful reveals, and scary-but-safe paranormal mystery",
    style: "horror",
    postsPerDay: 3,
    times: ["00:00", "02:00", "22:00"],
    affiliate: { name: "NordVPN", offer: "67% off + 3 months free", cta: "Lock down your browsing -> link in bio" },
  },
  {
    match: "tech",
    niche: "AI tools and tech news explained simply for everyday people",
    style: "faceless-reels",
    postsPerDay: 3,
    times: ["12:00", "16:00", "23:00"],
    affiliate: { name: "Hostinger", offer: "Build your own AI-powered website for $2.99/mo (80% off)", cta: "Start your site for $2.99 -> link in bio" },
  },
  {
    match: "lift",
    niche: "Fitness, gym motivation, workout tips, body transformation",
    style: "faceless-reels",
    postsPerDay: 2,
    times: ["11:00", "17:00"],
    affiliate: { name: "WHOOP", offer: "Get 1 month free on WHOOP", cta: "Try WHOOP free -> link in bio" },
  },
  {
    match: "hub",
    niche: "AI productivity tools and automation for beginners",
    style: "faceless-reels",
    postsPerDay: 2,
    times: ["13:00", "22:00"],
    affiliate: { name: "Hostinger", offer: "Launch your automation business online for $2.99/mo", cta: "Get your site live today -> link in bio" },
  },
];

function getChannelConfig(name = "") {
  const lower = name.toLowerCase();
  return CHANNEL_CONFIG.find((c) => lower.includes(c.match)) || {
    niche: "viral short-form content",
    postsPerDay: 1,
    times: ["12:00"],
    affiliate: null,
  };
}

function isSpecialtyAgentChannel(name = "") {
  const lower = name.toLowerCase();
  return SPECIALTY_AGENT_CHANNELS.some((keyword) => lower.includes(keyword));
}

async function scoutTrends(niche) {
  try {
    const resp = await client().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      messages: [{ role: "user", content: `Search for what is trending TODAY in "${niche}" content on TikTok and YouTube Shorts. Give me 3 specific viral video formats or topics. Be concrete.` }],
    });
    const textBlock = resp.content.find((b) => b.type === "text");
    return textBlock?.text || "Focus on evergreen, high-value hooks.";
  } catch (e) {
    console.warn("[Scout] Web search failed, fallback:", e.message);
    const resp = await client().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: `3 viral video formats for "${niche}" on TikTok/Shorts?` }],
    });
    return resp.content[0].text;
  }
}

async function generatePosts(channelName, niche, postsPerDay, trends, perfSummary, affiliate, postIndex = 0) {
  const perfContext = perfSummary
    ? `RECENT PERFORMANCE:\n${perfSummary}\n\nLearn from what worked.`
    : "NEW CHANNEL: Prioritise proven high-retention hooks and curiosity gaps.";

  const affiliateBlock = affiliate && postIndex % 2 === 0
    ? `MONETIZATION - include naturally in this post:\n- Partner: ${affiliate.name}\n- Offer: ${affiliate.offer}\n- End caption with: "${affiliate.cta}"\n- Tie the CTA to the video topic so it feels organic.`
    : "MONETIZATION: Skip affiliate CTA this post - pure value builds trust.";

  const prompt = `You are the content strategist for "${channelName}", a ${niche} channel on TikTok/YouTube Shorts.

TRENDING RIGHT NOW:
${trends}

${perfContext}

${affiliateBlock}

Generate exactly ${postsPerDay} post(s). Each must be a standalone 20-59 second video concept.
Every video must be so entertaining and high-retention that viewers want to keep watching and rewatch it.
For faceless-reel channels, use clean b-roll, bold captions, fast cuts, and practical or curiosity-driven payoff. Do not copy any proprietary template exactly.
For horror pages, use a scary voice, suspense build, silence before the reveal, and one clear jump scare without gore.
Do not make random-word scripts. Every script must read like a real spoken story with setup, escalation, payoff, and ending.
The video direction must clearly match the script, not just the niche.
Use reference-style patterns from trends, but never copy exact wording, footage, logos, or characters.

Return ONLY valid JSON - no markdown, no explanation:
[
  {
    "title": "Internal title (3-6 words)",
    "hook": "The exact first 5-8 spoken words - the scroll-stopping opener",
    "script": "Full 55-150 word voiceover script for a 20-59 second video. Natural sentences only. Clear setup, escalation, payoff, and ending. Conversational tone, constant curiosity, no dead spots.",
    "caption": "Social media caption: hook sentence first, 2-line body, affiliate CTA if applicable, then 5 hashtags on a new line."
  }
]`;

  try {
    const resp = await client().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1400,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = resp.content[0].text;
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      console.error(`[Muse] No JSON for ${channelName}`);
      return fallbackPosts(channelName, niche, postsPerDay, affiliate, postIndex);
    }
    return JSON.parse(match[0]).slice(0, postsPerDay);
  } catch (e) {
    console.error(`[Muse] Parse error: ${e.message}`);
    return fallbackPosts(channelName, niche, postsPerDay, affiliate, postIndex);
  }
}

function fallbackPosts(channelName, niche, postsPerDay, affiliate, postIndex = 0) {
  const isHorror = /horror|scary|paranormal|creepy|alibi/i.test(`${channelName} ${niche}`);
  const affiliateLine = affiliate && postIndex % 2 === 0 ? ` ${affiliate.cta}` : "";
  const horror = {
    title: "Backyard Camera Freeze",
    hook: "The porch camera caught this",
    script: "The porch camera caught this right after midnight. At first, the backyard looked empty, just rain tapping the fence and one light flickering near the steps. Then the camera glitched for half a second. When the picture came back, a tall shadow was standing behind the tree line. The person inside whispered that nobody should be out there. The shadow leaned forward like it heard them. Then it moved across the yard in one quick step, and the camera cut to black right before the doorbell rang.",
    caption: `The camera froze at the worst second.\nWould you open the door?${affiliateLine}\n#scary #horror #creepy #paranormal #foundfootage`,
  };
  const general = {
    title: "Simple Viral Explainer",
    hook: "Most people miss this",
    script: "Most people miss this because it looks normal at first. The real trick is watching what changes from one second to the next. First, the obvious part grabs your attention. Then the small detail in the background explains what is really happening. By the time you notice it, the whole scene feels different. That is why the best short videos do not just show random clips. They set up one clear question, build tension, then give you a payoff that makes you want to watch again.",
    caption: `The detail changes everything.\nWatch it twice.${affiliateLine}\n#viral #shorts #story #explained #fyp`,
  };
  const base = isHorror ? horror : general;
  return Array.from({ length: postsPerDay }, (_, index) => ({
    ...base,
    title: index === 0 ? base.title : `${base.title} ${index + 1}`,
  }));
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
    if (isSpecialtyAgentChannel(name)) {
      console.log(`[Atlas] Skipping ${name}; handled by kids/brainrot specialty agent.`);
      continue;
    }
    const config = getChannelConfig(name);
    if (!(name in postCounters)) postCounters[name] = 0;

    console.log("\n" + "-".repeat(40));
    console.log(`[Atlas] ${name} (${config.niche.split(",")[0].trim()})`);

    console.log("[Scout] Scanning trends...");
    const trends = await scoutTrends(config.niche);
    console.log("[Scout] Done:", trends.slice(0, 80) + "...");

    console.log(`[Muse] Generating ${config.postsPerDay} post idea(s)...`);
    const posts = await generatePosts(name, config.niche, config.postsPerDay, trends, perfSummary, config.affiliate || null, postCounters[name]);
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
        assertPolicySafePost({ post, channelName: name, audience: "general", niche: config.niche });
        assertContentQuality({ post, niche: config.niche, audience: "general" });
        videoPath = await generateVideo({ script: post.script || post.caption, hook: post.hook, niche: config.niche, style: config.style || "dark" });
        console.log(`[Nova] Scheduling video at ${date}...`);
        const usesStockStyle = ["horror", "beauty", "kids", "faceless-reels"].includes(config.style || "dark") && process.env.PEXELS_API_KEY;
        const content = usesStockStyle ? addPexelsAttribution(post.caption) : post.caption;
        const postiz = await schedulePost({ integrationId: ch.id, content, date, mediaPath: videoPath, requireMedia: true });
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
