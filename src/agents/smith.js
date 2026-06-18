import { ask, extractJson } from '../claude.js';

// Smith produces scripts — needs Sonnet for quality output
const MODEL = 'claude-sonnet-4-6';

export async function produce({ niche, title, hook }) {
  const text = await ask(
    `You are Smith, a faceless content producer for "${niche}".
Script a 15-second TikTok/Reel:
Title: "${title}"
Hook: "${hook}"
Return JSON: { "script": "...", "caption": "...", "hashtags": ["..."] }
Keep script under 120 words. Caption under 150 chars.`,
    { maxTokens: 600, model: MODEL }
  );
  return extractJson(text) ?? { script: text, caption: hook, hashtags: [] };
}
