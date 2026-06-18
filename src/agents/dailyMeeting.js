/**
 * Daily Meeting — Empire OS
 * 7 AM UTC every day:
 *   1. Fetch Postiz channels + recent analytics
 *   2. Scout scans trending topics (per niche, web search)
 *   3. Muse generates niche-specific posts
 *   4. Nova schedules posts to Postiz at optimal times
 */
import Anthropic from "@anthropic-ai/sdk";
import { getChannels, getRecentPosts, schedulePost } from "../tools/postiz.js";

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CHANNEL_CONFIG = [
  { match: "vault", niche: "Finance, wealth building, passive income, money mindset for 18-35 year olds", postsPerDay: 2, times: ["12:00", "23:00"] },
  { match: "alibi", niche: "True crime, cold cases, murder mysteries, criminal psychology", postsPerDay: 2, times: ["13:00", "22:00"] },
  { match: "tech", niche: "AI tools and tech news explained simply for everyday people", postsPerDay: 2, times: ["11:00", "21:00"] },
  { match: "lift", niche: "Fitness, gym motivation, workout tips, body transformation", postsPerDay: 1, times: ["14:00"] },
  { match: "hub", niche: "AI productivity tools and automation for beginners", postsPerDay: 1, times: ["15:00"] },
];

function getChannelConfig(name = "") {
  const lower = name.toLowerCase();
  return CHANNEL_CONFIG.find(c => lower.includes(c.match)) || { niche: "viral short-form content", postsPerDay: 1, times: ["12:00"] };
}

async function scoutTrends(niche) {
  try {
    const resp = await client().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      messages: [{ role: "user", content: `Search for what is trending TODAY in "${niche}" content on TikTok and YouTube Shorts. Give me 3 specific viral video formats or topics with proven high engagement right now. Be concrete with real examples.` }],
    });
    const textBlock = resp.content.find(b => b.type === "text");
    return textBlock?.text || "Focus on evergreen high-value hooks.";
  } catch (e) {
    console.warn("[Scout] Web search failed, using fallback:", e.message);
    const resp = await client().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: `What are 3 video formats that consistently go viral in "${niche}" on TikTok/Shorts? Be specific.` }],
    });
    return resp.content[0].text;
  }
}

async function generatePosts(channelName, niche, postsPerDay, trends, perfSummary) {
  const perfContext = perfSummary
    ? `RECENT PERFORMANCE:\n${perfSummary}\n\nLearn from what is working and what is not.`
    : "NEW CHANNEL: Focus on proven high-retention hooks. Prioritise value and curiosity gaps.";

  const prompt = `You are the content strategist for "${channelName}", a ${niche} channel on TikTok/YouTube Shorts.

TRENDING RIGHT NOW:
${trends}

${perfContext}

Generate exactly ${postsPerDay} post(s) for today. Each must:
- Open with a scroll-stopping hook (first sentence = reason they stop scrolling)
- Be a standalone 30-60 second video concept
- Have a caption optimised for virality with 5 hashtags

Return ONLY valid JSON array, no markdown:
[{"title":"Internal title","caption":"Full caption. Hook first. Body. Then hashtags on new line.","hook":"Exact first 5-8 spoken words"}]`;

  const resp = await client().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = resp.content[0].text;
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) { console.error(`[Muse] No JSON for ${channelName}`); return []; }
  try { return JSON.parse(match[0]).slice(0, postsPerDay); }
  catch (e) { console.error(`[Muse] Parse error for ${channelName}:`, e.message); return []; }
}

function buildScheduleTimes(times) {
  return times.map(t => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setUTCHours(h, m, 0, 0);
    if (d < new Date()) d.setDate(d.getDate() + 1);
    return d.toISOString();
  });
}

export async function runDailyMeeting() {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`[Empire OS] Daily Meeting  ${new Date().toISOString()}`);
  console.log("=".repeat(50));

  let channels;
  try {
    channels = await getChannels();
    if (!channels.length) throw new Error("No channels returned");
    console.log(`\n[Atlas] ${channels.length} channel(s): ${channels.map(c => c.name).join(", ")}`);
  } catch (e) {
    console.error("[Atlas] Cannot fetch channels:", e.message);
    return;
  }

  const recentPosts = await getRecentPosts(15);
  let perfSummary = null;
  if (recentPosts.length) {
    perfSummary = recentPosts.slice(0, 6).map(p => {
      const text = String(p.content || p.message || p.text || "").slice(0, 70);
      const views = p.statistics?.views ?? p.views ?? "?";
      const likes = p.statistics?.likes ?? p.likes ?? "?";
      return `"${text}..." -> ${views} views, ${likes} likes`;
    }).join("\n");
    console.log("\n[Ledger] Recent performance:\n" + perfSummary);
  } else {
    console.log("\n[Ledger] No analytics yet (new channels)");
  }

  for (const ch of channels) {
    const name = ch.name || ch.identifier || ch.id;
    const config = getChannelConfig(name);
    console.log(`\n--- ${name} (${config.niche.split(",")[0]}) ---`);

    console.log("[Scout] Searching trends...");
    const trends = await scoutTrends(config.niche);
    console.log("[Scout] Done:", trends.slice(0, 80) + "...");

    console.log(`[Muse] Generating ${config.postsPerDay} post(s)...`);
    const posts = await generatePosts(name, config.niche, config.postsPerDay, trends, perfSummary);
    if (!posts.length) { console.error("[Muse] No posts generated — skipping"); continue; }

    const times = buildScheduleTimes(config.times);
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const date = times[i] || times[0];
      console.log(`[Nova] Scheduling "${post.title}" at ${date}...`);
      try {
        await schedulePost({ integrationId: ch.id, content: post.caption, date });
        console.log("[Nova] Scheduled");
      } catch (e) {
        console.error("[Nova] Failed:", e.message);
      }
    }
  }

  console.log("\n[Atlas] Meeting complete. Empire running.\n");
}
