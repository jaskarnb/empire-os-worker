import { execFile } from "child_process";
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

function stylePrompt({ script, hook, niche, style }) {
  const base = [
    "Create a vertical 9:16 short-form video with real cinematic motion.",
    "Target runtime: at least 20 seconds and no more than 59 seconds.",
    "Do not make tiny preview clips; the video needs enough time for setup, movement, payoff, and a final beat.",
    "It must be a generated video, not a slideshow and not a static image.",
    "The video must follow the script beat-by-beat: each major sentence should have a matching visual moment.",
    "Keep visual continuity so the scene feels like one coherent story, not random unrelated clips.",
    "Use strong pacing, visual continuity, and retention-focused camera movement.",
    "Make the short feel complete: setup, escalation, payoff, and a final after-beat.",
    "Prioritize high-quality lighting, clear subjects, stable composition, smooth motion, and polished social-ready framing.",
    "No copyrighted characters, no copied creator footage, no logos.",
  ];

  const styleLines = {
    horror: [
      "Realistic caught-on-camera footage.",
      "Handheld phone camera moving through a dark hallway or backyard at night.",
      "Build dread with small visual clues, distant movement, uneasy silence, and a clear camera path that matches the script.",
      "For short horror, keep it 20-30 seconds with a strong jump scare and aftermath beat.",
      "For story horror, use 40-59 seconds with narration, captions, escalation, and a stronger ending.",
      "After the scare, hold a short unsettling aftermath beat so viewers process what happened.",
      "Cinematic tension build. Found footage aesthetic. No CGI monsters.",
      "No graphic gore. Scary atmosphere, rising dread, clear payoff.",
      "Genre: horror. Sound on. Sharp scare beat, but keep it platform-safe.",
    ],
    brainrot: [
      "Style: fast chaotic viral meme video with exaggerated motion and quick visual punchlines.",
      "Target 20-35 seconds unless the joke needs more setup; never feel cut off too early.",
      "Every visual joke must connect to the script, with readable punchy captions and quick transitions.",
      "Bright, high-energy, funny, safe for teen audiences.",
    ],
    kids: [
      "Style: cheerful, colorful, safe kids video with friendly motion and simple happy visuals.",
      "Target 20-40 seconds with a complete beginning, middle, and ending.",
      "Every scene should clearly show what the script says, using cute characters, bright colors, and easy-to-understand actions.",
      "No scary images, no danger, no inappropriate content.",
    ],
    dark: [
      "Style: polished social media explainer with cinematic b-roll, smooth motion, and bold visual hooks.",
      "Target 20-45 seconds with clean pacing and no filler.",
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
    "Output: vertical, social-ready, 20-59 seconds, with enough motion and story progression to hold attention through the full clip.",
  ].join("\n"));
}

function pushParam(args, flagName, value) {
  if (value === undefined || value === null || value === "") return;
  args.push(`--${flagName}`, String(value));
}

function envValue(name, fallback = "") {
  return Object.prototype.hasOwnProperty.call(process.env, name) ? process.env[name] : fallback;
}

function modelParams(style, model) {
  const horror = style === "horror";
  const wanModel = /^wan2_/i.test(model);

  return {
    aspectRatioFlag: envValue("HIGGSFIELD_ASPECT_RATIO_PARAM", "aspect_ratio"),
    aspectRatio: envValue("HIGGSFIELD_ASPECT_RATIO", "9:16"),
    duration: envValue("HIGGSFIELD_DURATION", "20"),
    genre: wanModel ? "" : envValue("HIGGSFIELD_GENRE", horror ? "horror" : ""),
    mode: wanModel ? "" : envValue("HIGGSFIELD_MODE", "pro"),
    sound: wanModel ? "" : envValue("HIGGSFIELD_SOUND", "on"),
    resolution: envValue("HIGGSFIELD_RESOLUTION", wanModel ? "720p" : ""),
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
      ...(Array.isArray(parsed.outputs) ? parsed.outputs : []),
      ...(Array.isArray(parsed.results) ? parsed.results : []),
    ].flat().filter(Boolean);
    const found = candidates.find((value) => /^https?:\/\//i.test(String(value)));
    if (found) return String(found);
  } catch {}

  throw new Error(`Higgsfield did not return a video URL: ${text.slice(0, 500)}`);
}

export async function generateHiggsfieldVideo({ script, hook, niche = "", style = "dark" }) {
  if (!enabled()) throw new Error("HIGGSFIELD_ENABLED is not true");

  const model = process.env.HIGGSFIELD_VIDEO_MODEL || "wan2_7";
  const timeout = process.env.HIGGSFIELD_WAIT_TIMEOUT || "20m";
  const interval = process.env.HIGGSFIELD_WAIT_INTERVAL || "5s";
  const prompt = stylePrompt({ script, hook, niche, style });
  const params = modelParams(style, model);

  const args = [
    "generate",
    "create",
    model,
    "--prompt",
    prompt,
    "--wait",
    "--wait-timeout",
    timeout,
    "--wait-interval",
    interval,
    "--json",
    "--no-color",
  ];

  pushParam(args, params.aspectRatioFlag, params.aspectRatio);
  pushParam(args, "duration", params.duration);
  pushParam(args, "genre", params.genre);
  pushParam(args, "mode", params.mode);
  pushParam(args, "sound", params.sound);
  pushParam(args, "resolution", params.resolution);

  console.log(`[Higgsfield] Generating ${style} video with ${model}...`);
  const { stdout, stderr } = await execFileAsync(cliPath(), args, {
    timeout: Number(process.env.HIGGSFIELD_TIMEOUT_MS || 25 * 60 * 1000),
    maxBuffer: 20 * 1024 * 1024,
  });
  const output = [stdout, stderr].filter(Boolean).join("\n");
  const videoUrl = extractVideoUrl(output);
  console.log(`[Higgsfield] Video ready: ${videoUrl}`);
  return videoUrl;
}
