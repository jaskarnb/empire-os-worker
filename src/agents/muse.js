// SPK-03 · Muse — idea generation
import { ask, extractJson } from "../claude.js";

export async function generateIdeas(niche) {
  const txt = await ask(
    `You are Muse, ideation agent for a faceless ${niche} short-form page (TikTok/Reels/Shorts).
Generate 5 fresh high-retention 2026 video ideas. Each: scroll-stopping title + 2-second spoken hook.
Respond ONLY with JSON array: [{"title":"...","hook":"..."}]`
  );
  return extractJson(txt).slice(0, 5);
}
