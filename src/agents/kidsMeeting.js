/**
 * Kids Meeting — Empire OS
 * 7 AM UTC daily (runs after brainRotMeeting):
 *   1. Fetch Postiz channels matching kids channel names
 *   2. Scout scans trending children's content OR deep-searches trending game
 *   3. Muse generates age-appropriate scripts (educational or gaming)
 *   4. VideoGen renders 1080x1920 MP4 (kids style + AnaNeural, -10% speed)
 *   5. Nova uploads video + schedules post to Postiz
 *
 * TARGET AUDIENCE: Children ages 3-12 (parents choose the videos)
 * MONETIZATION: YouTube AdSense only — NO affiliates (COPPA compliance)
 * POSTING TIMES: After school (3-6pm EST) + late morning weekends (10am-1pm EST)
 *
 * CHANNEL NAME MATCHERS (add accounts to Postiz using these keywords in the name):
 *   tiny     → Nursery rhymes, counting, ABCs for toddlers
 *   fruit    → Talking fruits and vegetables, silly food characters
 *   rainbow  → Colors, shapes, patterns for preschoolers
 *   happy    → Happy animal friends, kindness stories
 *   fun      → Simple science, crafts for kids 6-10
 *   roblox   → Trending Roblox game tips/secrets (deep search daily)
 *   minecraft → Minecraft builds, tips, adventures
 *   game     → General kids gaming content fallback
 */
import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { getChannels, getRecentPosts, schedulePost } from "../tools/postiz.js";
import { generateVideo } from "../tools/videoGen.js";

const client = () =>
  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Channel config ────────────────────────────────────────────────────────────
const CHANNEL_CONFIG = [
  // ── Educational channels (ages 2-10) ──────────────────────────────────────
  {
    match: "tiny",
    niche: "Nursery rhymes, counting songs, ABC learning for toddlers aged 2-5",
    postsPerDay: 2,
    times: ["14:00", "21:00"],
    affiliate: null,
    type: "educational",
  },
  {
    match: "fruit",
    niche: "Talking fruits and vegetables, silly food characters on funny adventures for kids 3-7",
    postsPerDay: 2,
    times: ["15:00", "20:00"],
    affiliate: null,
    type: "educational",
  },
  {
    match: "rainbow",
    niche: "Colors, shapes, and patterns for preschoolers — Magical rainbow learning world",
    postsPerDay: 2,
    times: ["13:00", "20:00"],
    affiliate: null,
    type: "educational",
  },
  {
    match: "happy",
    niche: "Happy animal friends, kindness and sharing stories, positive values for kids 4-8",
    postsPerDay: 2,
    times: ["14:00", "21:00"],
    affiliate: null,
    type: "educational",
  },
  {
    match: "fun",
    niche: "Fun simple science experiments and crafts for kids 6-10, easy to try at home",
    postsPerDay: 2,
    times: ["14:00", "20:30"],
    affiliate: null,
    type: "educational",
  },

  // ── Gaming channels (ages 6-12) ────────────────────────────────────────────
  {
    match: "roblox",
    niche: "Trending Roblox games — tips, secrets, funny moments, and highlights for kids 6-12",
    postsPerDay: 3,
    times: ["14:00", "18:00", "21:00"], // 10am, 2pm, 5pm EST — after-school peak
    affiliate: null,
    type: "gaming",
    platform: "roblox",
  },
  {
    match: "minecraft",
    niche: "Minecraft builds, survival tips, secret tricks, and fun adventures for kids 7-12",
    postsPerDay: 2,
    times: ["15:00", "20:00"],
    affiliate: null,
    type: "gaming",
    platform: "minecraft",
  },
  {
    match: "game",
    niche: "Popular kids games — Roblox, Minecraft, Stumble Guys highlights for ages 6-12",
    postsPerDay: 2,
    times: ["15:00", "20:00"],
    affiliate: null,
    type: "gaming",
    platform: "general",
  },
];

// Kids content keywords — any channel with one of these in the name
const KIDS_KEYWORDS = [
  "tiny", "fruit", "rainbow", "happy", "fun",
  "kids", "baby", "color", "toddler", "nursery",
  "cocomelon", "peppa", "animal", "abc", "song",
  "learn", "play", "story", "tales", "junior",
  "roblox", "minecraft", "game", "gaming", "blox",
];

function isKidsChannel(name = "") {
  const lower = name.toLowerCase();
  return KIDS_KEYWORDS.some((k) => lower.includes(k));
}

