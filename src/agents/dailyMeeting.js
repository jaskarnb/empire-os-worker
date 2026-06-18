/**
 * Daily Meeting — Empire OS
 * 7 AM UTC every day:
 *   1. Fetch Postiz channel list + recent post analytics
 *   2. Scout scans trending topics (per niche, with web search)
 *   3. Muse generates niche-specific post ideas with affiliate CTAs
 *   4. Nova schedules posts to Postiz at optimal times
 *
 * AFFILIATE PROGRAMS (rotate CTA on ~every other post to stay authentic):
 *   vault  → Webull (free stock sign-up, $12–36/referral)
 *   alibi  → NordVPN ($40–100/sale — privacy angle fits true crime perfectly)
 *   tech   → Hostinger (60% commission ~$60/sale — "build your AI-powered site")
 *   lift   → Whoop ($30/referral — wearable fitness tracker, gym audience loves it)
 *   hub    → Hostinger (same as tech — "launch your automation business")
 */
import Anthropic from "@anthropic-ai/sdk";
import { getChannels, getRecentPosts, schedulePost } from "../tools/postiz.js";

const client = () =>
  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Channel → Niche + Affiliate mapping ─────────────────────────────────────
const CHANNEL_CONFIG = [
  {
    match: "vault",
    niche: "Finance, wealth building, passive income, money mindset for 18-35 year olds",
    postsPerDay: 2,
    times: ["12:00", "23:00"],
    affiliate: {
      name: "Webull",
      offer: "Get a FREE stock (worth up to $1,600) when you sign up",
      cta: "Get your free stock → link in bio 👆",
      url: "webull.com/activity/register",
    },
  },
  {
    match: "alibi",
    niche: "True crime, cold cases, murder mysteries, criminal psychology",
    postsPerDay: 2,
    times: ["13:00", "22:00"],
    affiliate: {
      name: "NordVPN",
      offer: "67% off + 3 months free — protect your privacy while you research",
      cta: "Lock down your browsing → link in bio 🔒",
      url: "nordvpn.com",
    },
  },
  {
    match: "tech",
    niche: "AI tools and tech news explained simply for everyday people",
    postsPerDay: 2,
    times: ["11:00", "21:00"],
    affiliate: {
      name: "Hostinger",
      offer: "Build your own AI-powered website for $2.99/mo (80% off)",
      cta: "Start your site for $2.99 → link in bio 🚀",
      url: "hostinger.com",
    },
  },
  {
    match: "lift",
    niche: "Fitness, gym motivation, workout tips, body transformation",
    postsPerDay: 1,
    times: ["14:00"],
    affiliate: {
      name: "WHOOP",
      offer: "Get 1 month free on WHOOP — the fitness tracker the pros use",
      cta: "Try WHOOP free → link in bio 💪",
      url: "join.whoop.com",
    },
  },
  {
    match: "hub",
    niche: "AI productivity tools and automation for beginners",
    postsPerDay: 1,
    times: ["15:00"],
    affiliate: {
      name: "Hostinger",
      offer: "Launch your automation business online for $2.99/mo",
      cta: "Get your site live today → link in bio ⚡",
      url: "hostinger.com",
    },
  },
];

function getChannelConfig(name = "") {
  const lower = name.toLowerCase();
  return (
    CHANNEL_CONFIG.find((c) => lower.includes(c.match)) || {
      niche: "viral short-form content",
      postsPerDay: 1,
      times: ["12:00"],
      affiliate: null,
    }
  );
}

// ─── Scout: search trends for a niche ────────────────────────────────────────
async function scoutTrends(niche) {
  try {
    const resp = await client().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 2,
        },
      ],
      messages: [
        {
          role: "user",
          content: `Search for what is trending TODAY in "${niche}" content on TikTok and YouTube Shorts. Give me 3 specific viral video formats or topics with proven high engagement right now. Be concrete — include real examples if you find them.`,
        },
      ],
    });
    const textBlock = resp.content.find((b) => b.type === "text");
    return textBlock?.text || "Focus on evergreen, high-value hooks.";
  } catch (e) {
    console.warn("[Scout] Web search failed, using fallback:", e.message);
    const resp = await client().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `What are 3 video formats that consistently go viral in "${niche}" on TikTok/Shorts? Be specific about format and why they work.`,
        },
      ],
    });
    return resp.content[0].text;
  }
}

