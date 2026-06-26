import { getAnalyticsSnapshots, getScheduledPosts } from "../tools/opsState.js";

const SEED_NICHES = [
  "AI productivity tools and automation for beginners",
  "personal finance and money habits for young adults",
  "simple fitness transformations and gym consistency",
  "true crime case explainers and psychology",
  "side hustles and online business systems",
  "AI tools for students and creators",
  "home organization and life admin automation",
];

function scoreFromText(niche) {
  const lower = niche.toLowerCase();
  let score = 50;
  if (lower.includes("ai")) score += 18;
  if (lower.includes("money") || lower.includes("finance") || lower.includes("business")) score += 12;
  if (lower.includes("beginner") || lower.includes("simple")) score += 7;
  if (lower.includes("fitness")) score += 6;
  return score;
}

function metricsScore(title, snapshots) {
  const text = String(title || "").toLowerCase();
  let score = 0;
  for (const snapshot of snapshots) {
    for (const post of snapshot.topPosts || []) {
      const postTitle = String(post.title || "").toLowerCase();
      if (text && postTitle.includes(text.split(/\W+/).find((part) => part.length > 4) || "__none__")) {
        score += Number(post.score || 0);
      }
    }
  }
  return Math.min(35, score / 1000);
}

export function runNicheScout() {
  const snapshots = getAnalyticsSnapshots(20);
  const scheduled = getScheduledPosts(100);
  const scheduledCounts = scheduled.reduce((acc, item) => {
    const niche = item.niche || "unknown";
    acc[niche] = (acc[niche] || 0) + 1;
    return acc;
  }, {});

  const recommendations = SEED_NICHES.map((niche) => {
    const scheduledCount = scheduledCounts[niche] || 0;
    const score = Math.round(scoreFromText(niche) + metricsScore(niche, snapshots) - Math.min(18, scheduledCount * 2));
    let action = "test";
    if (score >= 75 && scheduledCount >= 2) action = "scale";
    if (score >= 68 && scheduledCount === 0) action = "launch";
    if (scheduledCount >= 12 && score < 58) action = "kill";
    return {
      niche,
      score,
      action,
      scheduledCount,
      reason: action === "kill"
        ? "Too many scheduled posts without enough signal"
        : action === "scale"
          ? "Strong category with enough scheduled tests"
          : action === "launch"
            ? "High-potential category not yet tested enough"
            : "Keep collecting signal",
    };
  }).sort((a, b) => b.score - a.score);

  return {
    status: "ok",
    generatedAt: new Date().toISOString(),
    recommendations,
    launch: recommendations.filter((item) => item.action === "launch").slice(0, 3),
    scale: recommendations.filter((item) => item.action === "scale").slice(0, 3),
    kill: recommendations.filter((item) => item.action === "kill"),
  };
}
