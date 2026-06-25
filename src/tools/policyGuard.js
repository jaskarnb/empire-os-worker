import { makeIncident, recordIncident } from "./opsIncidents.js";

const SECRET_TOKEN_PATTERN = /\b(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|(?:password|private key|seed phrase)\s*[:=])\b/i;

const RISK_PATTERNS = [
  { pattern: /\b(kill yourself|kys|suicide instructions|self[- ]harm)\b/i, reason: "self-harm phrase" },
  { pattern: /\b(nude|porn|sexually explicit|onlyfans|nsfw)\b/i, reason: "sexual content" },
  { pattern: /\b(hate crime|racial slur|terrorist manifesto)\b/i, reason: "hate or extremist content" },
  { pattern: /\b(guaranteed profit|risk[- ]free money|100% return|can't lose)\b/i, reason: "misleading financial claim" },
  { pattern: /\b(medical cure|cures cancer|stop taking medication)\b/i, reason: "unsafe medical claim" },
  { pattern: SECRET_TOKEN_PATTERN, reason: "secret or credential leak" },
];

const KIDS_BLOCK_PATTERNS = [
  { pattern: /\b(scary|blood|gore|murder|weapon|gun|knife|kidnap)\b/i, reason: "unsafe kids content" },
  { pattern: /\b(buy robux|use your parents'? card|spend real money|in-app purchase)\b/i, reason: "kids spending prompt" },
  { pattern: /\b(date me|crush|sexy|hot girl|hot boy)\b/i, reason: "inappropriate kids relationship/sexualized content" },
];

const TEEN_BLOCK_PATTERNS = [
  { pattern: /\b(edging|gooning|porn|sexual)\b/i, reason: "sexual teen-facing content" },
  { pattern: /\b(bully|harass|dox|swat)\b/i, reason: "harassment or abuse prompt" },
];

function combinedText(post) {
  return [post?.title, post?.hook, post?.script, post?.caption]
    .filter(Boolean)
    .join("\n");
}

function findRisk(text, audience) {
  const checks = [...RISK_PATTERNS];
  if (audience === "kids") checks.push(...KIDS_BLOCK_PATTERNS);
  if (audience === "teen") checks.push(...TEEN_BLOCK_PATTERNS);
  return checks.find((item) => item.pattern.test(text));
}

export function assertPolicySafePost({ post, channelName = "unknown", audience = "general", niche = "" }) {
  const text = combinedText(post);
  if (!text.trim()) {
    const incident = recordIncident(makeIncident({
      agent: "Policy Watcher",
      severity: "P1",
      service: "content-policy",
      problem: "Generated post is empty",
      evidence: [`channel=${channelName}`, `audience=${audience}`],
      recommendedAction: "Regenerate the post before video rendering",
    }));
    throw new Error(`PolicyGuard: empty post (${incident.id})`);
  }

  const risk = findRisk(text, audience);
  if (risk) {
    const incident = recordIncident(makeIncident({
      agent: "Policy Watcher",
      severity: audience === "kids" ? "P0" : "P1",
      service: "content-policy",
      problem: `Blocked generated post: ${risk.reason}`,
      evidence: [
        `channel=${channelName}`,
        `audience=${audience}`,
        `niche=${niche}`,
        `title=${String(post?.title || "").slice(0, 120)}`,
      ],
      recommendedAction: "Regenerate with stricter safety constraints before scheduling",
    }));
    throw new Error(`PolicyGuard: blocked ${risk.reason} (${incident.id})`);
  }

  return { ok: true, audience, channelName };
}
