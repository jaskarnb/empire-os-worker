import { getAgent, listAgents } from "./agentRegistry.js";
import { getSquad, listSquads } from "./agentSquads.js";
import { getTeamMemory, rememberForAgent, rememberShared } from "./agentMemory.js";

function clean(value, max = 1000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function inferSquad({ task = "", niche = "", style = "" } = {}) {
  const text = `${task} ${niche} ${style}`.toLowerCase();
  if (/(kid|children|toddler|nursery|roblox|minecraft)/.test(text)) return "kids-video-production";
  if (/(brainrot|meme|gen z|skibidi|ohio|rizz|npc)/.test(text)) return "brainrot-video-production";
  if (/(horror|scary|creepy|paranormal|caught|camera|cctv|pov|true crime)/.test(text)) return "horror-video-production";
  if (/(niche|discover|launch|scale|kill|test)/.test(text)) return "niche-discovery";
  if (/(reference|competitor|analyze|horror_spot|horror_hub)/.test(text)) return "reference-research";
  if (/(post|schedule|publish|postiz)/.test(text)) return "publishing";
  if (/(analytics|performance|winner|loser|views|comments)/.test(text)) return "analytics-feedback";
  if (/(money|revenue|affiliate|sponsor|offer|funnel)/.test(text)) return "monetization";
  return "ops-safety";
}

function buildAssignments({ squad, task, context = {} }) {
  return squad.agents.map((agentId, index) => {
    const agent = getAgent(agentId);
    return {
      order: index + 1,
      agentId,
      agentName: agent?.name || agentId,
      team: agent?.team || "unknown",
      mission: agent?.mission || "",
      task: agentTask({ agentId, task, context }),
      memoryNeeded: true,
      status: index === 0 ? "start" : "waiting",
    };
  });
}

function agentTask({ agentId, task, context }) {
  const niche = clean(context.niche || "current niche", 160);
  const platform = clean(context.platform || "TikTok/Reels/Shorts", 80);
  const base = clean(task, 240);
  const taskMap = {
    "trend-radar": `Find current trends and timely angles for ${niche} on ${platform}.`,
    "competitor-tracker": `Study target pages/competitors and find what is repeatedly working for ${niche}.`,
    "reference-analyst": `Extract reusable pacing, hook, caption, and visual patterns for: ${base}.`,
    "audience-psychologist": `Explain why the target viewer would keep watching, share, comment, or follow.`,
    "content-strategist": `Create original content concepts for ${niche} using the strategy brief.`,
    "series-architect": `Turn the strongest concept into a repeatable series format.`,
    "hook-writer": `Write hooks, script beats, captions, and reveals for the selected concept.`,
    "script-doctor": `Tighten the script so every line improves retention and payoff.`,
    "first-frame-agent": `Design the first frame/opening second so viewers stop scrolling.`,
    "higgsfield-director": `Create Higgsfield prompts/settings for the approved script. Higgsfield only.`,
    "voice-director": `Pick voice, pacing, sound, and caption rhythm for the niche and audience.`,
    "retention-editor": `Find slow spots and give regeneration notes before publishing.`,
    "caption-seo-agent": `Optimize caption, title, hashtags, and search keywords for ${platform}.`,
    "platform-adapter": `Package the approved video for each platform without changing the core idea.`,
    "quality-gate": `Block the post if it is weak, static, unsafe, off-niche, or low-retention.`,
    "compliance-safety-agent": `Check platform safety, kids rules, finance claims, horror limits, and brand safety.`,
    "posting-operator": `Schedule only approved Higgsfield videos through Postiz.`,
    "schedule-optimizer": `Choose best posting time and cadence for the channel.`,
    "analytics-agent": `Turn performance data into next actions and winner/loser patterns.`,
    "experiment-manager": `Define A/B variants and success criteria for this task.`,
    "asset-librarian": `Save prompts, scripts, video links, and outcome tags for reuse.`,
    "revenue-agent": `Find monetization angles that fit the niche without hurting trust.`,
    "funnel-agent": `Design the path from content to offer, lead magnet, or link-in-bio action.`,
    "community-agent": `Use comments/questions to create future video ideas.`,
    "budget-watcher": `Confirm spend and credit safety before generation.`,
    "tool-scout": `Recommend tools/skills only if they are needed and safe.`,
    "social-watcher": `Check social/Postiz publishing health.`,
    "railway-watcher": `Check worker/deployment health.`,
  };
  return taskMap[agentId] || base;
}

export function spawnAgentTask({
  task = "Create one high-quality short-form video",
  niche = "",
  style = "",
  platform = "TikTok/Reels/Shorts",
  squadId = null,
  requestedAgents = [],
  context = {},
} = {}) {
  const resolvedSquadId = squadId || inferSquad({ task, niche, style });
  const squad = getSquad(resolvedSquadId) || listSquads()[0];
  const extraAgents = requestedAgents.filter((agentId) => getAgent(agentId) && !squad.agents.includes(agentId));
  const expandedSquad = { ...squad, agents: [...squad.agents, ...extraAgents] };
  const taskId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fullContext = { ...context, niche, style, platform };
  const assignments = buildAssignments({ squad: expandedSquad, task, context: fullContext });
  const memory = getTeamMemory(assignments.map((item) => item.agentId), 60);

  const plan = {
    taskId,
    status: "spawned",
    createdAt: new Date().toISOString(),
    task: clean(task, 500),
    squad: {
      id: expandedSquad.id,
      name: expandedSquad.name,
      lead: expandedSquad.lead,
      success: expandedSquad.success,
    },
    context: fullContext,
    assignments,
    teamMemory: memory,
    collaborationRules: [
      "Agents share useful findings into shared memory.",
      "Specialist agents write their own memory after each task.",
      "Quality Gate can send work back to Hook Writer, Script Doctor, or Higgsfield Director.",
      "Posting Operator cannot publish unless Quality Gate passes.",
      "Budget Watcher can pause generation if spend limits are unsafe.",
    ],
  };

  rememberShared({
    type: "task-spawned",
    agentId: "agent-spawner",
    taskId,
    content: `Spawned ${expandedSquad.name} for: ${task}`,
    data: { squadId: expandedSquad.id, agents: expandedSquad.agents },
  });

  for (const assignment of assignments) {
    rememberForAgent(assignment.agentId, {
      type: "assignment",
      taskId,
      content: assignment.task,
      data: { squadId: expandedSquad.id, order: assignment.order },
    });
  }

  return plan;
}

export function agentSpawnerStatus() {
  return {
    status: "ok",
    agentCount: listAgents().length,
    squadCount: listSquads().length,
    canSpawn: true,
    memory: "shared and per-agent memory enabled",
  };
}
