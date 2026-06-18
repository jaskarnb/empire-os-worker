/**
 * Thin wrapper around the Anthropic SDK.
 * All Claude calls go through here so the API key never touches the browser.
 */
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function ask(prompt, { web = false, maxTokens = 1200, model = "claude-sonnet-4-6" } = {}) {
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };
  if (web) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }
  const msg = await client.messages.create(body);
  return (msg.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export function extractJson(text) {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const fo = clean.indexOf("{");
  const fa = clean.indexOf("[");
  const start = fa === -1 ? fo : fo === -1 ? fa : Math.min(fo, fa);
  if (start === -1) throw new Error("No JSON found");
  const isArr = clean[start] === "[";
  return JSON.parse(clean.slice(start, clean.lastIndexOf(isArr ? "]" : "}") + 1));
}
