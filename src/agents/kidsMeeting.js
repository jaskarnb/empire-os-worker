import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { getChannels, getRecentPosts, schedulePost } from "../tools/postiz.js";
import { assertPolicySafePost } from "../tools/policyGuard.js";
import { generateVideo } from "../tools/videoGen.js";
import { assertContentQuality } from "./contentQuality.js";
import { isAutomationPaused, recordScheduledPost } from "../tools/opsState.js";

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CHANNEL_CONFIG = [
  { match: "tiny", niche: "Nursery rhymes, counting songs, ABC learning for toddlers aged 2-5", postsPerDay: 2, times: ["14:00", "21:00"], type: "educational" },
  { match: "fruit", niche: "Talking fruits and vegetables, silly food characters on funny adventures for kids 3-7", postsPerDay: 2, times: ["15:00", "20:00"], type: "educational" },
  { match: "rainbow", niche: "Colors, shapes, and patterns for preschoolers", postsPerDay: 2, times: ["13:00", "20:00"], type: "educational" },
  { match: "happy", niche: "Happy animal friends, kindness and sharing stories for kids 4-8", postsPerDay: 2, times: ["14:00", "21:00"], type: "educational" },
  { match: "fun", niche: "Simple science experiments and crafts for kids 6-10", postsPerDay: 2, times: ["14:00", "20:30"], type: "educational" },
  { match: "roblox", niche: "Trending Roblox games, tips, secrets, funny moments, and highlights for kids 6-12", postsPerDay: 3, times: ["14:00", "18:00", "21:00"], type: "gaming", platform: "roblox" },
  { match: "minecraft", niche: "Minecraft builds, survival tips, secret tricks, and adventures for kids 7-12", postsPerDay: 2, times: ["15:00", "20:00"], type: "gaming", platform: "minecraft" },
  { match: "game", niche: "Popular kids games, Roblox, Minecraft, and Stumble Guys highlights for ages 6-12", postsPerDay: 2, times: ["15:00", "20:00"], type: "gaming", platform: "general" },
];

const KIDS_KEYWORDS = [
  "tiny", "fruit", "rainbow", "happy", "fun", "kids", "baby", "color", "toddler", "nursery", "cocomelon", "peppa", "animal", "abc", "song", "learn", "play", "story", "tales", "junior", "roblox", "minecraft", "game", "gaming", "blox",
];

function isKidsChannel(name = "") {
  const lower = name.toLowerCase();
  return KIDS_KEYWORDS.some((k) => lower.includes(k));
}

function getChannelConfig(name = "") {
  const lower = name.toLowerCase();
  return CHANNEL_CONFIG.find((c) => lower.includes(c.match)) || {
    niche: "Fun and educational content for young children ages 3-8",
    postsPerDay: 2,
    times: ["14:00", "21:00"],
    type: "educational",
  };
}

async function scoutEducationalTrends(niche) {
  try {
    const resp = await client().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      messages: [{ role: "user", content: `Search for what kids video formats are trending RIGHT NOW on YouTube Shorts and TikTok for children aged 3-8 in the "${niche}" niche. Give 3 concrete formats. Keep them age-appropriate.` }],
    });
    const textBlock = resp.content.find((b) => b.type === "text");
    return { trends: textBlock?.text || "Counting songs, alphabet videos, talking animals, color learning.", trendingGame: null };
  } catch (e) {
    console.warn("[Kids Scout] Web search failed, fallback:", e.message);
    const resp = await client().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: `Give 3 safe, viral short-form video formats for children aged 3-8 in the "${niche}" niche.` }],
    });
    return { trends: resp.content[0].text, trendingGame: null };
  }
}

