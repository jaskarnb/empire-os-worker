import assert from "node:assert/strict";

const modules = [
  "../src/agents/contentQuality.js",
  "../src/agents/dailyMeeting.js",
  "../src/agents/brainRotMeeting.js",
  "../src/agents/kidsMeeting.js",
  "../src/agents/agentRegistry.js",
  "../src/agents/agentSquads.js",
  "../src/agents/agentOrchestrator.js",
  "../src/agents/railwayRecoveryAgent.js",
  "../src/tools/higgsfield.js",
  "../src/tools/postiz.js",
  "../src/watchers/opsWatchers.js",
];

for (const modulePath of modules) {
  await import(modulePath);
}

const { scorePostQuality } = await import("../src/agents/contentQuality.js");
const { buildRailwayRecoveryPlan } = await import("../src/agents/railwayRecoveryAgent.js");

const quality = scorePostQuality({
  audience: "general",
  niche: "realistic caught-on-camera horror shorts",
  post: {
    title: "Porch Camera Knock",
    hook: "Do not open that door",
    script: "Tonight, the porch camera catches a quiet street with one porch light flickering. At first, nothing moves except rain on the steps. Then three knocks hit the door, but no person is standing there. The camera slowly turns toward the window, and a shadow passes behind the glass from inside the house. Seconds later, the doorknob twists by itself. The room goes silent, the light cuts out, and when it returns, a figure is standing inches from the camera.",
    caption: "The porch camera caught the wrong shadow. Watch the window before the knock. #scary #horror #caughtoncamera #creepy #fyp",
  },
});

assert.equal(quality.status, "pass");
assert.equal(buildRailwayRecoveryPlan({ healthUrl: "https://example.com/health", error: "timeout" }).severity, "P0");
console.log("Startup smoke passed");
