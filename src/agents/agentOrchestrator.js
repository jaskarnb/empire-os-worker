import { listAgents } from "./agentRegistry.js";
import { listSquads } from "./agentSquads.js";
import { analyzeReferenceVideos } from "./referenceAnalyst.js";
import { runNicheScout } from "./nicheScout.js";
import { getAnalyticsSnapshots, getScheduledPosts, getSpendState } from "../tools/opsState.js";

function clean(value, max = 1000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function audienceFromNiche(niche = "") {
  const lower = niche.toLowerCase();
  if (/(kids|children|toddler|nursery|roblox|minecraft)/.test(lower)) return "kids";
  if (/(brainrot|meme|gen z|skibidi|ohio|rizz|npc)/.test(lower)) return "teen";
  return "general";
}

function styleFromNiche(niche = "") {
  const lower = niche.toLowerCase();
  if (/(horror|scary|creepy|paranormal|haunting|true crime|cold case|mystery)/.test(lower)) return "horror";
  if (/(kids|children|toddler|nursery|roblox|minecraft)/.test(lower)) return "kids";
  if (/(brainrot|meme|gen z|skibidi|ohio|rizz|npc)/.test(lower)) return "brainrot";
  return "dark";
}

function voiceDirection(style, audience) {
  if (style === "horror") return "mix formats: low suspense narration for 45-60 second scary stories, and minimal voice with sharp sound design for 8-20 second jump-scare clips";
  if (audience === "kids" || style === "kids") return "cheerful safe voice, simple words, bright pacing";
  if (style === "brainrot") return "fast energetic voice, punchy captions, no dead air";
  return "clear creator voice, confident and conversational";
}

function formatMix(style) {
  if (style === "horror") {
    return [
      {
        id: "short-jump-scare",
        targetLength: "8-20 seconds",
        cadence: "most posts",
        direction: "One scary caught-on-camera moment with fast setup, quiet tension, a strong platform-safe jump scare, scary sound, and a short aftermath beat.",
      },
      {
        id: "long-scary-story",
        targetLength: "45-60 seconds",
        cadence: "regular rotation",
        direction: "A longer narrated horror story with readable captions, unsettling sound, slow buildup, visual escalation, one or two scares, and a clear final payoff.",
      },
    ];
  }
  if (style === "kids") {
    return [{ id: "cheerful-story", targetLength: "15-35 seconds", cadence: "default", direction: "Bright motion, cheerful voice, simple captions, safe joke or payoff, no scary beats." }];
  }
  if (style === "brainrot") {
    return [{ id: "fast-chaos", targetLength: "8-25 seconds", cadence: "default", direction: "Fast motion, loud retention beats, meme pacing, exaggerated captions, and no dead air." }];
  }
  return [{ id: "complete-short", targetLength: "15-35 seconds", cadence: "default", direction: "Motion-first short with hook, escalation, payoff, captions, and platform-native pacing." }];
}

function higgsfieldPromptTemplate({ niche, style, referenceAnalysis }) {
  const visual = referenceAnalysis.visualLanguage?.join("; ") || "cinematic vertical social video";
  const pacing = referenceAnalysis.pacingNotes?.join("; ") || "hook fast, keep motion throughout, clear payoff";
  if (style === "horror") {
    return clean(`Realistic caught-on-camera horror footage for this niche: ${niche}.
Rotate between two winning formats:
1. Short jump-scare clip, 8-20 seconds: fast setup, silence, sudden scary reveal, frightening sound hit, and a short aftermath beat.
2. Longer scary story, 45-60 seconds: suspense narration, readable captions, eerie sound, buildup, escalation, scare payoff, and final unsettling ending.
Found footage aesthetic. 9:16 vertical. Real camera motion. No static slideshow.
No copyrighted characters. No graphic gore. No unsafe harm. Platform-safe scare content.
Reference-inspired visual language: ${visual}.
Reference-inspired pacing: ${pacing}.
Use the reusable patterns, but do not copy creator footage, logos, copyrighted characters, or exact wording from references.`, 1600);
  }
  return clean(`Create a vertical 9:16 ${style} short-form video for this niche: ${niche}.
It must be real video motion, not a slideshow or static image.
Visual language: ${visual}.
Pacing: ${pacing}.
Use a strong first 1-2 seconds, continuous motion, readable captions, niche-matched sound/voice, and a clear payoff.
Match the quality bar from the horror format work: entertaining, visual, retention-first, and native to TikTok/Reels/Shorts.
Do not copy creator footage, logos, copyrighted characters, or exact wording from references.`, 1600);
}

function assignments({ niche, style, audience, referenceAnalysis, spend }) {
  const spendBlocked = spend.enforced && spend.remaining !== null && spend.remaining <= 0;
  const horrorFormatNote = style === "horror" ? " Rotate formats between short 8-20 second jump scares and 45-60 second narrated scary stories with captions and scary sound." : " Follow the same quality bar as horror: motion-first, entertaining, niche-matched sound/voice, not static caption posts.";
  return [
    {
      agent: "reference-analyst",
      task: "Extract reusable patterns from the provided references and update the style notes." + horrorFormatNote,
      output: "winningPatterns, pacingNotes, visualLanguage, captionStyle, doNotCopy",
      status: referenceAnalysis.references.length ? "ready" : "waiting-for-references",
    },
    {
      agent: "content-strategist",
      task: `Create original ${niche} video concepts that use the patterns without copying.${horrorFormatNote}`,
      output: "3 video concepts with hook, payoff, and caption angle",
      status: "ready",
    },
    {
      agent: "hook-writer",
      task: "Write retention-first hooks and script beats." + horrorFormatNote,
      output: "hook, scriptBeats, caption, hashtags",
      status: "ready",
    },
    {
      agent: "higgsfield-director",
      task: `Generate Higgsfield prompts for ${style} videos and keep them ${audience}-safe.${horrorFormatNote}`,
      output: "higgsfieldPrompt, modelSettings, negativePrompt",
      status: spendBlocked ? "blocked-by-budget" : "ready",
    },
    {
      agent: "quality-gate",
      task: "Reject weak/static/unsafe videos before posting. Require real motion, readable captions when used, niche-matched sound, and no static image posts.",
      output: "pass/fail plus regeneration notes",
      status: "required",
    },
    {
      agent: "posting-operator",
      task: "Schedule only approved Higgsfield videos through Postiz.",
      output: "postizResult and scheduled memory",
      status: "after-quality-pass",
    },
    {
      agent: "analytics-agent",
      task: "Feed performance back into niche, format length, hook, sound, and scare/payoff choices.",
      output: "winnerPatterns, loserPatterns, nextTests",
      status: "after-publishing",
    },
  ];
}

function recommendedSquads(style, niche) {
  const squads = listSquads();
  const wanted = ["niche-discovery", "reference-research", "publishing", "analytics-feedback", "ops-safety"];
  if (style === "horror") wanted.unshift("horror-video-production");
  else if (style === "kids") wanted.unshift("kids-video-production");
  else if (style === "brainrot") wanted.unshift("brainrot-video-production");
  else wanted.unshift("horror-video-production");

  if (/(money|finance|business|affiliate|revenue|product|offer)/i.test(niche)) {
    wanted.push("monetization");
  }

  return squads.filter((squad) => wanted.includes(squad.id));
}

export function createAgentBriefing({
  niche = "horror caught-on-camera short-form videos",
  style = "auto",
  platform = "TikTok/Reels/Shorts",
  references = [],
  goal = "make high-retention videos",
} = {}) {
  const resolvedStyle = style === "auto" ? styleFromNiche(niche) : style;
  const audience = audienceFromNiche(niche);
  const referenceAnalysis = analyzeReferenceVideos({ references, niche, style: resolvedStyle });
  const nicheScout = runNicheScout();
  const analytics = getAnalyticsSnapshots(10);
  const scheduledPosts = getScheduledPosts(25);
  const spend = getSpendState();
  const promptTemplate = higgsfieldPromptTemplate({ niche, style: resolvedStyle, referenceAnalysis });

  return {
    status: "ok",
    generatedAt: new Date().toISOString(),
    goal: clean(goal, 240),
    platform,
    niche,
    style: resolvedStyle,
    audience,
    productionRule: "Higgsfield only. If Higgsfield fails or quality fails, skip posting.",
    formatMix: formatMix(resolvedStyle),
    voiceDirection: voiceDirection(resolvedStyle, audience),
    higgsfieldPromptTemplate: promptTemplate,
    referenceAnalysis,
    assignments: assignments({ niche, style: resolvedStyle, audience, referenceAnalysis, spend }),
    recommendedSquads: recommendedSquads(resolvedStyle, niche),
    controls: {
      spend,
      scheduledPosts: scheduledPosts.length,
      analyticsSnapshots: analytics.length,
      nicheScoutTop: nicheScout.recommendations?.slice(0, 5) || [],
    },
    availableAgents: listAgents(),
  };
}
