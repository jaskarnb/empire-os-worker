const AGENT_MEDIA_API = "https://api.agent-media.ai";

function enabled() {
  return process.env.AGENT_MEDIA_ENABLED === "true" && Boolean(process.env.AGENT_MEDIA_API_KEY);
}

function clean(value, maxLength = 900) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function chooseDuration(script) {
  const words = clean(script, 2000).split(/\s+/).filter(Boolean).length;
  if (words <= 45) return 20;
  if (words <= 85) return 35;
  return 50;
}

function actorDescription({ niche = "", style = "dark" }) {
  const lower = `${niche} ${style}`.toLowerCase();
  const base = "vertical 9:16 AI-generated UGC video, fast cuts, natural creator delivery, expressive face, relevant b-roll scenes, kinetic captions synced to speech, no static photo slideshow";
  if (lower.includes("fitness")) return `${base}, energetic fitness coach in a modern gym, workout b-roll matched to the script`;
  if (lower.includes("finance") || lower.includes("wealth") || lower.includes("money")) return `${base}, trustworthy young finance creator in a clean home office, money graphics and app-screen b-roll matched to the script`;
  if (lower.includes("tech") || lower.includes("ai") || lower.includes("productivity")) return `${base}, curious tech creator at a desk with soft lighting, AI tools, laptop, workflow, and automation b-roll matched to each sentence`;
  if (lower.includes("side hustle") || lower.includes("business")) return `${base}, relatable young entrepreneur in a simple workspace, business workflow b-roll matched to the script`;
  return `${base}, relatable short-form creator speaking directly to camera, visual scenes matched to each sentence`;
}

function extractVideoUrl(data) {
  if (data.final_output?.video_url) return data.final_output.video_url;
  if (data.output?.video_url) return data.output.video_url;
  if (Array.isArray(data.artifacts)) {
    const artifact = data.artifacts.find((item) => String(item.url || "").includes(".mp4"));
    if (artifact?.url) return artifact.url;
  }
  return null;
}

async function startSkillRun({ description, script, duration }) {
  const res = await fetch(`${AGENT_MEDIA_API}/v1/skills/make_ugc_video/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AGENT_MEDIA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description,
      script,
      duration,
      subtitles: true,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`AgentMedia run ${res.status}: ${text}`);
  const data = JSON.parse(text);
  const runId = data.skill_run_id || data.run_id || data.id;
  if (!runId) throw new Error(`AgentMedia did not return a run id: ${text}`);
  return runId;
}

async function pollSkillRun(runId) {
  const timeoutMs = Number(process.env.AGENT_MEDIA_TIMEOUT_MS || 12 * 60 * 1000);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${AGENT_MEDIA_API}/v1/skills/runs/${runId}`, {
      headers: { Authorization: `Bearer ${process.env.AGENT_MEDIA_API_KEY}` },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`AgentMedia poll ${res.status}: ${text}`);
    const data = JSON.parse(text);
    const status = data.status || data.state;

    if (status === "succeeded" || status === "completed" || status === "success") {
      const videoUrl = extractVideoUrl(data);
      if (!videoUrl) throw new Error(`AgentMedia succeeded but returned no video URL: ${text}`);
      return { videoUrl, raw: data };
    }
    if (status === "failed" || status === "error" || status === "cancelled") {
      throw new Error(`AgentMedia run ${runId} failed: ${text}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }

  throw new Error(`AgentMedia run ${runId} timed out`);
}

export function shouldUseAgentMedia({ niche = "", style = "dark" }) {
  if (!enabled()) return false;
  const mode = String(process.env.AGENT_MEDIA_MODE || "ugc-only").trim();
  if (mode === "all") return true;
  if (style === "brainrot" || style === "kids") return false;

  const lower = niche.toLowerCase();
  return ["finance", "wealth", "money", "fitness", "tech", "ai", "productivity", "business", "side hustle"].some((term) => lower.includes(term));
}

export async function generateAgentMediaVideo({ script, hook, niche = "", style = "dark" }) {
  if (!enabled()) throw new Error("AgentMedia is not enabled or AGENT_MEDIA_API_KEY is missing");

  const safeScript = clean(script || hook, 700);
  if (!safeScript) throw new Error("AgentMedia needs script text");

  const description = actorDescription({ niche, style });
  const duration = chooseDuration(safeScript);
  console.log(`[AgentMedia] Starting UGC render (${duration}s): ${description}`);

  const runId = await startSkillRun({ description, script: safeScript, duration });
  console.log(`[AgentMedia] Run started: ${runId}`);

  const { videoUrl } = await pollSkillRun(runId);
  console.log(`[AgentMedia] Video ready: ${videoUrl}`);
  return videoUrl;
}
