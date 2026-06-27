const HORROR_SIGNALS = [
  "horror", "scary", "creepy", "paranormal", "haunting", "terrifying", "caught", "camera", "cctv", "pov", "dark",
];

const FAST_SIGNALS = ["funny", "meme", "brainrot", "wtf", "wild", "crazy", "fail", "slide"];
const KIDS_SIGNALS = ["kids", "roblox", "minecraft", "abc", "nursery", "colors", "cartoon", "happy"];

function clean(value, max = 500) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function urlHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "unknown"; }
}

function signalScore(text, signals) {
  const lower = String(text || "").toLowerCase();
  return signals.reduce((score, signal) => score + (lower.includes(signal) ? 1 : 0), 0);
}

function styleFromSignals(text, niche) {
  const combined = `${text} ${niche}`.toLowerCase();
  const horror = signalScore(combined, HORROR_SIGNALS);
  const kids = signalScore(combined, KIDS_SIGNALS);
  const fast = signalScore(combined, FAST_SIGNALS);
  if (horror >= Math.max(1, kids, fast)) return "horror";
  if (kids >= Math.max(1, horror, fast)) return "kids";
  if (fast >= Math.max(1, horror, kids)) return "brainrot";
  return "dark";
}

function extractHashtags(text) {
  return [...String(text || "").matchAll(/#[A-Za-z0-9_\u0080-\uFFFF]+/g)]
    .map((match) => match[0])
    .slice(0, 12);
}

function normalizeReference(ref, index) {
  const raw = typeof ref === "string" ? { url: ref } : (ref || {});
  const text = clean([raw.title, raw.caption, raw.notes, raw.html, raw.url].filter(Boolean).join(" "), 1200);
  return {
    id: raw.id || `ref-${index + 1}`,
    url: raw.url || raw.cite || "",
    source: raw.source || urlHost(raw.url || raw.cite || ""),
    title: clean(raw.title || raw.caption || raw.notes || raw.url || `Reference ${index + 1}`, 160),
    text,
    hashtags: extractHashtags(text),
  };
}

export function analyzeReferenceVideos({ references = [], niche = "", style = "auto" } = {}) {
  const normalized = references.map(normalizeReference);
  const combinedText = normalized.map((ref) => `${ref.title} ${ref.text} ${ref.hashtags.join(" ")}`).join("\n");
  const resolvedStyle = style && style !== "auto" ? style : styleFromSignals(combinedText, niche);
  const allTags = [...new Set(normalized.flatMap((ref) => ref.hashtags))].slice(0, 20);

  const base = {
    status: "ok",
    style: resolvedStyle,
    references: normalized,
    commonHashtags: allTags,
    doNotCopy: [
      "Do not reuse creator footage.",
      "Do not copy exact wording from captions or voiceovers.",
      "Use references only for structure, pacing, camera style, and hook patterns.",
    ],
  };

  if (resolvedStyle === "horror") {
    return {
      ...base,
      winningPatterns: [
        "Open with a normal-looking real-world shot before anything obviously scary happens.",
        "Use handheld or surveillance-style framing so the video feels discovered, not staged.",
        "Build around one clear visual question: what moved, who is there, why did the camera glitch?",
        "Delay the reveal until the final third, then end quickly after the payoff.",
      ],
      pacingNotes: [
        "0-2s: immediate unease or impossible detail.",
        "2-8s: slow push, camera shake, or zoom toward the clue.",
        "8-20s: one escalation, one false calm.",
        "Final seconds: reveal, cut, or unanswered detail.",
      ],
      visualLanguage: [
        "Handheld phone footage, CCTV timestamps, night vision, doorways, hallways, parking lots, empty rooms.",
        "Low light, realistic lens noise, imperfect framing, short glitches.",
        "Avoid gore; fear comes from timing, framing, and uncertainty.",
      ],
      captionStyle: [
        "Short all-caps phrases.",
        "Captions should add context but not explain the reveal too early.",
        "Use curiosity captions like 'watch the doorway' or 'listen closely'.",
      ],
    };
  }

  if (resolvedStyle === "kids") {
    return {
      ...base,
      winningPatterns: [
        "Start with a simple question or game.",
        "Use bright motion, friendly characters, repetition, and participation.",
        "End with a safe, cheerful payoff.",
      ],
      pacingNotes: ["Simple beats every 2-4 seconds.", "Repeat key words.", "Avoid sudden scary reveals."],
      visualLanguage: ["Bright colors", "Soft motion", "Friendly faces/objects", "Clear visual learning goal"],
      captionStyle: ["Simple words", "Parent-safe tone", "No scary or unsafe language"],
    };
  }

  if (resolvedStyle === "brainrot") {
    return {
      ...base,
      winningPatterns: [
        "Use fast contrast, absurd escalation, and meme-literate punchlines.",
        "Every 1-2 seconds needs a visual change or joke beat.",
        "Keep it original and safe for teen audiences.",
      ],
      pacingNotes: ["Fast cuts", "Immediate hook", "Punchline loop", "No long explanation"],
      visualLanguage: ["High saturation", "Quick zooms", "Exaggerated motion", "Readable captions"],
      captionStyle: ["Short punchy captions", "Meme tags", "No explicit/sexual content"],
    };
  }

  return {
    ...base,
    winningPatterns: [
      "Open with a clear promise or curiosity gap.",
      "Show concrete visual proof while the voiceover explains.",
      "End with a useful payoff or surprising contrast.",
    ],
    pacingNotes: ["Hook in first 2 seconds", "New visual every 3-5 seconds", "Keep the script specific"],
    visualLanguage: ["Clean b-roll", "Cinematic motion", "Readable captions", "No static slides"],
    captionStyle: ["Strong first sentence", "Two short value lines", "5 relevant hashtags"],
  };
}
