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
  if (/(kids|children|toddler|nursery|roblox|minecraft|vaultrise)/.test(lower)) return "kids";
  if (/(brainrot|meme|gen z|skibidi|ohio|rizz|npc|techtaks)/.test(lower)) return "teen";
  return "general";
}

function styleFromNiche(niche = "") {
  const lower = niche.toLowerCase();
  if (/(horror|scary|creepy|paranormal|haunting|true crime|cold case|mystery|beyondthealibi|alibi)/.test(lower)) return "horror";
  if (/(kids|children|toddler|nursery|roblox|minecraft|vaultrise)/.test(lower)) return "kids";
  if (/(brainrot|meme|gen z|skibidi|ohio|rizz|npc|techtaks)/.test(lower)) return "brainrot";
  if (/(ai|productivity|automation|finance|money|business|side hustle|tools|students|creator|fitness)/.test(lower)) return "faceless-reels";
  return "dark";
}

function voiceDirection(style, audience) {
  if (style === "horror") return "slow suspense voice, low-energy delivery, leave silence for tension";
  if (audience === "kids" || style === "kids") return "cheerful safe voice, simple words, bright pacing";
  if (style === "brainrot") return "fast energetic voice, punchy captions, no dead air";
  if (style === "faceless-reels") return "polished faceless narrator, quick but clear, high trust, no dead air";
  return "clear creator voice, confident and conversational";
}

function higgsfieldPromptTemplate({ niche, style, referenceAnalysis }) {
  const visual = referenceAnalysis.visualLanguage?.join("; ") || "cinematic vertical social video";
  const pacing = referenceAnalysis.pacingNotes?.join("; ") || "hook fast, keep motion throughout, clear payoff";
  if (style === "horror") {
    return clean(`Realistic caught-on-camera footage for this niche: ${niche}.
Handheld phone camera moving through a dark hallway at night.
Shaky motion, motion blur. Person hears something, turns corner, sudden horrifying reveal.
Cinematic tension build, scary voice, silence before the reveal, and one clear jump scare. Found footage aesthetic. 9:16 vertical. No CGI monsters.
No copyrighted characters. No graphic gore. Scary atmosphere, rising dread, clear payoff.
Genre: horror. Sound on.
Final video must be 20-59 seconds and so high-retention viewers want to keep watching and rewatch it.
Script must have clear setup, escalation, payoff, and ending. Add tension and a clean jump scare for horror, without gore.
Reference-inspired visual language: ${visual}.
Reference-inspired pacing: ${pacing}.
Use the reusable patterns, but do not copy creator footage, logos, copyrighted characters, or exact wording from references.`, 1600);
  }
  if (style === "faceless-reels") {
    return clean(`Create a polished faceless short-form reel for this niche: ${niche}.
Use a high-quality faceless-reel format: cinematic b-roll, phone/laptop/desk/lifestyle shots, quick cuts, bold captions, and a clear useful payoff.
The first second must stop the scroll, then every 3-5 seconds should introduce a new visual beat.
Avoid face-to-camera presenter shots, copied templates, logos, watermarks, exact creator wording, or reused footage.
Final video must be 20-59 seconds, vertical 9:16, modern, sharp, and rewatchable.
Script must have a clear setup, escalation, practical takeaway or twist, and ending.
Reference-inspired visual language: ${visual}.
Reference-inspired pacing: ${pacing}.
Use reusable category patterns only; do not clone any proprietary Faceless Reels template or creator video.`, 1600);
  }
  return clean(`Create a vertical 9:16 ${style} short-form video for this niche: ${niche}.
It must be real video motion, not a slideshow or static image.
Visual language: ${visual}.
Pacing: ${pacing}.
Use a strong first 1-2 seconds, continuous motion, readable captions, and a clear payoff.
Final video must be 20-59 seconds and so entertaining for the account niche that viewers want to keep watching and rewatch it.
Script must have clear setup, escalation, payoff, and ending. No random words or confusing sentence jumps.
Do not copy creator footage, logos, copyrighted characters, or exact wording from references.`, 1600);
}

function assignments({ niche, style, audience, referenceAnalysis, spend }) {
  const spendBlocked = spend.enforced && spend.remaining !== null && spend.remaining <= 0;
  return [
    {
      agent: "reference-analyst",
      task: "Extract reusable patterns from the provided references and update the style notes.",
      output: "winningPatterns, pacingNotes, visualLanguage, captionStyle, doNotCopy",
      status: referenceAnalysis.references.length ? "ready" : "waiting-for-references",
    },
    {
      agent: "content-strategist",
      task: `Create original ${niche} video concepts that use the patterns without copying.`,
      output: "3 video concepts with hook, payoff, and caption angle",
      status: "ready",
    },
    {
      agent: "hook-writer",
      task: "Write retention-first hooks and script beats for a coherent 20-59 second video.",
      output: "hook, scriptBeats, caption, hashtags",
      status: "ready",
    },
    {
      agent: "higgsfield-director",
      task: `Generate Higgsfield prompts for ${style} videos and keep them ${audience}-safe.`,
      output: "higgsfieldPrompt, modelSettings, negativePrompt",
      status: spendBlocked ? "blocked-by-budget" : "ready",
    },
    {
      agent: "quality-gate",
      task: "Reject weak/static/unsafe/off-niche videos before posting, including videos outside the 20-59 second target or scripts without real story flow.",
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
      task: "Feed performance back into niche and hook choices.",
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
    productionRule: "Higgsfield only. Videos must be 20-59 seconds, niche-correct, full of motion, visually matched to the script, and entertaining enough to make viewers keep watching and rewatch. Scripts need setup, escalation, payoff, and ending. If Higgsfield fails or quality fails, skip posting.",
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
