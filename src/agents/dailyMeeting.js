/**
 * Daily Meeting - Empire OS
 * Adult channels: finance, crime, tech, fitness, and AI.
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
    niche: "Finance, wealth building, passive income, money mindset for 18-35 year olds",
    postsPerDay: 3,
    times: ["11:00", "17:00", "00:00"],
    affiliate: { name: "Webull", offer: "Get a FREE stock (worth up to $1,600) when you sign up", cta: "Get your free stock -> link in bio" },
  },
  {
    match: "alibi",
    niche: "True crime, cold cases, murder mysteries, criminal psychology",
    postsPerDay: 3,
    times: ["00:00", "02:00", "22:00"],
    affiliate: { name: "NordVPN", offer: "67% off + 3 months free", cta: "Lock down your browsing -> link in bio" },
  },
  {
    match: "tech",
    niche: "AI tools and tech news explained simply for everyday people",
    postsPerDay: 3,
    times: ["12:00", "16:00", "23:00"],
    affiliate: { name: "Hostinger", offer: "Build your own AI-powered website for $2.99/mo (80% off)", cta: "Start your site for $2.99 -> link in bio" },
  },
  {
    match: "lift",
    niche: "Fitness, gym motivation, workout tips, body transformation",
    postsPerDay: 2,
    times: ["11:00", "17:00"],
    affiliate: { name: "WHOOP", offer: "Get 1 month free on WHOOP", cta: "Try WHOOP free -> link in bio" },
  },
  {
    match: "hub",
    niche: "AI productivity tools and automation for beginners",
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

Generate exactly ${postsPerDay} post(s). Each must be a standalone 30-55 second video concept.

Return ONLY valid JSON - no markdown, no explanation:
[
  {
    "title": "Internal title (3-6 words)",
    "hook": "The exact first 5-8 spoken words - the scroll-stopping opener",
    "script": "Full 100-150 word voiceover script. Conversational tone, natural speaking pace. Delivers real value. No stage directions.",
    "caption": "Social media caption: hook sentence first, 2-line body, affiliate CTA if applicable, then 5 hashtags on a new line."
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
        videoPath = await generateVideo({ script: post.script || post.caption, hook: post.hook, niche: config.niche, style: "dark" });
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
