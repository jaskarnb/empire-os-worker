import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateAgentMediaVideo, shouldUseAgentMedia } from "./agentMedia.js";
import { assertRenderableVideo } from "./renderGuard.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

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
    if (next.length > 92 && bucket) {
      sceneTexts.push(bucket);
      bucket = sentence;
    } else {
      bucket = next;
    }
    if (sceneTexts.length >= 6) break;
  }
  if (bucket && sceneTexts.length < 7) sceneTexts.push(bucket);

  return sceneTexts.slice(0, 7).map((text) => cleanText(text, 150));
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

function captionChunks(script) {
  const words = wordsOf(script);
  const chunks = [];
  for (let i = 0; i < words.length; i += 8) {
    chunks.push(words.slice(i, i + 8).join(" "));
  }
  return chunks;
}

function writeSubtitleFile({ subtitlePath, script, duration }) {
  const chunks = captionChunks(script);
  const totalWords = Math.max(1, wordsOf(script).length);
  let cursorWords = 0;
  const events = chunks.map((chunk) => {
    const wordCount = wordsOf(chunk).length;
    const start = (cursorWords / totalWords) * duration;
    cursorWords += wordCount;
    const end = Math.min(duration, Math.max(start + 1.1, (cursorWords / totalWords) * duration));
    return `Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,${assEscape(chunk).toUpperCase()}`;
  });

  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${WIDTH}
PlayResY: ${HEIGHT}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial,70,&H00FFFFFF,&H00FFFFFF,&H00101010,&H99000000,1,0,0,0,100,100,0,0,1,6,2,2,80,80,210,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
  fs.writeFileSync(subtitlePath, ass);
}

function sceneDurations(sceneTexts, totalDuration) {
  const weights = sceneTexts.map((text) => Math.max(5, wordsOf(text).length));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  return weights.map((weight) => Math.max(2.2, (weight / totalWeight) * totalDuration));
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

async function renderFrame({ frameScript, output, text, niche, style, sceneIndex, totalScenes }) {
  await execFileAsync("python3", [
    frameScript,
    JSON.stringify({ hook: text, output, niche, style, sceneIndex, totalScenes }),
  ], { timeout: 30_000 });
}

async function renderAudio({ audioPath, script, style, voice }) {
  const styleVoiceMap = {
    dark: "en-US-AriaNeural",
    brainrot: "en-US-JennyNeural",
    kids: "en-US-AnaNeural",
  };
  const styleRateMap = {
    brainrot: "+15%",
    kids: "-10%",
  };

  const ttsVoice = voice || process.env.DEFAULT_TTS_VOICE || styleVoiceMap[style] || "en-US-AriaNeural";
  const args = ["--voice", ttsVoice];
  if (styleRateMap[style]) args.push("--rate", styleRateMap[style]);
  args.push("--text", cleanText(script, 1200), "--write-media", audioPath);

  console.log(`[VideoGen] TTS voice=${ttsVoice} style=${style}${styleRateMap[style] ? ` rate=${styleRateMap[style]}` : ""}`);
  await execFileAsync("edge-tts", args, { timeout: 60_000 });
}

function subtitleFilterPath(filePath) {
  return String(filePath).replace(/\\/g, "/").replace(/'/g, "\\'");
}

async function encodeVideo({ framePaths, audioPath, videoPath, duration, durations, subtitlePath }) {
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
    const zoomExpr = index % 2 === 0
      ? "min(zoom+0.0022\\,1.13)"
      : "min(1.10\\,1.04+sin(on/24)*0.025)";
    const panX = index % 2 === 0 ? "iw/2-(iw/zoom/2)+sin(on/18)*28" : "iw/2-(iw/zoom/2)-sin(on/22)*24";
    const panY = index % 2 === 0 ? "ih/2-(ih/zoom/2)+cos(on/20)*22" : "ih/2-(ih/zoom/2)+sin(on/19)*26";
    return `[${index}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},zoompan=z='${zoomExpr}':x='${panX}':y='${panY}':d=${sceneFrames}:s=${WIDTH}x${HEIGHT}:fps=${FPS},trim=duration=${sceneDuration.toFixed(3)},setpts=PTS-STARTPTS[v${index}]`;
  });
  filters.push(`${framePaths.map((_, index) => `[v${index}]`).join("")}concat=n=${framePaths.length}:v=1:a=0[base]`);
  filters.push(`[base]subtitles='${subtitleFilterPath(subtitlePath)}'[vout]`);

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

export async function generateVideo({ script, hook, niche = "", style = "dark", voice }) {
  const safeScript = cleanText(script || hook, 1200);
  if (!safeScript) throw new Error("No script text supplied");

  if (shouldUseAgentMedia({ niche, style })) {
    try {
      return await generateAgentMediaVideo({ script: safeScript, hook, niche, style });
    } catch (error) {
      console.error(`[AgentMedia] Failed: ${error.message}`);
      if (process.env.AGENT_MEDIA_REQUIRED === "true") throw error;
      console.warn("[AgentMedia] Falling back to local renderer.");
    }
  }

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
    await renderAudio({ audioPath, script: safeScript, style, voice });
    const duration = await audioDuration(audioPath);
    console.log(`[VideoGen] Duration: ${duration}s`);

    const sceneTexts = splitScriptIntoScenes(safeScript, hook);
    const durations = sceneDurations(sceneTexts, duration);
    writeSubtitleFile({ subtitlePath, script: safeScript, duration });
    for (let i = 0; i < sceneTexts.length; i++) {
      const framePath = path.resolve(videoDir, `${id}_scene_${String(i + 1).padStart(2, "0")}.png`);
      framePaths.push(framePath);
      await renderFrame({ frameScript, output: framePath, text: sceneTexts[i], niche, style, sceneIndex: i + 1, totalScenes: sceneTexts.length });
    }

    await encodeVideo({ framePaths, audioPath, videoPath, duration, durations, subtitlePath });
    const validation = await assertRenderableVideo(videoPath, { minDuration: 8, requireAudio: true, requireVertical: true });
    console.log(`[VideoGen] OK ${videoPath} (${validation.width}x${validation.height}, ${validation.duration.toFixed(1)}s)`);
    return videoPath;
  } finally {
    for (const file of [audioPath, subtitlePath, ...framePaths]) {
      try { fs.unlinkSync(file); } catch {}
    }
  }
}
