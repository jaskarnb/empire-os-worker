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
  if (words <= 35) return 10;
  if (words <= 60) return 15;
  return 15;
}

function actorDescription({ niche = "", style = "dark" }) {
  const lower = `${niche} ${style}`.toLowerCase();
  if (lower.includes("fitness")) return "an energetic fitness coach in a modern gym, confident and friendly, vertical UGC selfie style";
  if (lower.includes("finance") || lower.includes("wealth") || lower.includes("money")) return "a trustworthy young finance creator in a clean home office, confident and clear, vertical UGC selfie style";
  if (lower.includes("tech") || lower.includes("ai") || lower.includes("productivity")) return "a curious tech creator at a desk with soft lighting, modern and upbeat, vertical UGC selfie style";
  if (lower.includes("side hustle") || lower.includes("business")) return "a relatable young entrepreneur in a simple workspace, direct and energetic, vertical UGC selfie style";
  return "a relatable short-form creator speaking directly to camera, natural lighting, high-retention vertical UGC style";
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
      const videoUrl = data.final_output?.video_url || data.output?.video_url || data.artifacts?.find?.((a) => String(a.url || "").includes(".mp4"))?.url;
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
  const mode = process.env.AGENT_MEDIA_MODE || "ugc-only";
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
