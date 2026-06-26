function words(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean);
}

function scoreRange(value, min, max) {
  if (value >= min && value <= max) return 1;
  const distance = value < min ? min - value : value - max;
  return Math.max(0, 1 - distance / Math.max(min, max));
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function scorePostQuality({ post = {}, niche = "", audience = "general" } = {}) {
  const hook = String(post.hook || "");
  const script = String(post.script || "");
  const caption = String(post.caption || "");
  const title = String(post.title || "");
  const allText = `${title}\n${hook}\n${script}\n${caption}`;

  const hookWords = words(hook).length;
  const scriptWords = words(script).length;
  const issues = [];
  const scriptMin = audience === "kids" ? 55 : audience === "teen" ? 60 : 85;
  const scriptMax = audience === "kids" ? 95 : audience === "teen" ? 115 : 165;
  const scores = {
    hookLength: scoreRange(hookWords, 5, 13),
    scriptLength: scoreRange(scriptWords, scriptMin, scriptMax),
    specificity: hasAny(allText, [/\b\d+(\.\d+)?\b/, /\bminute|hour|step|tool|example|today|weekly|daily\b/i]) ? 1 : 0.35,
    retention: hasAny(allText, [/\bhere'?s|but|what if|the thing is|watch|start|stop|mistake|secret|simple\b/i]) ? 1 : 0.45,
    nicheFit: niche && allText.toLowerCase().includes(String(niche).split(/\W+/).find((part) => part.length > 3)?.toLowerCase() || "__missing__") ? 1 : 0.65,
    caption: /#[A-Za-z0-9_]+/.test(caption) && caption.length >= 60 ? 1 : 0.45,
  };

  if (hookWords < 5 || hookWords > 14) issues.push(`Hook should be 5-13 words; got ${hookWords}`);
  if (scriptWords < scriptMin || scriptWords > scriptMax + 10) issues.push(`Script should be ${scriptMin}-${scriptMax} words; got ${scriptWords}`);
  if (!scores.specificity || scores.specificity < 0.5) issues.push("Script needs a concrete example, number, tool, or step");
  if (!scores.retention || scores.retention < 0.5) issues.push("Script needs a stronger curiosity or payoff pattern");
  if (!/#/.test(caption)) issues.push("Caption needs hashtags");

  const weighted =
    scores.hookLength * 0.18 +
    scores.scriptLength * 0.22 +
    scores.specificity * 0.18 +
    scores.retention * 0.18 +
    scores.nicheFit * 0.12 +
    scores.caption * 0.12;

  return {
    status: weighted >= 0.72 && issues.length <= 1 ? "pass" : "fail",
    score: Number(weighted.toFixed(3)),
    scores,
    issues,
  };
}

export function assertContentQuality(input) {
  const result = scorePostQuality(input);
  if (result.status !== "pass") {
    throw new Error(`QualityGate: post failed quality score ${result.score}: ${result.issues.join("; ")}`);
  }
  return result;
}