// ─── Muse: generate post ideas per channel ───────────────────────────────────
async function generatePosts(channelName, niche, postsPerDay, trends, perfSummary, affiliate, postIndex = 0) {
  const perfContext = perfSummary
    ? `RECENT PERFORMANCE:\n${perfSummary}\n\nLearn from what's working and what's not.`
    : "NEW CHANNEL: Focus on proven high-retention hooks. Prioritise value and curiosity gaps.";

  // Rotate affiliate CTA: include it on every other post (even postIndex)
  // This keeps the channel authentic — not every post is a sell
  const affiliateInstructions = affiliate && postIndex % 2 === 0
    ? `
MONETIZATION (include naturally in this post):
- Affiliate: ${affiliate.name}
- Offer: ${affiliate.offer}
- End caption with: "${affiliate.cta}"
- The CTA must feel organic — tie it into the video's topic, don't just slap it on.
- Example tie-in: if the video is about "5 money mistakes", end with "I use Webull to automate my investing — get a free stock → link in bio 👆"
`
    : `MONETIZATION: Skip the affiliate CTA on this post. Keep it pure value to build trust.`;

  const prompt = `You are the content strategist for "${channelName}", a ${niche} channel on TikTok/YouTube Shorts.

TRENDING RIGHT NOW:
${trends}

${perfContext}

${affiliateInstructions}

Generate exactly ${postsPerDay} post(s) for today. Each post must:
- Open with a scroll-stopping hook (first sentence = the reason they stop scrolling)
- Be a standalone 30-60 second video concept
- Have a caption optimised for virality with 5 hashtags
- If monetization is included above, work it in naturally at the end of the caption

Return ONLY valid JSON — no markdown, no explanation:
[
  {
    "title": "Internal title for this concept",
    "caption": "Full caption. Hook as first line. Body summary. Affiliate CTA if applicable. Then hashtags on a new line.",
    "hook": "The exact first 5-8 spoken words of the video"
  }
]`;

  const resp = await client().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = resp.content[0].text;
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) {
    console.error(`[Muse] No JSON for ${channelName}. Raw:`, raw.slice(0, 200));
    return [];
  }
  try {
    return JSON.parse(match[0]).slice(0, postsPerDay);
  } catch (e) {
    console.error(`[Muse] Parse error for ${channelName}:`, e.message);
    return [];
  }
}

// ─── Scheduling helpers ───────────────────────────────────────────────────────
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
export async function runDailyMeeting() {
  const stamp = new Date().toISOString();
  console.log(`\n${"=".repeat(50)}`);
  console.log(`[Empire OS] Daily Meeting  ${stamp}`);
  console.log("=".repeat(50));

  // 1. Channels
  let channels;
  try {
    channels = await getChannels();
    if (!channels.length) throw new Error("No channels returned");
    console.log(`\n[Atlas] ${channels.length} channel(s): ${channels.map((c) => c.name).join(", ")}`);
  } catch (e) {
    console.error("[Atlas] Cannot fetch channels:", e.message);
    return;
  }

  // 2. Analytics
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
    console.log("\n[Ledger] Recent performance:\n" + perfSummary);
  } else {
    console.log("\n[Ledger] No analytics yet (new account)");
  }

  // Track post index per channel for affiliate rotation
  const postCounters = {};

  // 3. Per-channel: scout → ideate → schedule
  for (const ch of channels) {
    const name = ch.name || ch.identifier || ch.id;
    const config = getChannelConfig(name);
    if (!(name in postCounters)) postCounters[name] = 0;

    console.log(`\n--- ${name} (${config.niche.split(",")[0]}) ---`);
    if (config.affiliate) {
      console.log(`[Ledger] Affiliate: ${config.affiliate.name} — rotating every other post`);
    }

    // Scout
    console.log("[Scout] Searching trends…");
    const trends = await scoutTrends(config.niche);
    console.log("[Scout] Done:", trends.slice(0, 80) + "…");

    // Muse
    console.log(`[Muse] Generating ${config.postsPerDay} post(s)…`);
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

    // Nova: schedule
    const times = buildScheduleTimes(config.times);
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const date = times[i] || times[0];
      console.log(`[Nova] Scheduling "${post.title}" at ${date}…`);
      try {
        await schedulePost({ integrationId: ch.id, content: post.caption, date });
        console.log(`[Nova] ✓ Scheduled`);
      } catch (e) {
        console.error(`[Nova] ✗ Failed:`, e.message);
      }
    }
  }

  console.log(`\n[Atlas] Meeting complete. Posts scheduled. Empire running.\n`);
}
