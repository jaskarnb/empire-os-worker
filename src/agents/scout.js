// RDR-04 · Scout — trend intel
import { ask } from "../claude.js";

export async function scanTrends() {
  return ask(
    `You are Scout, trend-intel agent. Search the web for what faceless short-form NICHES and video STYLES
are performing best right now in 2026 across TikTok, Reels, Shorts.
Tight briefing: top 3 rising niches, top 3 winning formats, 1 fading format. Plain text under 170 words.`,
    { web: true }
  );
}
