function words(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean);
}

function sentences(value) {
  return String(value || "")
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function scoreRange(value, min, max) {
  if (value >= min && value <= max) return 1;
  const distance = value < min ? min - value : value - max;
  return Math.max(0, 1 - distance / Math.max(min, max));
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function repeatedWordRatio(script) {
  const list = words(script).map((word) => word.toLowerCase().replace(/[^a-z0-9]/g, "")).filter((word) => word.length > 2);
  if (!list.length) return 0;
  const counts = list.reduce((acc, word) => {
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {});
  const max = Math.max(...Object.values(counts));
  return max / list.length;
}

function gibberishSignals(script) {
  const tokenList = words(script);
  const cleaned = tokenList.map((word) => word.toLowerCase().replace(/[^a-z0-9']/g, "")).filter(Boolean);
  const veryShortRatio = cleaned.filter((word) => word.length <= 2).length / Math.max(1, cleaned.length);
  const weirdLongWords = cleaned.filter((word) => word.length >= 16 && !/(ing|tion|ment|ness|able|character|backyard|something|everything)/.test(word)).length;
  const vowelLightWords = cleaned.filter((word) => word.length >= 7 && !/[aeiou]/.test(word)).length;
  const repeatedRatio = repeatedWordRatio(script);
  const fragmentSentences = sentences(script).filter((sentence) => words(sentence).length < 4).length;
  const randomListPattern = /\b([a-z]{3,}\s+){8,}[a-z]{3,}\b/i.test(script) && sentences(script).length <= 2;

  return {
    veryShortRatio,
    weirdLongWords,
    vowelLightWords,
    repeatedRatio,
    fragmentSentences,
    randomListPattern,
    isGibberish: veryShortRatio > 0.32 || weirdLongWords >= 2 || vowelLightWords >= 2 || repeatedRatio > 0.1 || fragmentSentences >= 3 || randomListPattern,
  };
}

function coherenceScore(script) {
  const text = String(script || "");
  const sentenceList = sentences(text);
  const sentenceWordCounts = sentenceList.map((sentence) => words(sentence).length);
  const completeSentences = sentenceWordCounts.filter((count) => count >= 5 && count <= 28).length;
  const transitionHits = hasAny(text, [/\bthen\b/i, /\bbut\b/i, /\bso\b/i, /\bbecause\b/i, /\bwhen\b/i, /\bafter\b/i, /\bsuddenly\b/i, /\bfinally\b/i, /\bnext\b/i, /\bby the end\b/i]);
  const subjectFlow = hasAny(text, [/\b(the|a|an|this|that|he|she|they|we|you|it|berry|friend|friends|character|kid|camera|light|figure|monster|player)\s+\w+/i]);
  const actionFlow = hasAny(text, [/\b(try|tries|tried|carry|carries|carried|roll|rolls|rolled|run|runs|ran|hold|holds|held|share|shares|shared|laugh|laughs|laughed|learn|learns|learned|turn|turns|turned|look|looks|looked|find|finds|found|see|sees|saw|start|starts|started|stop|stops|stopped|open|opens|opened|move|moves|moved|jump|jumps|jumped|show|shows|showed|reveal|reveals|revealed|fall|falls|fell|hear|hears|heard|whisper|whispers|whispered|dance|dances|danced|build|builds|built|play|plays|played|glow|glows|glowed|change|changes|changed|appear|appears|appeared|vanish|vanishes|vanished)\b/i]);
  const hasFlow = sentenceList.length >= 3 && completeSentences >= Math.min(3, sentenceList.length);
  const signals = gibberishSignals(text);
  if (hasFlow && transitionHits && subjectFlow && actionFlow && !signals.isGibberish) return 1;
  if (hasFlow && subjectFlow && actionFlow && !signals.isGibberish) return 0.75;
  if (sentenceList.length >= 2 && !signals.isGibberish) return 0.45;
  return 0.15;
}

function visualFlowScore(script) {
  const text = String(script || "");
  const beatWords = [/\bfirst\b/i, /\bthen\b/i, /\bnext\b/i, /\bafter\b/i, /\bfinally\b/i, /\bsuddenly\b/i, /\bturns?\b/i, /\bshows?\b/i, /\breveals?\b/i, /\bwatch\b/i, /\blook\b/i, /\bcamera\b/i, /\blight\b/i, /\bcharacter\b/i, /\bscene\b/i, /\bby the end\b/i];
  return hasAny(text, beatWords) ? 1 : 0.45;
}

export function scorePostQuality({ post = {}, niche = "", audience = "general" } = {}) {
  const hook = String(post.hook || "");
  const script = String(post.script || "");
  const caption = String(post.caption || "");
  const title = String(post.title || "");
  const allText = `${title}\n${hook}\n${script}\n${caption}`;

  const hookWords = words(hook).length;
  const scriptWords = words(script).length;
  const sentenceList = sentences(script);
  const gibberish = gibberishSignals(script);
  const issues = [];
  const scriptMin = audience === "kids" ? 55 : audience === "teen" ? 55 : 65;
  const scriptMax = audience === "kids" ? 150 : audience === "teen" ? 150 : 175;
  const scores = {
    hookLength: scoreRange(hookWords, 5, 13),
    scriptLength: scoreRange(scriptWords, scriptMin, scriptMax),
    coherence: coherenceScore(script),
    visualFlow: visualFlowScore(script),
    specificity: hasAny(allText, [/\b\d+(\.\d+)?\b/, /\bminute|hour|step|tool|example|today|weekly|daily|camera|door|yard|screen|game|color|character|cookie|friend|sound\b/i]) ? 1 : 0.45,
    retention: hasAny(allText, [/\bhere'?s|but|what if|the thing is|watch|start|stop|mistake|secret|simple|suddenly|wait|look|listen|giant|rainbow|scary|funny\b/i]) ? 1 : 0.45,
    nicheFit: niche && allText.toLowerCase().includes(String(niche).split(/\W+/).find((part) => part.length > 3)?.toLowerCase() || "__missing__") ? 1 : 0.65,
    caption: /#[A-Za-z0-9_]+/.test(caption) && caption.length >= 40 ? 1 : 0.45,
  };

  if (hookWords < 5 || hookWords > 14) issues.push(`Hook should be 5-13 words; got ${hookWords}`);
  if (scriptWords < scriptMin || scriptWords > scriptMax + 10) issues.push(`Script should be ${scriptMin}-${scriptMax} words for a 20-59 second video; got ${scriptWords}`);
  if (sentenceList.length < 3) issues.push("Script needs at least 3 complete sentences that flow together");
  if (gibberish.isGibberish) issues.push("Script looks like gibberish, random words, repetition, or disconnected fragments");
  if (scores.coherence < 0.75) issues.push("Script must read like coherent sentences with subject-action flow");
  if (scores.visualFlow < 0.7) issues.push("Script needs clear visual beats so the video can follow the story");
  if (!scores.specificity || scores.specificity < 0.5) issues.push("Script needs a concrete example, visual, number, tool, or step");
  if (!scores.retention || scores.retention < 0.5) issues.push("Script needs a stronger curiosity or payoff pattern");
  if (!/#/.test(caption)) issues.push("Caption needs hashtags");

  const weighted =
    scores.hookLength * 0.12 +
    scores.scriptLength * 0.14 +
    scores.coherence * 0.26 +
    scores.visualFlow * 0.16 +
    scores.specificity * 0.1 +
    scores.retention * 0.12 +
    scores.nicheFit * 0.05 +
    scores.caption * 0.05;

  return {
    status: weighted >= 0.82 && issues.length === 0 ? "pass" : "fail",
    score: Number(weighted.toFixed(3)),
    scores,
    issues,
    gibberish,
  };
}

export function assertContentQuality(input) {
  const result = scorePostQuality(input);
  if (result.status !== "pass") {
    throw new Error(`QualityGate: post failed quality score ${result.score}: ${result.issues.join("; ")}`);
  }
  return result;
}