function getChannelConfig(name = "") {
  const lower = name.toLowerCase();
  const match = CHANNEL_CONFIG.find((c) => lower.includes(c.match));
  return match || {
    niche: "Fun and educational content for young children ages 3-8",
    postsPerDay: 2,
    times: ["14:00", "21:00"],
    affiliate: null,
    type: "educational",
  };
}

// ─── Scout: educational content trends ────────────────────────────────────────
async function scoutEducationalTrends(niche) {
  try {
    const resp = await client().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      messages: [
        {
          role: "user",
          content: `Search for what types of kids videos are trending RIGHT NOW on YouTube Shorts and TikTok for children aged 3-8. Think Cocomelon-style content, nursery rhymes, talking animals, educational videos. What specific formats are getting millions of views from young children this week? Give 3 concrete examples that are proven to work.`,
        },
      ],
    });
    const textBlock = resp.content.find((b) => b.type === "text");
    return {
      trends: textBlock.text || "Focus on proven formats: counting songs, alphabet videos, talking animals, color learning.",
      trendingGame: null,
    };
  } catch (e) {
    console.warn("[Kids Scout] Web search failed, using fallback:", e.message);
    const resp = await client().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `What types of short videos consistently get millions of views from children aged 3-8 on YouTube? Think Cocomelon style. Give 3 specific formats for the niche: "${niche}".`,
        },
      ],
    });
    return { trends: resp.content[0].text, trendingGame: null };
  }
}

// ─── Scout: gaming — two-step deep search ─────────────────────────────────────
// Step 1: Find the #1 trending game / mode RIGHT NOW
// Step 2: Get the best content angles for that specific game
async function scoutGamingTrends(platform) {
  let trendingGame = null;
  let gameAngles = null;

  try {
    const step1Query =
      platform === "roblox"
        ? "What is the most popular Roblox game trending right now this week? Most played, most viral on YouTube and TikTok for kids."
        : platform === "minecraft"
        ? "What is the most viral Minecraft trend, challenge, or seed blowing up on YouTube this week for kids?"
        : "What kids game is trending the most on YouTube right now this week — Roblox, Minecraft, Stumble Guys, or other?";

    console.log(`[Scout] Step 1 — finding trending ${platform} game…`);
    const step1 = await client().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      messages: [{ role: "user", content: step1Query }],
    });
    const step1Text = step1.content.find((b) => b.type === "text");
    trendingGame = step1Text?.text || null;

    if (trendingGame) {
      console.log(`[Scout] Step 2 — finding content angles for trending game…`);
      const step2 = await client().messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
        messages: [
          {
            role: "user",
            content: `Based on this trending ${platform} info: "${trendingGame.slice(0, 250)}" — what are the BEST video content angles for a kids YouTube Shorts channel targeting ages 6-12? Think: secret tips nobody knows, funny moments, beginner guide, hidden features, viral challenges. Give 3 specific video ideas that kids would love and search for.`,
          },
        ],
      });
      const step2Text = step2.content.find((b) => b.type === "text");
      gameAngles = step2Text?.text || null;
    }
  } catch (e) {
    console.warn("[Kids Scout] Gaming search failed, using fallback:", e.message);
  }

  const trends =
    [trendingGame, gameAngles].filter(Boolean).join("\n\n---\n\n") ||
    (platform === "roblox"
      ? "Adopt Me pet updates, Blox Fruits boss fights, Brookhaven roleplay — tips and secrets kids search for daily."
      : platform === "minecraft"
      ? "Survival tips, hidden rooms, redstone tricks, speedrun seeds — content that makes kids say 'I didn't know that!'"
      : "Most popular kids games: Roblox Adopt Me, Minecraft survival, Stumble Guys funny moments.");

  return { trends, trendingGame };
}

