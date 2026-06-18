import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * @param {string} prompt
 * @param {{ web?: boolean, maxTokens?: number, model?: string }} opts
 * Default model is Haiku to keep costs low.
 * Pass model:'claude-sonnet-4-6' for quality-critical agents (smith, scout).
 */
export async function ask(prompt, { web = false, maxTokens = 400, model = 'claude-haiku-4-5-20251001' } = {}) {
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text;
}

export function extractJson(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (!match) return null;
  try { return JSON.parse(match[1] || match[0]); } catch { return null; }
}
