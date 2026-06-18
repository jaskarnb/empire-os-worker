/**
 * Empire OS — Video Generator
 * Pipeline: edge-tts (voiceover) → Python/Pillow (frame) → ffmpeg (MP4)
 * Output: 1080x1920 vertical MP4 (9:16) for TikTok / YouTube Shorts
 */
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function generateVideo({ script, hook, niche = "" }) {
  const videoDir = process.env.VIDEO_DIR || "./output/video";
  const audioDir = process.env.AUDIO_DIR || "./output/audio";

  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const audioPath = path.resolve(audioDir, `${id}.mp3`);
  const framePath = path.resolve(videoDir, `${id}_frame.png`);
  const videoPath = path.resolve(videoDir, `${id}.mp4`);

  // 1. Voiceover
  const voice = process.env.DEFAULT_TTS_VOICE || "en-US-AriaNeural";
  const safeScript = script
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/"/g, '\\"')
    .slice(0, 1200);

  console.log(`[VideoGen] TTS (${voice})…`);
  await execAsync(`edge-tts --voice "${voice}" --text "${safeScript}" --write-media "${audioPath}"`, { timeout: 60_000 });

  // 2. Duration
  const { stdout: durOut } = await execAsync(`ffprobe -v quiet -of csv=p=0 -show_entries format=duration "${audioPath}"`);
  const duration = Math.min(Math.ceil(parseFloat(durOut.trim()) || 45), 58);
  console.log(`[VideoGen] Duration: ${duration}s`);

  // 3. Background frame
  const frameScript = path.resolve(__dirname, "generateFrame.py");
  const frameArgs = JSON.stringify({ hook: hook.slice(0, 80), output: framePath, niche }).replace(/'/g, "'\\''");
  console.log(`[VideoGen] Rendering frame…`);
  await execAsync(`python3 "${frameScript}" '${frameArgs}'`, { timeout: 30_000 });

  // 4. Encode MP4
  console.log(`[VideoGen] Encoding…`);
  await execAsync(
    [`ffmpeg -y`, `-loop 1 -i "${framePath}"`, `-i "${audioPath}"`,
     "-c:v libx264 -preset ultrafast -tune stillimage -crf 28",
     `-c:a aac -b:a 128k -t ${duration}`,
     "-pix_fmt yuv420p",
     `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black"`,
     `"${videoPath}"`].join(" "),
    { timeout: 180_000 }
  );

  for (const f of [audioPath, framePath]) { try { fs.unlinkSync(f); } catch {} }

  console.log(`[VideoGen] ✓ ${videoPath}`);
  return videoPath;
}