async function scoutGamingTrends(platform) {
  let trendingGame = null;
  let gameAngles = null;

  try {
    const step1Query = platform === "roblox"
      ? "What Roblox games or modes are trending this week on YouTube Shorts and TikTok for kids?"
      : platform === "minecraft"
        ? "What Minecraft trends, seeds, builds, or challenges are viral this week on YouTube Shorts for kids?"
        : "What kids games are trending this week on YouTube Shorts: Roblox, Minecraft, Stumble Guys, or others?";

    const step1 = await client().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      messages: [{ role: "user", content: step1Query }],
    });
    trendingGame = step1.content.find((b) => b.type === "text")?.text || null;

    if (trendingGame) {
      const step2 = await client().messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
        messages: [{ role: "user", content: `Based on this ${platform} trend: "${trendingGame.slice(0, 250)}" - give 3 safe, original, high-retention YouTube Shorts ideas for kids ages 6-12. Do not encourage spending real money.` }],
      });
      gameAngles = step2.content.find((b) => b.type === "text")?.text || null;
    }
  } catch (e) {
    console.warn("[Kids Scout] Gaming search failed, fallback:", e.message);
  }

  const trends = [trendingGame, gameAngles].filter(Boolean).join("\n\n---\n\n") ||
    (platform === "roblox"
      ? "Roblox secret tips, beginner guides, safe funny moments, and hidden features."
      : platform === "minecraft"
        ? "Minecraft survival tips, hidden rooms, redstone tricks, and build ideas."
        : "Roblox, Minecraft, and Stumble Guys safe tips and funny moments.");

  return { trends, trendingGame };
}

async function generateEducationalPosts(channelName, niche, postsPerDay, trends, perfSummary) {
  const perfContext = perfSummary
    ? `RECENT PERFORMANCE:\n${perfSummary}\n\nLearn from what worked.`
    : "NEW CHANNEL: Start with proven kids formats: counting, alphabet, animal sounds, and simple stories.";

  const prompt = `You are creating original children's Shorts for "${channelName}".

TARGET AUDIENCE: Children ages 3-8. Parents choose the videos.
VOICE: Warm, happy, simple, encouraging.

TRENDING RIGHT NOW:
${trends}

${perfContext}

Generate exactly ${postsPerDay} video concept(s).

Rules:
- Completely age-appropriate.
- Final video must be 20-59 seconds, super entertaining, full of motion, and rewatchable.
- Use kid-loved worlds like Minecraft, Roblox, simple game challenges, colorful characters, funny safe surprises, and interactive moments.
- Simple vocabulary.
- Positive, non-scary, no brand mentions, no affiliates.
- Include a participation moment.
- Every script must be a clear mini-story with setup, problem, happy payoff, and ending.
- Use cheerful voice, bright music, readable captions, and visuals that match each sentence.
- No random words, no confusing jumps, no low-motion static scenes.
- End with a gentle subscribe/follow CTA.

Return ONLY valid JSON:
[
  {
    "title": "Internal title",
    "hook": "First 5-7 cheerful words",
    "script": "55-150 word voiceover for a 20-59 second video with simple sentences, a mini-story, and a participation moment.",
    "caption": "Parent-friendly caption with 3-5 kid-friendly hashtags."
  }
]`;

  const resp = await client().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = resp.content[0].text;
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) {
    console.error(`[Kids Muse] No JSON for ${channelName}. Raw:`, raw.slice(0, 200));
    return [];
  }
  try {
    return JSON.parse(match[0]).slice(0, postsPerDay);
  } catch (e) {
    console.error(`[Kids Muse] Parse error for ${channelName}:`, e.message);
    return [];
  }
}

