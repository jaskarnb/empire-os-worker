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
    match: "sigma",
    niche: "Sigma mindset, discipline, self-improvement, Gen Z hustle culture",
    postsPerDay: 3,
    times: ["20:00", "23:00", "01:00"],
    affiliate: { name: "NordVPN", offer: "67% off + 3 months free NordVPN", cta: "Stay private -> link in bio" },
  },
  {
    match: "ohio",
    niche: "Ohio memes, cursed content, absurdist internet humor, surreal meme storytelling",
    postsPerDay: 3,
    times: ["21:00", "23:30", "02:00"],
    affiliate: { name: "Surfshark", offer: "80% off Surfshark", cta: "Escape Ohio online -> link in bio" },
  },
  {
    match: "skibidi",
    niche: "Skibidi lore, internet mythology, meme explainers, chaotic Gen Z humor",
    postsPerDay: 3,
    times: ["20:30", "22:30", "01:30"],
    affiliate: { name: "NordVPN", offer: "67% off + 3 months free NordVPN", cta: "Protect your IP -> link in bio" },
  },
  {
    match: "npc",
    niche: "NPC vs main character comparisons, social dynamics, internet archetypes",
    postsPerDay: 2,
    times: ["21:00", "00:00"],
    affiliate: { name: "Surfshark", offer: "Surfshark 80% off", cta: "Main character move -> link in bio" },
  },
  {
    match: "rizz",
    niche: "Rizz psychology, social confidence, charisma tips, Gen Z social skills",
    postsPerDay: 2,
    times: ["20:00", "23:00"],
    affiliate: { name: "NordVPN", offer: "67% off NordVPN", cta: "Stay private -> link in bio" },
  },
];

const BRAINROT_FALLBACK = {
  niche: "Gen Z internet culture, viral memes, brain rot humor, TikTok trends",
  postsPerDay: 2,
  times: ["20:00", "23:00"],
  affiliate: { name: "NordVPN", offer: "67% off + 3 months free NordVPN", cta: "Lock in -> link in bio" },
};

const BRAINROT_KEYWORDS = [
  "sigma", "ohio", "skibidi", "npc", "rizz", "brain", "meme", "gyatt", "fanum", "slay", "gen z", "genz", "rot", "viral", "cringe",
  "tech", "talk", "taks", "techtalks", "techtaks",
];

function isBrainRotChannel(name = "") {
  const lower = name.toLowerCase();
  return BRAINROT_KEYWORDS.some((k) => lower.includes(k));
}

function getChannelConfig(name = "") {
  const lower = name.toLowerCase();
  return CHANNEL_CONFIG.find((c) => lower.includes(c.match)) || BRAINROT_FALLBACK;
}

function channelId(channel) {
  return channel?.id || channel?._id || channel?.integrationId || null;
}

async function scoutTrends(niche) {
  try {
    const resp = await client().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      messages: [{ role: "user", content: `Search for what is trending RIGHT NOW on TikTok for Gen Z in the "${niche}" space. Give 3 very specific viral formats, sounds, or video types. Do not copy creators; extract reusable patterns.` }],
    });
    const textBlock = resp.content.find((b) => b.type === "text");
    return textBlock?.text || "Focus on proven Gen Z formats: absurd contrast, fast punchlines, rankings, and POV archetypes.";
  } catch (e) {
    console.warn("[BrainRot Scout] Web search failed, fallback:", e.message);
    return [
      "Pattern 1: ordinary object gains lore, escalates into absurd drama, ends with a hard punchline.",
      "Pattern 2: school/work problem becomes an algorithmic jump scare with fast captions.",
      "Pattern 3: rank a familiar situation from normal to unhinged with one joke per beat.",
    ].join("\n");
  }
}

async function generatePosts(channelName, niche, postsPerDay, trends, perfSummary, affiliate, postIndex = 0) {
  const perfContext = perfSummary
    ? `RECENT PERFORMANCE:\n${perfSummary}\n\nLearn from what worked.`
    : "NEW CHANNEL: Use proven Gen Z retention formats, but keep the script original.";
  const affiliateBlock = affiliate && postIndex % 2 === 0
    ? `MONETIZATION - weave this in naturally at the end:\n- Partner: ${affiliate.name}\n- Offer: ${affiliate.offer}\n- Caption ends with: "${affiliate.cta}"`
    : "MONETIZATION: Skip affiliate CTA this post - pure entertainment builds the audience.";

  const prompt = `You are creating original videos for "${channelName}", a ${niche} channel.

TARGET: Gen Z short-form viewers.
STYLE: Fast, funny, self-aware, meme-literate, but not cringe.

TRENDING RIGHT NOW:
${trends}

${perfContext}

${affiliateBlock}

Generate exactly ${postsPerDay} original short-form video concepts.

Rules:
- Safe for teen audiences.
- Final video must be 20-59 seconds, super entertaining, full of motion, and rewatchable.
- It must still make sense: setup, escalation, punchline/payoff, and ending.
- Keep up with kid/teen brainrot trends and slang, but only when it helps the joke.
- No explicit content, graphic violence, harassment, or sexual content.
- Extract viral patterns, but do not copy any creator's wording or footage.
- Every script must be designed for a real MP4 video with fast visual motion.
- No random words. Chaotic is fine; confusing is not.
- Use fast energetic voice, rapid captions, and clear visual beats that match each sentence.

Return ONLY valid JSON:
[
  {
    "title": "Internal title",
    "hook": "First 5-8 spoken words",
    "script": "55-150 word voiceover for a 20-59 second video. Fast-paced, punchy, original, coherent, built for captions and quick cuts.",
    "caption": "Punchy caption, CTA if applicable, 5 hashtags."
  }
]`;

  try {
    const resp = await client().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = resp.content[0].text;
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      console.error(`[BrainRot Muse] No JSON for ${channelName}. Raw:`, raw.slice(0, 200));
      return fallbackPosts(postsPerDay, affiliate, postIndex);
    }
    return JSON.parse(match[0]).slice(0, postsPerDay);
  } catch (e) {
    console.error(`[BrainRot Muse] Fallback for ${channelName}:`, e.message);
    return fallbackPosts(postsPerDay, affiliate, postIndex);
  }
}

