import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateHiggsfieldVideo, isHiggsfieldConfigured } from "./higgsfield.js";
import { assertRenderableVideo } from "./renderGuard.js";
import { assertSpendAllowed, recordRenderSpend } from "./opsState.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;
const HORROR_TERMS = ["horror", "scary", "creepy", "paranormal", "haunting", "true crime", "cold case", "murder", "mystery", "missing", "urban legend"];

function pythonCommand() {
  return process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
}

function resolveStyle({ niche = "", style = "auto" } = {}) {
  const requested = String(style || "auto").toLowerCase().trim();
  if (requested && requested !== "auto") return requested;
  const lower = niche.toLowerCase();
  if (HORROR_TERMS.some((term) => lower.includes(term))) return "horror";
  if (["beauty", "skincare", "makeup", "glow", "glam", "cosmetic", "serum", "foundation"].some((term) => lower.includes(term))) return "beauty";
  if (["meme", "brainrot", "gen z", "skibidi", "ohio", "rizz", "npc"].some((term) => lower.includes(term))) return "brainrot";
  if (["kids", "children", "toddler", "nursery", "roblox", "minecraft"].some((term) => lower.includes(term))) return "kids";
  if (["ai", "productivity", "automation", "finance", "money", "business", "side hustle", "tools", "students", "creator"].some((term) => lower.includes(term))) return "faceless-reels";
  return "dark";
}

function cleanText(value, maxLength = 1200) {
  return String(value || "")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function splitScriptIntoScenes(script, hook) {
  const safeHook = cleanText(hook, 90) || "Watch this";
  const sentences = cleanText(script, 1500)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const sceneTexts = [safeHook];
  let bucket = "";
  for (const sentence of sentences) {
    const next = bucket ? `${bucket} ${sentence}` : sentence;
    if (next.length > 56 && bucket) {
      sceneTexts.push(bucket);
      bucket = sentence;
    } else {
      bucket = next;
    }
    if (sceneTexts.length >= 11) break;
  }
  if (bucket && sceneTexts.length < 12) sceneTexts.push(bucket);

  return sceneTexts.slice(0, 12).map((text) => cleanText(text, 110));
}

function wordsOf(text) {
  return cleanText(text, 3000).split(/\s+/).filter(Boolean);
}

function assTime(seconds) {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe - Math.floor(safe)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function assEscape(text) {
  return cleanText(text, 220)
    .replace(/[{}]/g, "")
    .replace(/\n/g, "\\N");
}

function captionChunks(script, style = "dark") {
  const words = wordsOf(script);
  const chunks = [];
  const size = style === "brainrot" ? 3 : style === "horror" || style === "faceless-reels" ? 4 : 4;
  for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size).join(" "));
  }
  return chunks;
}

function writeSubtitleFile({ subtitlePath, script, duration, style }) {
  const chunks = captionChunks(script, style);
  const totalWords = Math.max(1, wordsOf(script).length);
  let cursorWords = 0;
  const events = chunks.map((chunk) => {
    const wordCount = wordsOf(chunk).length;
    const start = (cursorWords / totalWords) * duration;
    cursorWords += wordCount;
    const end = Math.min(duration, Math.max(start + 0.72, (cursorWords / totalWords) * duration));
    return `Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,${assEscape(chunk).toUpperCase()}`;
  });

  const fontSize = style === "horror" ? 66 : style === "brainrot" ? 82 : style === "kids" ? 76 : style === "faceless-reels" ? 76 : 72;
  const primary = style === "horror" ? "&H00F5F5EB" : style === "kids" ? "&H00FFFFFF" : "&H00FFFFFF";
  const outline = style === "horror" ? "&H00000000" : "&H00101010";
  const shadow = style === "horror" ? 0 : 2;
  const marginV = style === "horror" ? 230 : style === "kids" ? 185 : 205;

  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${WIDTH}
PlayResY: ${HEIGHT}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial,${fontSize},${primary},&H00FFFFFF,${outline},&H99000000,1,0,0,0,100,100,0,0,1,7,${shadow},2,80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
  fs.writeFileSync(subtitlePath, ass);
}

function sceneDurations(sceneTexts, totalDuration) {
  const weights = sceneTexts.map((text) => Math.max(5, wordsOf(text).length));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  return weights.map((weight) => Math.max(1.15, (weight / totalWeight) * totalDuration));
}

async function audioDuration(audioPath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet",
    "-of", "csv=p=0",
    "-show_entries", "format=duration",
    audioPath,
  ], { timeout: 30_000 });
  return Math.min(Math.max(Math.ceil(parseFloat(stdout.trim()) || 30), 8), 58);
}

