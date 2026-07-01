import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function cliPath() {
  return process.env.HIGGSFIELD_CLI_PATH || "higgsfield";
}

function enabled() {
  return process.env.HIGGSFIELD_ENABLED === "true";
}

export function isHiggsfieldConfigured() {
  return enabled();
}

function extractWorkspaceId(output) {
  const text = String(output || "").trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.workspaces)
        ? parsed.workspaces
        : Array.isArray(parsed.data)
          ? parsed.data
          : Array.isArray(parsed.items)
            ? parsed.items
            : [parsed];
    const workspace = items.find((item) => item && (item.id || item.workspace_id || item.workspaceId || item.slug));
    return workspace?.id || workspace?.workspace_id || workspace?.workspaceId || workspace?.slug || null;
  } catch {}

  const uuid = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0];

  const idLine = text.match(/(?:id|workspace)[\s:=]+([A-Za-z0-9_-]{6,})/i);
  return idLine?.[1] || null;
}

async function listDefaultWorkspaceId() {
  const { stdout, stderr } = await execFileAsync(cliPath(), ["workspace", "list", "--json", "--no-color"], {
    timeout: Number(process.env.HIGGSFIELD_WORKSPACE_TIMEOUT_MS || 30_000),
    maxBuffer: 4 * 1024 * 1024,
  });
  const workspaceId = extractWorkspaceId([stdout, stderr].filter(Boolean).join("\n"));
  if (!workspaceId) {
    throw new Error("Higgsfield workspace list did not return a usable workspace id.");
  }
  return workspaceId;
}

async function ensureWorkspaceSelected() {
  const workspaceId = process.env.HIGGSFIELD_WORKSPACE_ID || process.env.HF_WORKSPACE_ID || await listDefaultWorkspaceId();
  await execFileAsync(cliPath(), ["workspace", "set", workspaceId], {
    timeout: Number(process.env.HIGGSFIELD_WORKSPACE_TIMEOUT_MS || 30_000),
    maxBuffer: 1024 * 1024,
  });
}

