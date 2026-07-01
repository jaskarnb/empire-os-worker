export const RAILWAY_RECOVERY_AGENT = {
  id: "railway-recovery-agent",
  name: "Railway Recovery Agent",
  team: "ops",
  mission: "Diagnose Railway deploy/runtime crashes and produce a concrete recovery plan before content automation continues.",
  inputs: ["healthEndpoint", "deployStatus", "lastKnownGoodCommit", "recentCommits", "runtimeError", "opsReport"],
  outputs: ["crashDiagnosis", "rollbackPlan", "redeployPlan", "ownerAction", "postRecoveryChecks"],
};

export function buildRailwayRecoveryPlan({ healthUrl, error, statusCode, body = "", repo = "jaskarnb/empire-os-worker" } = {}) {
  const evidence = [
    healthUrl ? `health=${healthUrl}` : null,
    statusCode ? `status=${statusCode}` : null,
    error ? `error=${error}` : null,
    body ? `body=${String(body).slice(0, 300)}` : null,
  ].filter(Boolean);

  return {
    agent: RAILWAY_RECOVERY_AGENT.name,
    severity: "P0",
    service: "railway-worker",
    problem: "Railway worker health check failed or latest deploy crashed",
    evidence,
    recommendedOwner: "Codex",
    recommendedAction: [
      "Open Railway deployment logs for the latest failed deploy and capture the first startup/build error.",
      `Compare the failed deploy against the last commits in ${repo}; suspect recently changed worker startup, imports, package scripts, or environment assumptions first.`,
      "If production is down, roll back to the last healthy Railway deployment immediately, then patch forward.",
      "Run startup smoke checks before redeploying: import index dependencies, policy smoke, verifier smoke, and a /health request after deploy.",
      "After recovery, run /ops/status and /ops/check, then confirm the dashboard loads and automation is not paused unless intentionally paused.",
    ].join(" "),
    postRecoveryChecks: [
      "/health returns 200",
      "/ops/status returns 200",
      "Railway Watcher reports ok",
      "No P0 incidents remain open in dashboard memory",
      "Postiz and Higgsfield watchers are not blocked",
    ],
  };
}