async function generateGamingPosts(channelName, niche, postsPerDay, trends, trendingGame, perfSummary, platform) {
  const perfContext = perfSummary
    ? `RECENT PERFORMANCE:\n${perfSummary}\n\nLearn from what worked.`
    : "NEW CHANNEL: Focus on tips, secrets, beginner guides, and safe funny moments.";
  const gameContext = trendingGame
    ? `TODAY'S TRENDING GAME/MODE:\n${trendingGame.slice(0, 300)}`
    : `Use proven ${platform} content kids search for.`;

  const prompt = `You are creating original kids ${platform} Shorts for "${channelName}".

TARGET AUDIENCE: Kids ages 6-12.
VOICE: Excited, friendly, safe, helpful.

${gameContext}

TREND RESEARCH:
${trends}

${perfContext}

Generate exactly ${postsPerDay} video concept(s).

Rules:
- Age-appropriate.
- Final video must be 20-59 seconds, super entertaining, full of motion, and rewatchable.
- Prefer Minecraft, Roblox, popular kids games, secret tips, funny challenges, safe mysteries, and colorful fast payoffs.
- No scary content, no inappropriate language.
- Do not encourage spending real money.
- No affiliates or brand deals.
- Every script must be a clear mini-story with setup, challenge, discovery/payoff, and ending.
- Use cheerful voice, bright music, readable captions, and visuals that match each sentence.
- No random words, no confusing jumps, no low-motion static scenes.
- End with "Follow for more ${platform} secrets!" or similar.

Return ONLY valid JSON:
[
  {
    "title": "Internal title",
    "hook": "First 5-8 words that make kids curious",
    "script": "55-150 word voiceover for a 20-59 second video. High energy, safe, helpful, specific, and coherent.",
    "caption": "Punchy caption with 5 gaming hashtags."
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
    console.error(`[Kids Muse Gaming] No JSON for ${channelName}. Raw:`, raw.slice(0, 200));
    return [];
  }
  try {
    return JSON.parse(match[0]).slice(0, postsPerDay);
  } catch (e) {
    console.error(`[Kids Muse Gaming] Parse error for ${channelName}:`, e.message);
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

export async function runKidsMeeting() {
  const stamp = new Date().toISOString();
  console.log(`\n${"=".repeat(50)}`);
  console.log(`[Empire OS] Kids Meeting ${stamp}`);
  console.log("=".repeat(50));

  if (isAutomationPaused()) {
    console.log("[Control] Automation is paused - skipping Kids Meeting.");
    return;
  }

  let allChannels;
  try {
    allChannels = await getChannels();
    if (!allChannels.length) throw new Error("No channels returned");
  } catch (e) {
    console.error("[Kids] Cannot fetch channels:", e.message);
    return;
  }

  const channels = allChannels.filter((ch) => isKidsChannel(ch.name || ch.identifier || ch.id));
  if (!channels.length) {
    console.log("[Kids] No kids channels connected yet.");
    return;
  }
  console.log(`\n[Kids] ${channels.length} channel(s): ${channels.map((c) => c.name).join(", ")}`);

  const recentPosts = await getRecentPosts(15);
  const perfSummary = recentPosts.length
    ? recentPosts.slice(0, 6).map((p) => {
      const text = String(p.content || p.message || p.text || "").slice(0, 70);
      const views = p.statistics?.views ?? p.views ?? "?";
      const likes = p.statistics?.likes ?? p.likes ?? "?";
      return `"${text}..." -> ${views} views, ${likes} likes`;
    }).join("\n")
    : null;

  for (const ch of channels) {
    const name = ch.name || ch.identifier || ch.id;
    const config = getChannelConfig(name);
    const isGaming = config.type === "gaming";

    console.log(`\n${"-".repeat(40)}`);
    console.log(`[Kids] ${name} (${isGaming ? "Gaming" : "Educational"})`);

    let trends;
    let trendingGame = null;
    if (isGaming) {
      ({ trends, trendingGame } = await scoutGamingTrends(config.platform));
    } else {
      ({ trends } = await scoutEducationalTrends(config.niche));
    }

    const posts = isGaming
      ? await generateGamingPosts(name, config.niche, config.postsPerDay, trends, trendingGame, perfSummary, config.platform)
      : await generateEducationalPosts(name, config.niche, config.postsPerDay, trends, perfSummary);

    if (!posts.length) {
      console.error("[Kids] No posts generated - skipping channel");
      continue;
    }

    const times = buildScheduleTimes(config.times);
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const date = times[i] || times[0];
      let videoPath = null;

      try {
        assertPolicySafePost({ post, channelName: name, audience: "kids", niche: config.niche });
        assertContentQuality({ post, niche: config.niche, audience: "kids" });
        videoPath = await generateVideo({
          script: post.script || post.caption,
          hook: post.hook,
          niche: config.niche,
          style: "kids",
          voice: "en-US-AnaNeural",
        });
        const postiz = await schedulePost({ integrationId: ch.id, content: post.caption, date, mediaPath: videoPath, requireMedia: true });
        recordScheduledPost({ title: post.title, channelName: name, integrationId: ch.id, scheduledFor: date, postiz, videoPath, niche: config.niche });
        console.log(`[Nova] Scheduled kids video at ${date}`);
      } catch (e) {
        console.error(`[RenderGuard] Skipped kids post: ${e.message}`);
      } finally {
        cleanup(videoPath);
      }
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log("[Kids] Meeting complete.\n");
}
