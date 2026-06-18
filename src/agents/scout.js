import { ask } from '../claude.js';

// Scout scans trends — needs Sonnet for web-search quality
const MODEL = 'claude-sonnet-4-6';

export async function scanTrends() {
  return ask(
    "You are Scout. Identify 5 trending niches on TikTok/YouTube Shorts right now with high monetisation potential. For each give: niche name, why it's trending, and one video concept. Be concise.",
    { web: true, maxTokens: 600, model: MODEL }
  );
}
