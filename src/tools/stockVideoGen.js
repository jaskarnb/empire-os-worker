/**
 * Stock Footage Video Pipeline
 *
 * Pexels API → clip download → FFmpeg assembly → TTS voiceover → ASS captions → MP4
 *
 * Replaces Higgsfield for kids, beauty, horror, and faceless-reels-inspired styles.
 * Requires: PEXELS_API_KEY, edge-tts, ffmpeg, ffprobe
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { assertRenderableVideo } from "./renderGuard.js";
import { recordRenderSpend } from "./opsState.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const SCENE_COUNT = 5;

export function isStockVideoConfigured() {
  return Boolean(process.env.PEXELS_API_KEY);
}

// ─── Text utilities ────────────────────────────────────────────────────────

function cleanText(value, maxLength = 1200) {
  return String(value || "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
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
  return cleanText(text, 220).replace(/[{}]/g, "").replace(/\n/g, "\\N");
}

function subtitleFilterPath(filePath) {
  return String(filePath).replace(/\\/g, "/").replace(/'/g, "\\'");
}

// ─── ASS subtitle file ─────────────────────────────────────────────────────

function writeSubtitleFile({ subtitlePath, script, duration, style }) {
  const words = wordsOf(script);
  const chunkSize = style === "horror" || style === "faceless-reels" ? 4 : 5;
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(" "));
  }

  const totalWords = Math.max(1, words.length);
  let cursorWords = 0;
  const events = chunks.map((chunk) => {
    const wordCount = wordsOf(chunk).length;
    const start = (cursorWords / totalWords) * duration;
    cursorWords += wordCount;
    const end = Math.min(duration, Math.max(start + 0.72, (cursorWords / totalWords) * duration));
    return `Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,${assEscape(chunk).toUpperCase()}`;
  });

  const styleConfig = {
    horror: { fontSize: 62, primary: "&H00F5F5EB", outline: "&H00000000", shadow: 0, marginV: 245, fontname: "Arial" },
    "faceless-reels": { fontSize: 72, primary: "&H00FFFFFF", outline: "&H00000000", shadow: 2, marginV: 235, fontname: "Arial" },
    beauty: { fontSize: 64, primary: "&H00FFFFFF", outline: "&H00101010", shadow: 2, marginV: 220, fontname: "Arial" },
    kids:   { fontSize: 72, primary: "&H00FFEE44", outline: "&H00101010", shadow: 3, marginV: 200, fontname: "Arial" },
  };
  const cfg = styleConfig[style] || styleConfig.beauty;

  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${WIDTH}
PlayResY: ${HEIGHT}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${cfg.fontname},${cfg.fontSize},${cfg.primary},&H00FFFFFF,${cfg.outline},&H99000000,1,0,0,0,100,100,0,0,1,7,${cfg.shadow},2,80,80,${cfg.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
  fs.writeFileSync(subtitlePath, ass);
}

// ─── TTS audio ────────────────────────────────────────────────────────────

function getTTSProfile(style, voice) {
  const profiles = {
    horror: { voice: process.env.HORROR_TTS_VOICE || "en-US-GuyNeural",  rate: process.env.HORROR_TTS_RATE  || "-12%" },
    "faceless-reels": { voice: process.env.FACELESS_REELS_TTS_VOICE || "en-US-AriaNeural", rate: process.env.FACELESS_REELS_TTS_RATE || "+8%" },
    beauty: { voice: process.env.BEAUTY_TTS_VOICE || "en-US-AriaNeural", rate: process.env.BEAUTY_TTS_RATE  || "+5%"  },
    kids:   { voice: process.env.KIDS_TTS_VOICE   || "en-US-AnaNeural",  rate: process.env.KIDS_TTS_RATE    || "-8%"  },
  };
  const profile = profiles[style] || profiles.beauty;
  return { ...profile, voice: voice || process.env.DEFAULT_TTS_VOICE || profile.voice };
}

async function renderAudio({ audioPath, script, style, voice }) {
  const profile = getTTSProfile(style, voice);
  const args = ["--voice", profile.voice];
  if (profile.rate && profile.rate !== "+0%") args.push(`--rate=${profile.rate}`);
  args.push("--text", cleanText(script, 1200), "--write-media", audioPath);
  console.log(`[StockVideo] TTS voice=${profile.voice} rate=${profile.rate} style=${style}`);
  await execFileAsync("edge-tts", args, { timeout: 60_000 });
}

async function audioDuration(audioPath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet", "-of", "csv=p=0", "-show_entries", "format=duration", audioPath,
  ], { timeout: 30_000 });
  return Math.min(Math.max(Math.ceil(parseFloat(stdout.trim()) || 30), 8), 58);
}

// ─── Pexels clip search ────────────────────────────────────────────────────

async function searchPexelsClip(query, pexelsKey) {
  try {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&size=medium&per_page=10`;
    const resp = await fetch(url, {
      headers: { Authorization: pexelsKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) {
      console.warn(`[StockVideo] Pexels HTTP ${resp.status} for "${query}"`);
      return null;
    }
    const data = await resp.json();
    const videos = data.videos || [];

    // Prefer portrait orientation
    for (const video of videos) {
      const files = (video.video_files || [])
        .filter(f => f.link && f.height && f.width && f.height > f.width && f.quality !== "uhd")
        .sort((a, b) => (a.width * a.height) - (b.width * b.height)); // smallest file first
      if (files[0]?.link) return files[0].link;
    }
    // Fallback: any orientation
    for (const video of videos) {
      const files = (video.video_files || []).filter(f => f.link && f.quality !== "uhd");
      if (files[0]?.link) return files[0].link;
    }
    return null;
  } catch (e) {
    console.warn(`[StockVideo] Pexels search failed for "${query}":`, e.message);
    return null;
  }
}

// ─── Scene keyword extraction ──────────────────────────────────────────────

const FALLBACK_KEYWORDS = {
  horror: [
    "dark abandoned building night",
    "foggy forest eerie atmosphere",
    "flickering candlelight shadows",
    "old cemetery moonlight mist",
    "mysterious dark corridor",
  ],
  "faceless-reels": [
    "person working laptop desk",
    "phone scrolling social media",
    "city lifestyle morning commute",
    "close up hands typing",
    "business meeting creative office",
  ],
  beauty: [
    "skincare routine woman closeup",
    "makeup application beauty mirror",
    "glowing skin face portrait",
    "cosmetics flat lay aesthetic",
    "beauty lifestyle woman morning",
  ],
  kids: [
    "happy children playing outdoor",
    "colorful toys kids learning",
    "toddler laughing sunshine park",
    "bright classroom kids drawing",
    "children dancing colorful",
  ],
};

async function extractSceneKeywords(script, style) {
  const styleHint = {
    horror: "dark, eerie, atmospheric, abandoned, mysterious, cinematic thriller",
    "faceless-reels": "clean modern lifestyle, business, productivity, hands, phone, laptop, cinematic b-roll",
    beauty: "skincare, makeup, glow, lifestyle, beauty products, woman portrait",
    kids:   "colorful, playful, happy children, educational, bright, fun",
  }[style] || "cinematic lifestyle";

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 220,
      messages: [{
        role: "user",
        content: `Extract exactly ${SCENE_COUNT} Pexels stock video search queries from this script. Each must be 3-6 words. Style: ${styleHint}.

Script: "${script.slice(0, 450)}"

Return ONLY a valid JSON array of ${SCENE_COUNT} strings. No explanation.`,
      }],
    });
    const match = resp.content[0].text.match(/\[[\s\S]*?\]/);
    const kw = JSON.parse(match[0]);
    return Array.isArray(kw) && kw.length >= 3 ? kw.slice(0, SCENE_COUNT) : (FALLBACK_KEYWORDS[style] || FALLBACK_KEYWORDS.beauty);
  } catch {
    return FALLBACK_KEYWORDS[style] || FALLBACK_KEYWORDS.beauty;
  }
}

// ─── Clip processing ──────────────────────────────────────────────────────

async function downloadAndCropClip({ url, output, duration }) {
  // ffmpeg handles HTTPS URLs directly — no separate download step needed
  await execFileAsync("ffmpeg", [
    "-y",
    "-i", url,
    "-t", duration.toFixed(3),
    "-vf", [
      `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
      `crop=${WIDTH}:${HEIGHT}`,
      "setpts=PTS-STARTPTS",
    ].join(","),
    "-r", String(FPS),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
    "-an",
    output,
  ], { timeout: 90_000, maxBuffer: 200 * 1024 * 1024 });
}

async function generateFallbackClip({ output, duration, style, index }) {
  const palettes = {
    horror: ["0x100808", "0x080810", "0x0d0808", "0x080d08", "0x08080d"],
    "faceless-reels": ["0x111827", "0x0F172A", "0x1F2937", "0x0B1220", "0x172033"],
    beauty: ["0xF8B4CE", "0xE8A0BF", "0xC9A0DC", "0xF4C2C2", "0xFFDFEF"],
    kids:   ["0xFF6B6B", "0x4ECDC4", "0x45B7D1", "0xFFA07A", "0x98D8C8"],
  };
  const color = (palettes[style] || palettes.beauty)[index % 5];
  await execFileAsync("ffmpeg", [
    "-y", "-f", "lavfi",
    "-i", `color=${color}:size=${WIDTH}x${HEIGHT}:rate=${FPS}`,
    "-t", duration.toFixed(3),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
    output,
  ], { timeout: 30_000 });
}

async function concatClips({ clipPaths, concatListPath, output }) {
  const listContent = clipPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(concatListPath, listContent);
  await execFileAsync("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", concatListPath,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
    output,
  ], { timeout: 180_000, maxBuffer: 500 * 1024 * 1024 });
}

async function addAudioAndCaptions({ videoPath, audioPath, subtitlePath, outputPath, style }) {
  // Style-specific color grading
  const colorGrade = {
    horror: "noise=alls=20:allf=t+u,eq=contrast=1.35:brightness=-0.06:saturation=0.50,vignette=PI/4,",
    "faceless-reels": "eq=contrast=1.12:saturation=1.10,unsharp=5:5:0.55,",
    beauty: "eq=saturation=1.20:contrast=1.08,",
    kids:   "eq=saturation=1.40:brightness=0.04,",
  }[style] || "";

  const subFilter = `subtitles='${subtitleFilterPath(subtitlePath)}'`;

  // Pexels attribution watermark — required by Pexels API Terms of Service
  // https://www.pexels.com/api/documentation/#guidelines
  const pexelsWatermark = `drawtext=text='pexels.com':x=W-tw-12:y=H-th-12:fontsize=20:fontcolor=white@0.55:shadowx=1:shadowy=1`;

  await execFileAsync("ffmpeg", [
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    "-filter_complex", `[0:v]${colorGrade}${subFilter},${pexelsWatermark}[v];[1:a]apad[a]`,
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
    "-c:a", "aac", "-b:a", "128k",
    "-pix_fmt", "yuv420p",
    "-shortest",
    "-movflags", "+faststart",
    outputPath,
  ], { timeout: 300_000, maxBuffer: 500 * 1024 * 1024 });
}

// Append Pexels attribution to any caption that used stock footage
// Call this in meeting files before scheduling the post
export function addPexelsAttribution(caption = "") {
  const credit = "Stock footage: pexels.com";
  if (caption.includes("pexels")) return caption; // already has it
  return `${caption.trim()}\n${credit}`;
}

// ─── Main export ──────────────────────────────────────────────────────────

export async function generateStockFootageVideo({ script, hook, niche = "", style = "beauty", voice } = {}) {
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (!pexelsKey) throw new Error("PEXELS_API_KEY not configured — cannot use stock footage pipeline.");

  const safeScript = cleanText(script || hook, 1200);
  if (!safeScript) throw new Error("No script supplied to stock footage pipeline.");

  const videoDir = process.env.VIDEO_DIR || "./output/video";
  const audioDir = process.env.AUDIO_DIR || "./output/audio";
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const audioPath      = path.resolve(audioDir, `${id}.mp3`);
  const subtitlePath   = path.resolve(videoDir, `${id}.ass`);
  const concatListPath = path.resolve(videoDir, `${id}_list.txt`);
  const concatVideo    = path.resolve(videoDir, `${id}_concat.mp4`);
  const outputPath     = path.resolve(videoDir, `${id}_stock.mp4`);
  const clipPaths      = [];

  try {
    // Step 1: TTS audio → measure duration
    await renderAudio({ audioPath, script: safeScript, style, voice });
    const duration = await audioDuration(audioPath);
    console.log(`[StockVideo] style=${style} duration=${duration}s niche="${niche}"`);

    // Step 2: Extract scene keywords + burn captions
    const keywords = await extractSceneKeywords(safeScript, style);
    const clipDur  = Math.max(2.0, duration / keywords.length);
    writeSubtitleFile({ subtitlePath, script: safeScript, duration, style });
    console.log(`[StockVideo] ${keywords.length} scenes × ${clipDur.toFixed(1)}s each`);

    // Step 3: Fetch + process each clip
    for (let i = 0; i < keywords.length; i++) {
      const clipPath = path.resolve(videoDir, `${id}_clip_${i}.mp4`);
      clipPaths.push(clipPath);

      const clipUrl = await searchPexelsClip(keywords[i], pexelsKey);
      if (clipUrl) {
        console.log(`[StockVideo] Clip ${i + 1}/${keywords.length}: "${keywords[i]}"`);
        try {
          await downloadAndCropClip({ url: clipUrl, output: clipPath, duration: clipDur });
        } catch (e) {
          console.warn(`[StockVideo] Clip ${i + 1} download failed (${e.message}), using fallback color`);
          await generateFallbackClip({ output: clipPath, duration: clipDur, style, index: i });
        }
      } else {
        console.warn(`[StockVideo] No Pexels result for "${keywords[i]}", using fallback color`);
        await generateFallbackClip({ output: clipPath, duration: clipDur, style, index: i });
      }
    }

    // Step 4: Concat clips → add audio + captions + color grade
    await concatClips({ clipPaths, concatListPath, output: concatVideo });
    await addAudioAndCaptions({ videoPath: concatVideo, audioPath, subtitlePath, outputPath, style });

    // Step 5: Validate output
    const v = await assertRenderableVideo(outputPath, { minDuration: 8, requireAudio: true, requireVertical: true });
    recordRenderSpend({ source: "stock-footage", estimatedCost: 0, videoPath: outputPath });
    console.log(`[StockVideo] ✓ ${outputPath} (${v.duration.toFixed(1)}s)`);
    return outputPath;
  } finally {
    for (const f of [audioPath, subtitlePath, concatListPath, concatVideo, ...clipPaths]) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
}