async function videoDuration(videoPath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet",
    "-of", "csv=p=0",
    "-show_entries", "format=duration",
    videoPath,
  ], { timeout: 30_000 });
  return Math.min(Math.max(parseFloat(stdout.trim()) || 30, 8), 59);
}

async function renderFrame({ frameScript, output, text, niche, style, sceneIndex, totalScenes, motionPhase = 0 }) {
  await execFileAsync(pythonCommand(), [
    frameScript,
    JSON.stringify({ hook: text, output, niche, style, sceneIndex, totalScenes, motionPhase }),
  ], { timeout: 30_000 });
}

function voiceProfile({ style, voice }) {
  const profiles = {
    dark: {
      label: "clear creator",
      voice: process.env.DARK_TTS_VOICE || "en-US-AriaNeural",
      rate: process.env.DARK_TTS_RATE || "+0%",
    },
    horror: {
      label: "slow suspense",
      voice: process.env.HORROR_TTS_VOICE || "en-US-GuyNeural",
      rate: process.env.HORROR_TTS_RATE || "-12%",
    },
    brainrot: {
      label: "fast high-energy",
      voice: process.env.BRAINROT_TTS_VOICE || "en-US-JennyNeural",
      rate: process.env.BRAINROT_TTS_RATE || "+15%",
    },
    kids: {
      label: "cheerful kids",
      voice: process.env.KIDS_TTS_VOICE || "en-US-AnaNeural",
      rate: process.env.KIDS_TTS_RATE || "-8%",
    },
    beauty: {
      label: "confident beauty creator",
      voice: process.env.BEAUTY_TTS_VOICE || "en-US-AriaNeural",
      rate: process.env.BEAUTY_TTS_RATE || "+5%",
    },
    "faceless-reels": {
      label: "polished faceless reels narrator",
      voice: process.env.FACELESS_REELS_TTS_VOICE || "en-US-AriaNeural",
      rate: process.env.FACELESS_REELS_TTS_RATE || "+8%",
    },
  };
  const fallback = profiles.dark;
  const profile = profiles[style] || fallback;
  return { ...profile, voice: voice || process.env.DEFAULT_TTS_VOICE || profile.voice };
}

async function renderAudio({ audioPath, script, style, voice }) {
  const profile = voiceProfile({ style, voice });
  const args = ["--voice", profile.voice];
  if (profile.rate && profile.rate !== "+0%") {
    const rate = profile.rate;
    if (rate.startsWith("-")) args.push(`--rate=${rate}`);
    else args.push("--rate", rate);
  }
  args.push("--text", cleanText(script, 1200), "--write-media", audioPath);

  console.log(`[VideoGen] TTS style=${style} profile=${profile.label} voice=${profile.voice}${profile.rate ? ` rate=${profile.rate}` : ""}`);
  await execFileAsync("edge-tts", args, { timeout: 60_000 });
}

