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

async function ensureWorkspaceSelected() {
  const workspaceId = process.env.HIGGSFIELD_WORKSPACE_ID || process.env.HF_WORKSPACE_ID;
  if (!workspaceId) {
    console.warn("[Higgsfield] HIGGSFIELD_WORKSPACE_ID is not set; using the CLI's default authenticated workspace.");
    return;
  }

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

function stylePrompt({ script, hook, niche, style }) {
  const base = [
    "Create a vertical 9:16 short-form video as an original 3D animated cartoon.",
    "Target length: 10-12 seconds, matching the model limit. Make every second active and useful.",
    "It must be real character animation, not a slideshow, not static key art, and not a still image with camera movement.",
    "The visuals must clearly match the voiceover/script beat by beat.",
    "Use strong pacing, visual continuity, readable captions, squash-and-stretch poses, expressive faces, clear gestures, walking, reaching, reacting, and prop interaction.",
    "Use a clear setup, tension/build, payoff, and ending.",
    "Use the energy of classic cable-TV cartoons: bright colors, bold silhouettes, exaggerated reactions, quick visual jokes, and playful scene blocking.",
    "No copyrighted characters, no lookalike characters, no copied show art style, no copied creator footage, no logos.",
    "Create original characters, locations, props, colors, and costumes that fit the niche and theme.",
  ];

  const styleLines = {
    horror: [
      "Style: spooky 3D cartoon mystery with expressive original characters.",
      "The character tiptoes, hides, investigates clues, reacts with big eyes, and physically runs from the reveal.",
      "Use dramatic shadows, elastic reactions, playful suspense, and one clear non-graphic scare payoff.",
      "Scary atmosphere, rising dread, clear payoff. Sound on.",
    ],
    brainrot: [
      "Style: fast chaotic 3D viral cartoon with exaggerated motion and quick visual punchlines.",
      "Bright, high-energy, funny, safe for teen audiences.",
      "The main character should move through multiple actions: panic, chase an object, jump, point, dodge, celebrate, collapse, or transform in a funny safe way.",
      "Use fast voice, meme pacing, clear captions, and an understandable mini-story.",
    ],
    kids: [
      "Style: cheerful, colorful 3D kids cartoon with friendly motion and simple happy visuals.",
      "Characters should walk, wave, bounce, pick up objects, solve a tiny problem, and celebrate at the end.",
      "Use cheerful voice, bright music, simple captions, and a friendly mini-story with a safe lesson.",
      "No scary images, no danger, no inappropriate content.",
    ],
    "faceless-reels": [
      "Style: original 3D animated cartoon explainer, not stock b-roll and not a faceless template clone.",
      "Use an original mascot/character inside a themed cartoon world that matches the niche: desk, phone, money, school, AI lab, gym, kitchen, or city as needed.",
      "The character must do things on screen: open apps, chase charts, dodge notifications, build objects, point at evidence, react to mistakes, and hit a visual payoff.",
      "Fast retention pacing: hook in the first second, 4-7 quick visual beats, bold readable captions, and a clear payoff.",
      "No face-to-camera presenter, no copied template, no logos, no creator footage, no exact wording from references.",
    ],
    dark: [
      "Style: polished 3D animated cartoon explainer with bold visual hooks and active character movement.",
      "Use a niche-specific original character who acts out the problem and payoff instead of showing generic b-roll.",
    ],
  };

  return cleanText([
    ...base,
    ...(styleLines[style] || styleLines.dark),
    `Niche: ${cleanText(niche, 220)}`,
    `Opening hook: ${cleanText(hook, 120)}`,
    `Voiceover/script: ${cleanText(script, 1400)}`,
    "Output: vertical, social-ready, fully animated/generated original 3D cartoon with active characters and enough motion to hold attention.",
  ].join("\n"));
}

function durationValue() {
  const raw = Number.parseInt(process.env.HIGGSFIELD_DURATION || "12", 10);
  if (!Number.isFinite(raw)) return 12;
  return Math.min(Math.max(raw, 5), 12);
}

function pushParam(args, flagName, value) {
  if (value === undefined || value === null || value === "") return;
  args.push(`--${flagName}`, String(value));
}

function modelParams(style) {
  const horror = style === "horror";
  const genreOverride = process.env[`HIGGSFIELD_${String(style).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_GENRE`];
  return {
    aspectRatioFlag: process.env.HIGGSFIELD_ASPECT_RATIO_PARAM || "aspect_ratio",
    aspectRatio: process.env.HIGGSFIELD_ASPECT_RATIO || "9:16",
    duration: durationValue(),
    genre: genreOverride || (horror ? process.env.HIGGSFIELD_GENRE || "horror" : style === "faceless-reels" ? "social" : ""),
    mode: process.env.HIGGSFIELD_MODE || "pro",
    sound: process.env.HIGGSFIELD_SOUND || "on",
    resolutionFlag: process.env.HIGGSFIELD_RESOLUTION_PARAM || "",
    resolution: process.env.HIGGSFIELD_RESOLUTION_PARAM ? process.env.HIGGSFIELD_RESOLUTION || "" : "",
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

  const model = process.env.HIGGSFIELD_VIDEO_MODEL || "cinematic_studio_video_v2";
  const timeout = process.env.HIGGSFIELD_WAIT_TIMEOUT || "20m";
  const interval = process.env.HIGGSFIELD_WAIT_INTERVAL || "5s";
  const prompt = stylePrompt({ script, hook, niche, style });
  const params = modelParams(style);

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
  pushParam(args, params.resolutionFlag, params.resolution);

  console.log(`[Higgsfield] Generating ${style} video with ${model}...`);
  await ensureWorkspaceSelected();
  const { stdout, stderr } = await execFileAsync(cliPath(), args, {
    timeout: Number(process.env.HIGGSFIELD_TIMEOUT_MS || 25 * 60 * 1000),
    maxBuffer: 20 * 1024 * 1024,
  });
  const output = [stdout, stderr].filter(Boolean).join("\n");
  const videoUrl = extractVideoUrl(output);
  console.log(`[Higgsfield] Video ready: ${videoUrl}`);
  return videoUrl;
}
