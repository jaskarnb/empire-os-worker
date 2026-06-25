import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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

  return sceneTexts.slice(0, 7).map((text) => cleanText(text, 90));
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

async function renderFrame({ frameScript, output, text, niche, style }) {
  await execFileAsync("python3", [
    frameScript,
    JSON.stringify({ hook: text, output, niche, style }),
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

async function encodeVideo({ framePaths, audioPath, videoPath, duration }) {
  const sceneDuration = Math.max(2.2, duration / framePaths.length);
  const sceneFrames = Math.max(1, Math.round(sceneDuration * FPS));
  const args = ["-y"];

  for (const framePath of framePaths) {
    args.push("-loop", "1", "-t", String(sceneDuration), "-i", framePath);
  }
  args.push("-i", audioPath);

  const filters = framePaths.map((_, index) => {
    const zoomExpr = index % 2 === 0
      ? "min(zoom+0.0015\\,1.08)"
      : "max(zoom-0.0010\\,1.00)";
    const panX = index % 2 === 0 ? "iw/2-(iw/zoom/2)" : "iw/2-(iw/zoom/2)+sin(on/20)*20";
    const panY = index % 2 === 0 ? "ih/2-(ih/zoom/2)+sin(on/18)*18" : "ih/2-(ih/zoom/2)";
    return `[${index}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},zoompan=z='${zoomExpr}':x='${panX}':y='${panY}':d=${sceneFrames}:s=${WIDTH}x${HEIGHT}:fps=${FPS},trim=duration=${sceneDuration.toFixed(3)},setpts=PTS-STARTPTS[v${index}]`;
  });
  filters.push(`${framePaths.map((_, index) => `[v${index}]`).join("")}concat=n=${framePaths.length}:v=1:a=0[vout]`);

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
  const videoDir = process.env.VIDEO_DIR || "./output/video";
  const audioDir = process.env.AUDIO_DIR || "./output/audio";

  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const audioPath = path.resolve(audioDir, `${id}.mp3`);
  const videoPath = path.resolve(videoDir, `${id}.mp4`);
  const frameScript = path.resolve(__dirname, "generateFrame.py");
  const framePaths = [];

  try {
    const safeScript = cleanText(script || hook, 1200);
    if (!safeScript) throw new Error("No script text supplied");

    await renderAudio({ audioPath, script: safeScript, style, voice });
    const duration = await audioDuration(audioPath);
    console.log(`[VideoGen] Duration: ${duration}s`);

    const sceneTexts = splitScriptIntoScenes(safeScript, hook);
    for (let i = 0; i < sceneTexts.length; i++) {
      const framePath = path.resolve(videoDir, `${id}_scene_${String(i + 1).padStart(2, "0")}.png`);
      framePaths.push(framePath);
      await renderFrame({ frameScript, output: framePath, text: sceneTexts[i], niche, style });
    }

    await encodeVideo({ framePaths, audioPath, videoPath, duration });
    const validation = await assertRenderableVideo(videoPath, { minDuration: 8, requireAudio: true, requireVertical: true });
    console.log(`[VideoGen] OK ${videoPath} (${validation.width}x${validation.height}, ${validation.duration.toFixed(1)}s)`);
    return videoPath;
  } finally {
    for (const file of [audioPath, ...framePaths]) {
      try { fs.unlinkSync(file); } catch {}
    }
  }
}