function cleanText(value, maxLength = 1800) {
  return String(value || "")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function voiceDirection(style) {
  if (style === "horror") return "Voice/sound direction: low suspense voice or minimal whisper, slow pacing, eerie silence, tense sound design, sharp scare hit, no goofy delivery.";
  if (style === "kids") return "Voice/sound direction: cheerful friendly voice, simple words, bright music, warm pacing, never scary or harsh.";
  if (style === "brainrot") return "Voice/sound direction: fast energetic meme delivery, punchy captions, quick sound hits, funny chaotic rhythm, no dead air.";
  return "Voice/sound direction: clear creator narration, confident pacing, clean social-video sound design.";
}

function stylePrompt({ script, hook, niche, style, durationSeconds, segmentIndex = 1, totalSegments = 1 }) {
  const segmentMode = totalSegments > 1;
  const base = [
    "Create a vertical 9:16 short-form video with real cinematic motion.",
    segmentMode
      ? `This is segment ${segmentIndex} of ${totalSegments}. Target runtime: about ${durationSeconds} seconds for this segment.`
      : `Target runtime: about ${durationSeconds} seconds.`,
    segmentMode
      ? "This segment must feel like part of one continuous story that can be stitched with the other segments."
      : "The video needs enough time for setup, movement, payoff, and a final beat.",
    "It must be a generated video, not a slideshow and not a static image.",
    "The video must follow the script beat-by-beat: each major sentence should have a matching visual moment.",
    "Keep visual continuity so the scene feels coherent, not random unrelated clips.",
    "Use strong pacing, visual continuity, and retention-focused camera movement.",
    "Prioritize high-quality lighting, clear subjects, stable composition, smooth motion, and polished social-ready framing.",
    "No copyrighted characters, no copied creator footage, no logos.",
  ];

  const styleLines = {
    horror: [
      "Realistic caught-on-camera footage.",
      "Handheld phone camera moving through a dark hallway or backyard at night.",
      "Build dread with small visual clues, distant movement, uneasy silence, and a clear camera path that matches the script.",
      segmentMode && segmentIndex < totalSegments
        ? "End this segment on rising tension, not a full ending."
        : "End with a strong platform-safe jump scare and a short unsettling aftermath beat.",
      "Cinematic tension build. Found footage aesthetic. No CGI monsters.",
      "No graphic gore. Scary atmosphere, rising dread, clear payoff.",
      "Genre: horror. Sound on. Sharp scare beat, but keep it platform-safe.",
    ].filter(Boolean),
    brainrot: [
      "Style: fast chaotic viral meme video with exaggerated motion and quick visual punchlines.",
      "Every visual joke must connect to the script, with readable punchy captions and quick transitions.",
      "Bright, high-energy, funny, safe for teen audiences.",
    ],
    kids: [
      "Style: cheerful, colorful, safe kids video with friendly motion and simple happy visuals.",
      "Every scene should clearly show what the script says, using cute characters, bright colors, and easy-to-understand actions.",
      "No scary images, no danger, no inappropriate content.",
    ],
    dark: [
      "Style: polished social media explainer with cinematic b-roll, smooth motion, and bold visual hooks.",
      "Use visuals that directly support each sentence, with clean captions and no random filler shots.",
    ],
  };

  return cleanText([
    ...base,
    ...(styleLines[style] || styleLines.dark),
    voiceDirection(style),
    `Niche: ${cleanText(niche, 220)}`,
    `Opening hook: ${cleanText(hook, 120)}`,
    `Voiceover/script: ${cleanText(script, 1400)}`,
    "Quality requirement: premium-looking video, coherent scene progression, script-matched visuals, appropriate voice/sound, readable captions if captions are present, and no random words or disconnected visuals.",
    "Output: vertical, social-ready, fully animated/generated video with enough motion to hold attention.",
  ].join("\n"));
}

function pushParam(args, flagName, value) {
  if (value === undefined || value === null || value === "") return;
  args.push(`--${flagName}`, String(value));
}

function envValue(name, fallback = "") {
  return Object.prototype.hasOwnProperty.call(process.env, name) ? process.env[name] : fallback;
}

function requestedDurationValue() {
  const parsed = Number(envValue("HIGGSFIELD_DURATION", "30"));
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(59, Math.max(20, Math.floor(parsed)));
}

function includeResolutionParam() {
  return envValue("HIGGSFIELD_INCLUDE_RESOLUTION", "") === "true";
}

function selectedModel() {
  const configured = envValue("HIGGSFIELD_VIDEO_MODEL", "wan2_7");
  if (!configured || configured === "cinematic_studio_video_v2") return "wan2_7";
  return configured;
}

function modelMaxDuration(model) {
  if (/^wan2_/i.test(model)) return 15;
  if (model === "cinematic_studio_video_v2") return 12;
  return 15;
}

function modelParams(style, model, durationSeconds) {
  const horror = style === "horror";
  const wanModel = /^wan2_/i.test(model);

  return {
    aspectRatioFlag: envValue("HIGGSFIELD_ASPECT_RATIO_PARAM", "aspect_ratio"),
    aspectRatio: envValue("HIGGSFIELD_ASPECT_RATIO", "9:16"),
    duration: String(Math.min(modelMaxDuration(model), Math.max(1, Math.floor(durationSeconds)))),
    genre: wanModel ? "" : envValue("HIGGSFIELD_GENRE", horror ? "horror" : ""),
    mode: wanModel ? "" : envValue("HIGGSFIELD_MODE", "pro"),
    sound: wanModel ? "" : envValue("HIGGSFIELD_SOUND", "on"),
    resolution: includeResolutionParam() ? envValue("HIGGSFIELD_RESOLUTION", "720p") : "",
  };
}

function extractVideoUrl(output) {
  const text = String(output || "");
  const urls = text.match(/https?:\/\/[^\s"'<>]+/g) || [];
  const videoUrl = urls.find((url) => /\.(mp4|mov|webm)(\?|$)/i.test(url)) || urls.find((url) => /video|asset|download|cdn/i.test(url));
  if (videoUrl) return videoUrl;

  try {
    const parsed = JSON.parse(text);
    const candidates = [
      parsed.url,
      parsed.videoUrl,
      parsed.video_url,
      parsed.output,
      parsed.result,
      parsed.assetUrl,
      parsed.asset_url,
      ...(Array.isArray(parsed.urls) ? parsed.urls : []),
      ...(Array.isArray(parsed.outputs) ? parsed.urls : []),
      ...(Array.isArray(parsed.results) ? parsed.results : []),
    ].flat().filter(Boolean);
    const found = candidates.find((value) => /^https?:\/\//i.test(String(value)));
    if (found) return String(found);
  } catch {}

  throw new Error(`Higgsfield did not return a video URL: ${text.slice(0, 500)}`);
}

function splitScriptForSegments(script, totalSegments) {
  const sentences = cleanText(script, 1800).split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < totalSegments) return Array.from({ length: totalSegments }, () => cleanText(script, 1400));

  const buckets = Array.from({ length: totalSegments }, () => []);
  sentences.forEach((sentence, index) => buckets[index % totalSegments].push(sentence));
  return buckets.map((items) => cleanText(items.join(" "), 1400));
}

async function generateSingleHiggsfieldVideo({ script, hook, niche, style, model, durationSeconds, segmentIndex = 1, totalSegments = 1 }) {
  const prompt = stylePrompt({ script, hook, niche, style, durationSeconds, segmentIndex, totalSegments });
  const params = modelParams(style, model, durationSeconds);

  const args = [
    "generate",
    "create",
    model,
    "--prompt",
    prompt,
    "--wait",
    "--wait-timeout",
    process.env.HIGGSFIELD_WAIT_TIMEOUT || "20m",
    "--wait-interval",
    process.env.HIGGSFIELD_WAIT_INTERVAL || "5s",
    "--json",
    "--no-color",
  ];

  pushParam(args, params.aspectRatioFlag, params.aspectRatio);
  pushParam(args, "duration", params.duration);
  pushParam(args, "genre", params.genre);
  pushParam(args, "mode", params.mode);
  pushParam(args, "sound", params.sound);
  pushParam(args, "resolution", params.resolution);

  console.log(`[Higgsfield] Generating ${style} segment ${segmentIndex}/${totalSegments} with ${model}...`);
  await ensureWorkspaceSelected();
  const { stdout, stderr } = await execFileAsync(cliPath(), args, {
    timeout: Number(process.env.HIGGSFIELD_TIMEOUT_MS || 25 * 60 * 1000),
    maxBuffer: 20 * 1024 * 1024,
  });
  return extractVideoUrl([stdout, stderr].filter(Boolean).join("\n"));
}

async function downloadVideo(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Higgsfield video download failed ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 100_000) throw new Error(`Higgsfield video download was too small (${buffer.length} bytes)`);
  fs.writeFileSync(outputPath, buffer);
}

function concatFileLine(filePath) {
  return `file '${String(filePath).replace(/'/g, "'\\''")}'`;
}

async function stitchVideos(segmentPaths, outputPath) {
  const listPath = outputPath.replace(/\.mp4$/i, ".txt");
  fs.writeFileSync(listPath, segmentPaths.map(concatFileLine).join("\n"));
  try {
    await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath], {
      timeout: 180_000,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch {
    await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", outputPath], {
      timeout: 240_000,
      maxBuffer: 20 * 1024 * 1024,
    });
  } finally {
    try { fs.unlinkSync(listPath); } catch {}
  }
}

export async function generateHiggsfieldVideo({ script, hook, niche = "", style = "dark" }) {
  if (!enabled()) throw new Error("HIGGSFIELD_ENABLED is not true");

  const model = selectedModel();
  const targetDuration = requestedDurationValue();
  const maxDuration = modelMaxDuration(model);
  const totalSegments = Math.min(Number(process.env.HIGGSFIELD_MAX_STITCH_SEGMENTS || 4), Math.ceil(targetDuration / maxDuration));

  if (totalSegments <= 1) {
    const videoUrl = await generateSingleHiggsfieldVideo({ script, hook, niche, style, model, durationSeconds: targetDuration });
    console.log(`[Higgsfield] Video ready: ${videoUrl}`);
    return videoUrl;
  }

  const videoDir = path.resolve(process.env.VIDEO_DIR || "./output/video");
  fs.mkdirSync(videoDir, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const segmentScripts = splitScriptForSegments(script, totalSegments);
  const segmentPaths = [];

  try {
    for (let i = 0; i < totalSegments; i++) {
      const segmentUrl = await generateSingleHiggsfieldVideo({
        script: segmentScripts[i] || script,
        hook,
        niche,
        style,
        model,
        durationSeconds: maxDuration,
        segmentIndex: i + 1,
        totalSegments,
      });
      const segmentPath = path.join(videoDir, `${id}_higgsfield_segment_${i + 1}.mp4`);
      await downloadVideo(segmentUrl, segmentPath);
      segmentPaths.push(segmentPath);
    }

    const outputPath = path.join(videoDir, `${id}_higgsfield_stitched.mp4`);
    await stitchVideos(segmentPaths, outputPath);
    console.log(`[Higgsfield] Stitched ${totalSegments} segments into ${outputPath}`);
    return outputPath;
  } finally {
    for (const filePath of segmentPaths) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
}
