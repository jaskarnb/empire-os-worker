/**
 * Kids Meeting — Empire OS
 * 7 AM UTC daily (runs after brainRotMeeting):
 *   1. Fetch Postiz channels matching kids channel names
 *   2. Scout scans trending children's content (Cocomelon-style, nursery rhymes, etc.)
 *   3. Muse generates simple, bright, age-appropriate scripts for toddlers / young kids
 *   4. VideoGen renders 1080x1920 MP4 (kids style + AnaNeural, -10% speed for clarity)
 *   5. Nova uploads video + schedules post to Postiz
 *
 * TARGET AUDIENCE: Children ages 3-8 (parents are the actual viewers/subscribers)
 * MONETIZATION: YouTube AdSense only — NO affiliates (COPPA compliance)
 * POSTING TIMES: After school (3-6pm EST) + late morning weekends (10am-1pm EST)
 *
 * CHANNEL NAME MATCHERS (add accounts to Postiz using these keywords in the name):
 *   tiny   → Nursery rhymes, counting, ABCs for toddlers
 *   fruit  → Talking fruits and vegetables, silly food characters
 *   rainbow → Colors, shapes, patterns for preschoolers
 *   happy  → Happy animal friends, kindness stories
 *   fun    → Simple science, crafts, activities for kids 6-10
 *   kids   → General kids content fallback
 *   baby   → Baby/toddler content fallback
 *   color  → Colors and shapes learning
 */
import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { getChannels, getRecentPosts, schedulePost } from "../tools/postiz.js";
import { generateVideo } from "../tools/videoGen.js";

const client = () =>
  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Channel config ───────────────────────────────────────────────────────────
const CHANNEL_CONFIG = [
  {
    match: "tiny",
    niche: "Nursery rhymes, counting songs, ABC learning for toddlers aged 2-5",
    postsPerDay: 2,
    times: ["14:00", "21:00"], // 10am EST, 5pm EST
    affiliate: null,
  },
  {
    match: "fruit",
    niche: "Talking fruits and vegetables, silly food characters on funny adventures for kids 3-7",
    postsPerDay: 2,
    times: ["15:00", "20:00"], // 11am EST, 4pm EST
    affiliate: null,
  },
  {
    match: "rainbow",
    niche: "Colors, shapes, and patterns for preschoolers — `magical rainbow learning world",
    postsPerDay: 2,
    times: ["13:00", "20:00"], // 9am EST, 4pm EST
    affiliate: null,
  },
  {
    match: "happy",
    niche: "Happy animal friends, kindness and sharing stories, positive values for kids 4-8",
    postsPerDay: 2,
    times: ["14:00", "21:00"], // 10am EST, 5pm EST
    affiliate: null,
  },
  {
    match: "fun",
    niche: "Fun simple science experiments and crafts for kids 6-10, easy to try at home",
    postsPerDay: 2,
    times: ["14:00", "20:30"], // 10am EST, 4:30pm EST
    affiliate: null,
  },
];

// Kids content keywords — any channel with one of these in the name
const KIDS_KEYWORDS = [
  "tiny", "fruit", "rainbow", "happy", "fun",
  "kids", "baby", "color", "toddler", "nursery",
  "cocomelon", "peppa", "animal", "abc", "song",
  "learn", "play", "story", "tales", "junior",
];

function isKidsChannel(name = "") {
  const lower = name.toLowerCase();
  return KIDS_KEYWORDS.some((k) => lower.includes(k));
}

function getChannelConfig(name = "") {
  const lower = name.toLowerCase();
  const match = CHANNEL_CONFIG.find((c) => lower.includes(c.match));
  return match || {
    // Generic fallback for any kids channel
    niche: "Fun and educational content for young children ages 3-8",
    postsPerDay: 2,
    times: ["14:00", "21:00"],
    affiliate: null,
  };
}

// ─── Scout: kids content trend search ────────────────────────────────────────
async function scoutTrends(niche) {
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
    return textBlock?.text || "Focus on proven formats: counting songs, alphabet videos, talking animals, color learning.";
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
    return resp.content[0].text;
  }
}

// ─── Muse: generate kids post ideas ──────────────────────────────────────────
ctor generatePosts(channelName, niche, postsPerDay, trends, perfSummary) {
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

Return ONLY valid JSON —"no markdown, no explanation:
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

// ─── Schedule helpers ─────────────────────────────────────────────────────────
function buildScheduleTimes(times) {
  return times.map((t) => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setUTCHours(h, m, 0, 0);
    if (d < new Date()) d.setDate(d.getDate() + 1);
    return d.toISOString();
  });
}

// ─── Main orchestrator ────────────────────────────────────────────────────────
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
    console.log("[Kids] No kids channels connected yet. Add them to Postiz with keywords: tiny/fruit/rainbow/happy/fun/kids/baby");
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

    console.log(`\n${"─".repeat(40)}`);
    console.log(`[Kids] ${name} (${config.niche.split(",")[0].trim()})`);

    // Scout
    console.log("[Scout] Scanning kids trends…");
    const trends = await scoutTrends(config.niche);
    console.log("[Scout] Done:", trends.slice(0, 80) + "…");

    // Muse
    console.log(`[Muse] Generating ${config.postsPerDay} kids idea(s)…`);
    const posts = await generatePosts(
      name,
      config.niche,
      config.postsPerDay,
      trends,
      perfSummary
      // No affiliate param — kids channels have NO monetization CTAs
    );

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

      // VideoGen: kids style + AnaNeural (child-friendly voice) at -10% speed for clarity
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
