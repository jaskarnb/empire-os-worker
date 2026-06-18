// VLT-06 · Ledger — growth & monetization strategy
import { ask, extractJson } from "../claude.js";

export async function growthPlan(portfolio) {
  const { niches, revMonth } = portfolio;
  const txt = await ask(
    `You are Ledger, growth & monetization strategist for a faceless network running: ${niches.join(", ")}.
Revenue $${revMonth.toLocaleString()}/mo.
Recommend (1) next 3 pages/platforms to launch and (2) 3 specific monetization moves.
Respond ONLY as JSON: {"launches":[{"niche":"","platform":"","why":""}],"moves":["","",""]}`
  );
  return extractJson(txt);
}