function subtitleFilterPath(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/").replace(/'/g, "\\'");
  return normalized.replace(/^([A-Za-z]):\//, "$1\\:/");
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

async function encodeVideo({ framePaths, audioPath, videoPath, duration, durations, subtitlePath, style }) {
  const args = ["-y"];

  for (let i = 0; i < framePaths.length; i++) {
    const framePath = framePaths[i];
    const sceneDuration = durations[i] || Math.max(2.2, duration / framePaths.length);
    args.push("-loop", "1", "-t", String(sceneDuration), "-i", framePath);
  }
  args.push("-i", audioPath);

  const filters = framePaths.map((_, index) => {
    const sceneDuration = durations[index] || Math.max(2.2, duration / framePaths.length);
    const sceneFrames = Math.max(1, Math.round(sceneDuration * FPS));
    const cartoon = style === "kids" || style === "brainrot" || style === "faceless-reels";
    const faster = style === "horror" || style === "brainrot" || style === "kids";
    const zoomExpr = faster
      ? "min(zoom+0.0075\\,1.28)"
      : index % 2 === 0
        ? "min(zoom+0.0048\\,1.21)"
        : "min(1.18\\,1.06+sin(on/13)*0.045)";
    const panX = faster
      ? "iw/2-(iw/zoom/2)+sin(on/5)*74"
      : index % 2 === 0 ? "iw/2-(iw/zoom/2)+sin(on/10)*52" : "iw/2-(iw/zoom/2)-sin(on/12)*48";
    const panY = faster
      ? "ih/2-(ih/zoom/2)+cos(on/6)*64"
      : index % 2 === 0 ? "ih/2-(ih/zoom/2)+cos(on/11)*44" : "ih/2-(ih/zoom/2)+sin(on/10)*46";
    const base = `[${index}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},zoompan=z='${zoomExpr}':x='${panX}':y='${panY}':d=${sceneFrames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
    const extra = cartoon
      ? ",eq=contrast=1.08:saturation=1.18,unsharp=5:5:0.5"
      : "";
    return `${base}${extra},trim=duration=${sceneDuration.toFixed(3)},setpts=PTS-STARTPTS[v${index}]`;
  });
  filters.push(`${framePaths.map((_, index) => `[v${index}]`).join("")}concat=n=${framePaths.length}:v=1:a=0[base]`);
  if (style === "horror") {
    filters.push(`[base]noise=alls=18:allf=t+u,eq=contrast=1.28:brightness=-0.045:saturation=0.65,vignette=PI/4,subtitles='${subtitleFilterPath(subtitlePath)}'[vout]`);
  } else if (style === "brainrot") {
    filters.push(`[base]eq=contrast=1.24:saturation=1.55,unsharp=5:5:0.95,subtitles='${subtitleFilterPath(subtitlePath)}'[vout]`);
  } else if (style === "kids") {
    filters.push(`[base]eq=contrast=1.12:saturation=1.28,unsharp=5:5:0.65,subtitles='${subtitleFilterPath(subtitlePath)}'[vout]`);
  } else if (style === "faceless-reels") {
    filters.push(`[base]eq=contrast=1.12:saturation=1.2,unsharp=5:5:0.65,subtitles='${subtitleFilterPath(subtitlePath)}'[vout]`);
  } else {
    filters.push(`[base]subtitles='${subtitleFilterPath(subtitlePath)}'[vout]`);
  }

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[vout]",
    "-map", `${framePaths.length}:a`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "24",
    "-c:a", "aac",
    "-b:a", "128k",
    "-pix_fmt", "yuv420p",
    "-shortest",
    videoPath,
  );

  console.log(`[VideoGen] Encoding ${framePaths.length}-scene MP4...`);
  await execFileAsync("ffmpeg", args, { timeout: 180_000, maxBuffer: 20 * 1024 * 1024 });
}

async function renderHiggsfieldFinalVideo({ sourcePath, safeScript, resolvedStyle, voice }) {
  if (isRemoteUrl(sourcePath)) {
    console.warn("[VideoGen] Higgsfield returned a remote URL; caption/TTS polish requires a local stitched MP4.");
    return sourcePath;
  }

  const videoDir = process.env.VIDEO_DIR || "./output/video";
  const audioDir = process.env.AUDIO_DIR || "./output/audio";
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const audioPath = path.resolve(audioDir, `${id}_voice.mp3`);
  const subtitlePath = path.resolve(videoDir, `${id}_captions.ass`);
  const outputPath = path.resolve(videoDir, `${id}_higgsfield_captioned.mp4`);

  try {
    const duration = await videoDuration(sourcePath);
    await renderAudio({ audioPath, script: safeScript, style: resolvedStyle, voice });
    writeSubtitleFile({ subtitlePath, script: safeScript, duration, style: resolvedStyle });

    const captionFilter = `subtitles='${subtitleFilterPath(subtitlePath)}'`;
    const videoFilter = resolvedStyle === "horror"
      ? `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},noise=alls=10:allf=t+u,eq=contrast=1.18:brightness=-0.025:saturation=0.82,vignette=PI/5,${captionFilter}[v]`
      : resolvedStyle === "brainrot"
        ? `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},eq=contrast=1.12:saturation=1.24,unsharp=5:5:0.55,${captionFilter}[v]`
        : `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},${captionFilter}[v]`;

    await execFileAsync("ffmpeg", [
      "-y",
      "-i", sourcePath,
      "-i", audioPath,
      "-filter_complex", `[0:v]${videoFilter};[1:a]apad[a]`,
      "-map", "[v]",
      "-map", "[a]",
      "-t", duration.toFixed(3),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "21",
      "-c:a", "aac",
      "-b:a", "128k",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outputPath,
    ], { timeout: 240_000, maxBuffer: 20 * 1024 * 1024 });

    const validation = await assertRenderableVideo(outputPath, { minDuration: 20, requireAudio: true, requireVertical: true });
    console.log(`[VideoGen] Captioned Higgsfield final OK ${outputPath} (${validation.duration.toFixed(1)}s)`);
    try { fs.unlinkSync(sourcePath); } catch {}
    return outputPath;
  } finally {
    for (const file of [audioPath, subtitlePath]) {
      try { fs.unlinkSync(file); } catch {}
    }
  }
}

function allowLocalDebug(allowLocalFallback = false) {
  return allowLocalFallback || process.env.HIGGSFIELD_ALLOW_LOCAL_DEBUG === "true";
}

async function renderLocalDebugVideo({ safeScript, hook, niche, resolvedStyle, voice }) {
  console.warn("[VideoGen] Using local debug renderer. This path is not allowed for production posting.");
  const videoDir = process.env.VIDEO_DIR || "./output/video";
  const audioDir = process.env.AUDIO_DIR || "./output/audio";

  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const audioPath = path.resolve(audioDir, `${id}.mp3`);
  const videoPath = path.resolve(videoDir, `${id}.mp4`);
  const subtitlePath = path.resolve(videoDir, `${id}.ass`);
  const frameScript = path.resolve(__dirname, "generateFrame.py");
  const framePaths = [];

  try {
    await renderAudio({ audioPath, script: safeScript, style: resolvedStyle, voice });
    const duration = await audioDuration(audioPath);
    console.log(`[VideoGen] Duration: ${duration}s style=${resolvedStyle}`);

    const sceneTexts = splitScriptIntoScenes(safeScript, hook);
    const baseDurations = sceneDurations(sceneTexts, duration);
    const durations = [];
    writeSubtitleFile({ subtitlePath, script: safeScript, duration, style: resolvedStyle });
    for (let i = 0; i < sceneTexts.length; i++) {
      const cels = Math.min(3, Math.max(2, Number(process.env.CARTOON_CELS_PER_SCENE || 2)));
      const celDuration = baseDurations[i] / cels;
      for (let cel = 0; cel < cels; cel++) {
        const framePath = path.resolve(videoDir, `${id}_scene_${String(i + 1).padStart(2, "0")}_${String(cel + 1).padStart(2, "0")}.png`);
        framePaths.push(framePath);
        durations.push(celDuration);
        await renderFrame({
          frameScript,
          output: framePath,
          text: sceneTexts[i],
          niche,
          style: resolvedStyle,
          sceneIndex: i + 1,
          totalScenes: sceneTexts.length,
          motionPhase: cels <= 1 ? 0 : cel / (cels - 1),
        });
      }
    }

    await encodeVideo({ framePaths, audioPath, videoPath, duration, durations, subtitlePath, style: resolvedStyle });
    const validation = await assertRenderableVideo(videoPath, { minDuration: 8, requireAudio: true, requireVertical: true });
    recordRenderSpend({ source: "local-debug", estimatedCost: Number(process.env.LOCAL_RENDER_COST_USD || 0.02), videoPath });
    console.log(`[VideoGen] OK ${videoPath} (${validation.width}x${validation.height}, ${validation.duration.toFixed(1)}s)`);
    return videoPath;
  } finally {
    for (const file of [audioPath, subtitlePath, ...framePaths]) {
      try { fs.unlinkSync(file); } catch {}
    }
  }
}

export async function generateVideo({ script, hook, niche = "", style = "auto", voice, allowLocalFallback = false } = {}) {
  const safeScript = cleanText(script || hook, 1200);
  if (!safeScript) throw new Error("No script text supplied");
  const resolvedStyle = resolveStyle({ niche, style });

  // Stock footage pipeline for faceless reel-style videos, horror, kids, and beauty.
  // Takes priority over Higgsfield when PEXELS_API_KEY is configured
  if (["horror", "kids", "beauty", "faceless-reels"].includes(resolvedStyle) && process.env.PEXELS_API_KEY) {
    const { generateStockFootageVideo } = await import("./stockVideoGen.js");
    return generateStockFootageVideo({ script: safeScript, hook, niche, style: resolvedStyle, voice });
  }

  if (isHiggsfieldConfigured()) {
    const estimatedCost = Number(process.env.HIGGSFIELD_RENDER_COST_USD || 0.35);
    assertSpendAllowed(estimatedCost);
    try {
      const higgsfieldPath = await generateHiggsfieldVideo({ script: safeScript, hook, niche, style: resolvedStyle });
      const finalPath = await renderHiggsfieldFinalVideo({ sourcePath: higgsfieldPath, safeScript, resolvedStyle, voice });
      recordRenderSpend({ source: "higgsfield", estimatedCost, videoPath: finalPath });
      return finalPath;
    } catch (error) {
      if (!allowLocalDebug(allowLocalFallback)) throw error;
      console.warn(`[VideoGen] Higgsfield failed (${error.message}); using allowed local fallback renderer.`);
    }
  }

  if (allowLocalDebug(allowLocalFallback)) {
    return renderLocalDebugVideo({ safeScript, hook, niche, resolvedStyle, voice });
  }

  throw new Error("Higgsfield is required for production video generation. Configure HIGGSFIELD_ENABLED=true and Higgsfield CLI auth, or run with allowLocalFallback=true for debug only.");
}
