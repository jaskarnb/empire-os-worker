/**
 * Brain Rot Meeting — Empire OS
 * 7 AM UTC daily (runs after dailyMeeting):
 *   1. Fetch Postiz channels matching brain-rot channel names
 *   2. Scout scans Gen Z / meme trends (web search)
 *   3. Muse generates chaotic, meme-literate video scripts
 *   4. VideoGen renders 1080x1920 MP4 (brainrot style + JennyNeural +15% speed)
 *   5. Nova uploads video + schedules post to Postiz
 *
 * TARGET AUDIENCE: 13-17 year olds, chronically online, Gen Z
 * AFFILIATES: NordVPN / Surfshark (VPN angle: bypass school WiFi, stay private)
 *
 * CHANNEL NAME MATCHERS (add accounts to Postiz using these keywords in the name):
 *   sigma  → Sigma/masculinity/dark motivation
 *   ohio   → Ohio memes, cursed content, absurdist humor
 *   skibidi ₒ Skibidi lore, toilet universe, brain rot characters
 *   npc    → NPC vs main character content
 *   rizz   → Rizz tips, social psychology, Gen Z confidence
 *   brain  → General brain rot fallback
 *   meme   → General meme fallback
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
    match: "sigma",
    niche: "Sigma male mindset, dark motivation, Gen Z hustle culture, success edits for teens",
    postsPerDay: 3,
    times: ["20:00", "23:00", "01:00"], // 4pm, 7pm, 9pm EST — teen prime time
    affiliate: {
      name: "NordVPN",
      offer: "67% off + 3 months free — the VPN actually worth it",
      cta: "Stay private → link in bio",
    },
  },
  {
    match: "ohio",
    niche: "Ohio memes, cursed content, absurdist internet humor, Only in Ohio compilations for Gen Z",
    postsPerDay: 3,
    times: ["21:00", "23:30", "02:00"], // 5pm, 7:30pm, 10pm EST
    affiliate: {
      name: "Surfshark",
      offer: "80% off Surfshark — the Ohio-proof VPN",
      cta: "Escape Ohio online → link in bio",
    },
  },
  {
    match: "skibidi",
    niche: "Skibidi toilet lore, Cameraman lore, DaFuq boom universe, brain rot mythology explained",
    postsPerDay: 3,
    times: ["20:30", "22:30", "01:30"], // 4:30pm, 6:30pm, 9:30pm EST
    affiliate: {
      name: "NordVPN",
      offer: "67% off + 3 months free NordVPN",
      cta: "Protect your IP → link in bio",
    },
  },
  {
    match: "npc",
    niche: "NPC vs main character comparisons, escaping NPC life, sigma vs NPC energy, Gen Z social dynamics",
    postsPerDay: 2,
    times: ["21:00", "00:00"], // 5pm, 8pm EST
    affiliate: {
      name: "Surfshark",
      offer: "Stop being an NPC online — Surfshark 80% off",
      cta: "Main character move → link in bio",
    },
  },
  {
    match: "rizz",
    niche: "Rizz psychology, social confidence, how to talk to anyone, Gen Z charisma tips",
    postsPerDay: 2,
    times: ["20:00", "23:00"], // 4pm, 7pm EST
    affiliate: {
      name: "NordVPN",
      offer: "67% off NordVPN — stay anonymous while you work on your rizz",
      cta: "Stay private → link in bio",
    },
  },
];

// Broad fallback for any brain-rot channel not in the list above
const BRAINROT_FALLBACK = {
  niche: "Gen Z internet culture, viral memes, brain rot humor, TikTok trends",
  postsPerDay: 2,
  times: ["20:00", "23:00"],
  affiliate: {
    name: "NordVPN",
    offer: "67% off + 3 months free NordVPN",
    cta: "Lock in → link in bio",
  },
};

// Brain rot channel name keywords (any of these → use this agent)
const BRAINROT_KEYWORDS = [
  "sigma", "ohio", "skibidi", "npc", "rizz",
  "brain", "meme", "gyatt", "fanum", "slay",
  "gen z", "genz", "rot", "viral", "cringe",
];

function isBrainRotChannel(name = "") {
  const lower = name.toLowerCase();
  return BRAINROT_KEYWORDS.some((k) => lower.includes(k));
}

function getChannelConfig(name = "") {
  const lower = name.toLowerCase();
  const match = CHANNEL_CONFIG.find((c) => lower.includes(c.match));
  return match || BRABNOT_FALLBACK;
}

// ─── Scout: Gen Z trend search ────────────────────────────────────────────────
ctor scoutTrends(niche) {
  try {
    const resp = await client().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      messages: [
        {
          role: "user",
          content: `Search for what is trending RIGHT NOW on TikTok for Gen Z teens (13-17 year olds) in the "${niche}" space. What meme formats, sounds, video types, or slang terms are blowing up this week? Give me 3 very specific, concrete trends with real examples. Be specific about the format.`,
        },
      ],
    });
    const textBlock = resp.content.find((b) => b.type === "text");
    return textBlock?.text || "Focus on proven Gen Z formats: Ohio jokes, sigma edits, NPC comparisons.";
  } catch (e) {
    console.warn("[BrainRot Scout] Web search failed, using fallback:", e.message);
    const resp = await client().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `What meme formats and video styles consistently go viral on TikTok for Gen Z teens in the "${niche}" niche? Give 3 specific formats.`,
        },
      ],
    });
    return resp.content[0].text;
  }
}

// ─── Muse: generate brain rot post ideas ─────────────────────────────────────
async function generatePosts(channelName, niche, postsPerDay, trends, perfSummary, affiliate, postIndex = 0) {
  const perfContext = perfSummary
    ? `RECENT PERFORMANCE:\n${perfSummary}\n\nLearn from what worked.`
    : "NEW CHANNEL: Go hard on proven Gen Z viral formats.";

  const affiliateBlock =
    affiliate && postIndex % 2 === 0
      ? `MONETIZATION — weave this in naturally at the end:
- Partner: ${affiliate.name}
- Offer: ${affiliate.offer}
- Caption ends with: "${affiliate.cta}"
- Make the VPN angle feel organic (privacy, school WiFi, gaming, etc.)`
      : `MONETIZATION: Skip the affiliate this post — pure meme value builds the audience.`;

  const prompt = `You are the Gen Z content creator for "${channelName}", a ${niche} channel on TikTok/YouTube Shorts.

TARGET AUDIENCE: 13-17 year olds who are extremely chronically online.
VOICE: Chaotic, self-aware, meme-literate, funny, uses Gen Z slang naturally (but don't force it).
ENERGY: High, fast-paced, slightly unhinged but always entertaining.

TRENDING RIGHT NOW:
${trends}

${perfContext}

${affiliateBlock}

Generate exactly ${postsPerDay} post(s). Each is a 30-45 second TikTok/Short.

CONTENT RT�SES:
- Safe for teens —"no explicit content, no graphic violence, no sexual content
- Reference real meme formats or internet culture authentically
- Must be genuinely funny or interesting, not cringe
- Short sentences. Fast pace. Punchy .

Return ONLY valid JSON — no markdown, no explanation:
[
  {
    "title": "Internal title (3-5 words)",
    "hook": "First 5-8 spoken words that stop the scroll — must be immediately grabby",
    "script": "65-95 word voiceover. Fast-paced, chaotic energy. Gen Z voice. References the trend. Punchy sentences. Ends with CTA like 'follow for more brain rot' or affiliate if applicable.",
    "caption": "1 punchy hook line. 1-2 lines of body. Affiliate CTA if applicable. 5 Gen Z hashtags on new line."
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
    console.error(`[BrainRot Muse] No JSON for ${channelName}. Raw:`, raw.slice(0, 200));
    return [];
  }
  try {
    return JSON.parse(match[0]).slice(0, postsPerDay);
  } catch (e) {
    console.error(`[BrainRot Muse] Parse error for ${channelName}:`, e.message);
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
export async function runBrainRotMeeting() {
  const stamp = new Date().toISOString();
  console.log(`\n${"=".repeat(50)}`);
  console.log(`[Empire OS] Brain Rot Meeting  ${stamp}`);
  console.log("=".repeat(50));

  // 1. Channels — filter to brain rot accounts only
  let allChannels;
  try {
    allChannels = await getChannels();
    if (!allChannels.length) throw new Error("No channels returned");
  } catch (e) {
    console.error("[BrainRot] Cannot fetch channels:", e.message);
    return;
  }

  const channels = allChannels.filter((ch) =>
    isBrainRotChannel(ch.name || ch.identifier || ch.id)
  );

  if (!channels.length) {
    console.log("[BrainRot] No brain rot channels connected yet. Add them to Postiz with keywords: sigma/ohio/skibidi/npc/rizz/meme/brain");
    return;
  }
  console.log(`\n[BrainRot] ${channels.length} channel(s): ${channels.map((c) => c.name).join(", ")}`);

  // 2. Recent analytics (shared pool)
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
    console.log("\n[BrainRot] Recent performance:\n" + perfSummary);
  }

  const postCounters = {};

  // 3. Per-channel pipeline
  for (const ch of channels) {
    const name = ch.name || ch.identifier || ch.id;
    const config = getChannelConfig(name);
    if (!(name in postCounters)) postCounters[name] = 0;

    console.log(`\n${"─".repeat(40)}`);
    console.log(`[BrainRot] ${name}`);

    // Scout
    console.log("[Scout] Scanning Gen Z trends…");
    const trends = await scoutTrends(config.niche);
    console.log("[Scout] Done:", trends.slice(0, 80) + "…");

    // Muse
    console.log(`[Muse] Generating ${config.postsPerDay} brain rot idea(s)…`);
    const posts = await generatePosts(
      name,
      config.niche,
      config.postsPerDay,
      trends,
      perfSummary,
      config.affiliate || null,
      postCounters[name]
    );
    postCounters[name] += posts.length;

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

      // VideoGen: brainrot style, JennyNeural at +15% speed
      let videoPath = null;
      try {
        videoPath = await generateVideo({
          script: post.script || post.caption,
          hook: post.hook,
          niche: config.niche,
          style: "brainrot",
          voice: "en-US-JennyNeural",
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
  console.log(`[BrainRot] Meeting complete.\n`);
}
