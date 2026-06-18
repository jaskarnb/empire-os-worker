// FRG-05 · Smith — script & caption production
import { ask, extractJson } from "../claude.js";

export async function produce(idea) {
  const { niche, title, hook } = idea;
  const txt = await ask(
    `You are Smith, production agent. Turn this faceless ${niche} idea into a ready package.
Idea: "${title}". Hook: "${hook}".
Respond ONLY as JSON: {"script":"40-60 word voiceover","caption":"caption with CTA","hashtags":["#a","#b","#c"]}`
  );
  return extractJson(txt);
}