function fallbackPosts(postsPerDay, affiliate, postIndex = 0) {
  const cta = affiliate && postIndex % 2 === 0 ? `\n${affiliate.cta}` : "";
  const bank = [
    {
      title: "Microwave Gains Lore",
      hook: "The microwave started dropping lore",
      script: "The microwave started dropping lore at exactly 3 AM. Somebody reheated pizza and it beeped like it knew too much. The fridge got jealous, the toaster picked a side, and the air fryer started narrating like a documentary. Then the microwave displayed one message: I know who ate the leftovers. The whole kitchen went silent. The pizza rotated one final time, and the microwave said, case closed.",
      caption: `Kitchen appliances got drama now.${cta}\n#brainrot #memes #aitok #funny #fyp`,
    },
    {
      title: "Algorithm Finds Homework",
      hook: "The algorithm found my homework",
      script: "The algorithm found my homework before I did. I opened my phone for one second and every app recommended study tips, panic playlists, and a video called how to survive consequences. Then my calculator sent a notification: bro, we have been waiting. Even the printer woke up and jammed itself for emotional support. I opened the assignment, and the due date said yesterday.",
      caption: `Academic jump scare unlocked.${cta}\n#schooltok #brainrot #memes #funny #fyp`,
    },
    {
      title: "Phone Battery Villain Arc",
      hook: "My phone hit one percent",
      script: "My phone hit one percent and chose violence. First it dimmed the screen like a dramatic movie scene. Then every app suddenly needed an update. I plugged it in, but the charger said not today. The battery icon blinked once, showed me every bad decision I made that day, and disappeared. When it finally turned back on, it had one notification: character development complete.",
      caption: `One percent is a horror genre.${cta}\n#brainrot #relatable #memes #genz #fyp`,
    },
  ];
  return Array.from({ length: postsPerDay }, (_, index) => bank[(postIndex + index) % bank.length]);
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

export async function runBrainRotMeeting() {
  const stamp = new Date().toISOString();
  console.log(`\n${"=".repeat(50)}`);
  console.log(`[Empire OS] Brain Rot Meeting ${stamp}`);
  console.log("=".repeat(50));

  if (isAutomationPaused()) {
    console.log("[Control] Automation is paused - skipping Brain Rot Meeting.");
    return;
  }

  let allChannels;
  try {
    allChannels = await getChannels();
    if (!allChannels.length) throw new Error("No channels returned");
  } catch (e) {
    console.error("[BrainRot] Cannot fetch channels:", e.message);
    return;
  }

  const channels = allChannels.filter((ch) => isBrainRotChannel(ch.name || ch.identifier || ch.id));
  if (!channels.length) {
    console.log("[BrainRot] No brain rot channels connected yet.");
    return;
  }
  console.log(`\n[BrainRot] ${channels.length} channel(s): ${channels.map((c) => c.name).join(", ")}`);

  const recentPosts = await getRecentPosts(15);
  const perfSummary = recentPosts.length
    ? recentPosts.slice(0, 6).map((p) => {
      const text = String(p.content || p.message || p.text || "").slice(0, 70);
      const views = p.statistics?.views ?? p.views ?? "?";
      const likes = p.statistics?.likes ?? p.likes ?? "?";
      return `"${text}..." -> ${views} views, ${likes} likes`;
    }).join("\n")
    : null;

  const postCounters = {};
  for (const ch of channels) {
    const name = ch.name || ch.identifier || ch.id;
    const config = getChannelConfig(name);
    if (!(name in postCounters)) postCounters[name] = 0;

    console.log(`\n${"-".repeat(40)}`);
    console.log(`[BrainRot] ${name}`);
    const trends = await scoutTrends(config.niche);
    const posts = await generatePosts(name, config.niche, config.postsPerDay, trends, perfSummary, config.affiliate || null, postCounters[name]);
    postCounters[name] += posts.length;

    if (!posts.length) {
      console.error("[BrainRot] No posts generated - skipping channel");
      continue;
    }

    const times = buildScheduleTimes(config.times);
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const date = times[i] || times[0];
      let videoPath = null;

      try {
        assertPolicySafePost({ post, channelName: name, audience: "teen", niche: config.niche });
        assertContentQuality({ post, niche: config.niche, audience: "teen" });
        videoPath = await generateVideo({
          script: post.script || post.caption,
          hook: post.hook,
          niche: config.niche,
          style: "brainrot",
          voice: "en-US-JennyNeural",
          allowLocalFallback: true,
        });
        const integrationId = channelId(ch);
        const postiz = await schedulePost({ integrationId, content: post.caption, date, mediaPath: videoPath, requireMedia: true });
        recordScheduledPost({ title: post.title, channelName: name, integrationId, scheduledFor: date, postiz, videoPath, niche: config.niche });
        console.log(`[Nova] Scheduled brainrot video at ${date}`);
      } catch (e) {
        console.error(`[RenderGuard] Skipped brainrot post: ${e.message}`);
      } finally {
        cleanup(videoPath);
      }
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log("[BrainRot] Meeting complete.\n");
}