// ─── Muse: generate educational post ideas ─────────────────────────────────────
async function generateEducationalPosts(channelName, niche, postsPerDay, trends, perfSummary) {
  const perfContext = perfSummary
    ? `RECENT PERFORMANCE:\n${perfSummary}\n\nLearn from what worked — replicate high-view formats.`
    : "NEW CHANNEL: Start with proven kids formats — counting, alphabet, animal sounds, simple songs.";

  const prompt = `You are the content creator for "${channelName}", a children's YouTube Shorts channel.

TARGET AUDIENCE: Children ages 3-8 years old (parents choose the videos).
VOICE: Warm, encouraging, happy, simple. Like a kind teacher or fun older sibling.
TONE: Bright, positive, repetitive (repetition = how young children learn).

TRENDING RIGHT NOW:
${trends}

${perfContext}

Generate exactly ${postsPerDay} post(s). Each is a 30-45 second YouTube Short.

STRICT CONTENT RULES (non-negotiable):
- Completely age-appropriate and safe for toddlers and young children
- Simple vocabulary — words a 4-year-old understands
- Short sentences with a natural, rhythmic pace
- Educational OR fun and entertaining (or both!)
- Positive, encouraging, no scary content whatsoever
- NO brand mentions, NO affiliates, NO external products
- End with: "Subscribe for more fun videos!" or similar

GOOD FORMATS: counting songs, colour learning, animal sounds, simple stories with a lesson,
shape recognition, nursery rhymes, easy how-to (washing hands, tying shoes), call-and-response.

Return ONLY valid JSON — no markdown, no explanation:
[
  {
    "title": "Internal title (3-5 words)",
    "hook": "First 5-7 words — bright, cheerful, curiosity-sparking for a young child",
    "script": "60-80 word voiceover. Simple sentences. Happy rhythm. Include a participation moment ('Can you say it with me?', 'Let's count together!'). End with 'Subscribe for more fun videos!'",
    "caption": "Short parent-friendly caption (1-2 sentences). Describe what kids will learn/enjoy. End with: 'Subscribe for more! #kidsvideos #educational'. Include 3-5 kid-friendly hashtags."
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

// ─── Muse: generate gaming post ideas ─────────────────────────────────────────
async function generateGamingPosts(channelName, niche, postsPerDay, trends, trendingGame, perfSummary, platform) {
  const perfContext = perfSummary
    ? `RECENT PERFORMANCE:\n${perfSummary}\n\nLearn from what worked — replicate high-view formats.`
    : `NEW CHANNEL: Focus on the trending game discovered today. Kids search for tips and secrets about whatever's blowing up right now.`;

  const gameContext = trendingGame
    ? `TODAY'S TRENDING GAME/MODE:\n${trendingGame.slice(0, 300)}\n\nBase your content around THIS specific game or in trend.`
    : `Use proven ${platform} content that kids always search for.`;

  const prompt = `You are the content creator for "${channelName}", a kids ${platform} YouTube Shorts channel.

TARGET AUDIENCE: Children ages 6-12 who play or watch ${platform} content.
VOICE: Excited, friendly — like a cool older kid sharing secrets. High energy, helpful.
TONE: "Whoa, did you know THIS?!" energy. Makes kids want to try it immediately.

${gameContext}

TREND RESEARCH:
${trends}

${perfContext}

Generate exactly ${postsPerDay} post(s). Each is a 30-45 second YouTube Short.

CONTENT ANGLES THAT GO VIRAL WITH KIDS:
- "Secret trick 99% of players don't know"
- "How to get [item/pet/rank] for FREE"
- "I found a hidden area nobody talks about"
- "Beginner's guide to [trending game] in 30 seconds"
- "The funniest glitch in [game] right now"
- "I tried the viral [game] challenge"
- "3 things every [game] player needs to know"

STRICT CONTENT RULES (non-negotiable):
- Age-appropriate for kids 6-12, safe and positive
- No graphic violence, no scary content, no inappropriate language
- Do NOT encourage spending real money (no "buy Robux", no "spend V-Bucks")
- NO brand deals, NO affiliates, NO external products
- End script with "Follow for more ${platform} secrets!" or similar

Return ONLY valid JSON — no markdown, no explanation:
[
  {
    "title": "Internal title (3-5 words)",
    "hook": "First 5-8 words — stops the scroll immediately, makes kids say 'wait WHAT?!'",
    "script": "65-90 word voiceover. High energy. References the specific trending game by name. Delivers the tip/secret/moment clearly. Punchy sentences. Ends with 'Follow for more ${platform} secrets!'",
    "caption": "1 punchy hook line. 1-2 lines about the tip/content. 5 gaming hashtags on new line. NO money CTAs."
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

// ─── Schedule helpers ──────────────────────────────────────────────────────────
function buildScheduleTimes(times) {
  return times.map((t) => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setUTCHours(h, m, 0, 0);
    if (d < new Date()) d.setDate(d.getDate() + 1);
    return d.toISOString();
  });
}

// ─── Main orchestrator ─────────────────────────────────────────────────────────
export async function runKidsMeeting() {
  const stamp = new Date().toISOString();
  console.log(`\n${"=".repeat(50)}`);
  console.log(`[Empire OS] Kids Meeting  ${stamp}`);
  console.log("=".repeat(50));

  // 1. Channels — filter to kids accounts only
  let allChannels;
  try {
    allChannels = await getChannels();
    if (!allChannels.length) throw new Error("No channels returned");
  } catch (e) {
    console.error("[Kids] Cannot fetch channels:", e.message);
    return;
  }

  const channels = allChannels.filter((ch) =>
    isKidsChannel(ch.name || ch.identifier || ch.id)
  );

  if (!channels.length) {
    console.log("[Kids] No kids channels connected yet. Add them to Postiz with keywords: tiny/fruit/rainbow/happy/fun/kids/baby/roblox/minecraft/game");
    return;
  }
  console.log(`\n[Kids] ${channels.length} channel(s): ${channels.map((c) => c.name).join(", ")}`);

  // 2. Recent analytics
  const recentPosts = await getRecentPosts(15);
  let perfSummary = null;
  if (recentPosts.length) {
    perfSummary = recentPosts
      .slice(0, 6)
      .map((p) => {
        const text = String(p.content || p.message || p.text || "").slice(0, 70);
        const views = p.statistics?.views ?? p.views ?? "?";
        const likes = p.statistics?.likes ?? p.likes ?? "?";
        return `"${text}…" → ${views} views, ${likes} likes`;
      })
      .join("\n");
    console.log("\n[Kids] Recent performance:\n" + perfSummary);
  }

  // 3. Per-channel pipeline
  for (const ch of channels) {
    const name = ch.name || ch.identifier || ch.id;
    const config = getChannelConfig(name);
    const isGaming = config.type === "gaming";

    console.log(`\n${"─".repeat(40)}`);
    console.log(`[Kids] ${name} (${isGaming ? "Gaming" : "Educational"} — ${config.niche.split(",")[0].trim()})`);

    // Scout — two-step deep search for gaming, standard for educational
    let trends, trendingGame = null;
    if (isGaming) {
      console.log(`[Scout] Deep searching trending ${config.platform} content…`);
      ({ trends, trendingGame } = await scoutGamingTrends(config.platform));
      console.log("[Scout] Trending game:", (trendingGame || "fallback").slice(0, 100) + "…");
    } else {
      console.log("[Scout] Scanning kids trends…");
      ({ trends } = await scoutEducationalTrends(config.niche));
    }
    console.log("[Scout] Done:", trends.slice(0, 80) + "…");

    // Muse — different prompt for gaming vs educational
    console.log(`[Muse] Generating ${config.postsPerDay} ${isGaming ? "gaming" : "kids"} idea(s)…`);
    const posts = isGaming
      ? await generateGamingPosts(name, config.niche, config.postsPerDay, trends, trendingGame, perfSummary, config.platform)
      : await generateEducationalPosts(name, config.niche, config.postsPerDay, trends, perfSummary);

    if (!posts.length) {
      console.error("[Muse] No posts generated — skipping channel");
      continue;
    }

    const times = buildScheduleTimes(config.times);

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const date = times[i] || times[0];

      console.log(`\n[Smith] "${post.title}"`);
      console.log(`[Smith] Hook: "${post.hook}"`);

      // VideoGen: kids style + AnaNeural (-10% speed for clarity)
      let videoPath = null;
      try {
        videoPath = await generateVideo({
          script: post.script || post.caption,
          hook: post.hook,
          niche: config.niche,
          style: "kids",
          voice: "en-US-AnaNeural",
        });
      } catch (e) {
        console.error(`[Smith] Video generation failed: ${e.message}`);
        console.warn(`[Smith] Falling back to text-only`);
      }

      // Nova: schedule
      console.log(`[Nova] Scheduling at ${date}…`);
      try {
        await schedulePost({
          integrationId: ch.id,
          content: post.caption,
          date,
          mediaPath: videoPath || undefined,
        });
        console.log(`[Nova] ✓ Scheduled${videoPath ? " with video" : " (text only)"}`);
      } catch (e) {
        console.error(`[Nova] ✗ Failed:`, e.message);
      }

      if (videoPath) {
        try { fs.unlinkSync(videoPath); } catch {}
      }
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`[Kids] Meeting complete.\n`);
}
