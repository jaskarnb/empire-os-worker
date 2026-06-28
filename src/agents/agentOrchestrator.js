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

function researchRule(style) {
  const base = "Every content run must start by studying active creators in the same niche, extracting winning formats, hooks, pacing, sounds, captions, thumbnails/first frames, posting cadence, and comment signals. Use these as inspiration only; never copy footage, logos, exact captions, voiceovers, or creator identity.";
  if (style === "horror") return `${base} For horror, compare short jump-scare clips against longer scary-story videos and choose a mix based on what is working now.`;
  if (style === "kids") return `${base} For kids content, only use safe, age-appropriate, cheerful references and avoid scary or risky behavior.`;
  if (style === "brainrot") return `${base} For brainrot, track meme velocity, pacing, caption style, and sound patterns while keeping content platform-safe.`;
  return base;
}

function postingTimeRule(style) {
  const base = "Prioritize TikTok and Instagram Reels over YouTube Shorts while the channel mix is being tested. Schedule in the user's America/Indianapolis timezone. Start with 11:30 AM-1:30 PM and 6:30 PM-10:30 PM test windows, stagger posts at least 90 minutes apart per account, avoid dumping many posts at once, and let analytics replace these defaults after enough data.";
  if (style === "horror") return `${base} Horror should favor evening and late-night windows first, especially 7:30 PM-11:30 PM, with short jump-scare clips and longer story videos mixed across separate slots.`;
  if (style === "kids") return `${base} Kids-safe content should favor after-school and early evening windows, avoid late-night posting as the primary test slot.`;
  if (style === "brainrot") return `${base} Brainrot can test after-school, evening, and late-night windows because teen/meme behavior may spike later.`;
  return base;
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
  const researchNote = ` Required first step: study active creators and recent posts in ${niche}; identify what is working, then make similar-format original videos without copying protected assets or exact wording.`;
  const timingNote = ` Posting timing rule: ${postingTimeRule(style)}`;
  return [
    {
      agent: "trend-radar",
      task: `Scan current platform trends, sounds, formats, and audience behavior for ${niche}.${researchNote}`,
      output: "trendBrief, urgentOpportunities, trendRisk",
      status: "required-first",
    },
    {
      agent: "competitor-tracker",
      task: `Track niche creators/pages and summarize repeatable winners: hooks, pacing, video length, captions, sounds, posting frequency, and comments.${researchNote}`,
      output: "competitorBrief, winningFormats, postingPatterns, contentGaps",
      status: "required-first",
    },
    {
      agent: "reference-analyst",
      task: "Extract reusable patterns from creator references and update the style notes. Focus on why viewers keep watching, not copying the source." + horrorFormatNote,
      output: "winningPatterns, pacingNotes, visualLanguage, captionStyle, doNotCopy",
      status: referenceAnalysis.references.length ? "ready" : "ready-needs-creator-research",
    },
    {
      agent: "content-strategist",
      task: `Create original ${niche} video concepts from trend, competitor, and reference findings.${horrorFormatNote}`,
      output: "3 video concepts with hook, payoff, and caption angle",
      status: "after-research",
    },
    {
      agent: "hook-writer",
      task: "Write retention-first hooks and script beats using the winning structures found by research, while changing topic, wording, and visuals enough to be original." + horrorFormatNote,
      output: "hook, scriptBeats, caption, hashtags",
      status: "after-research",
    },
    {
      agent: "higgsfield-director",
      task: `Generate Higgsfield prompts for ${style} videos and keep them ${audience}-safe. Convert winning creator patterns into original scenes, camera moves, sounds, and pacing.${horrorFormatNote}`,
      output: "higgsfieldPrompt, modelSettings, negativePrompt",
      status: spendBlocked ? "blocked-by-budget" : "after-script",
    },
    {
      agent: "quality-gate",
      task: "Reject weak/static/unsafe videos before posting. Require real motion, readable captions when used, niche-matched sound, and no static image posts. Also reject anything too close to a creator reference.",
      output: "pass/fail plus regeneration notes",
      status: "required",
    },
    {
      agent: "schedule-optimizer",
      task: `Choose the best TikTok/Instagram posting windows for each approved video, account, and niche.${timingNote}`,
      output: "scheduleTimes, cadence, postingPriority",
      status: "after-quality-pass-before-posting",
    },
    {
      agent: "posting-operator",
      task: `Schedule only approved Higgsfield videos through Postiz at the schedule-optimizer's selected times.${timingNote}`,
      output: "postizResult and scheduled memory",
      status: "after-schedule-optimizer",
    },
    {
      agent: "analytics-agent",
      task: "Feed performance back into niche, creator research targets, format length, hook, sound, posting time, and scare/payoff choices.",
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
    researchRule: researchRule(resolvedStyle),
    postingTimeRule: postingTimeRule(resolvedStyle),
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
