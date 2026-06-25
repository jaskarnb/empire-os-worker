import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

process.env.INCIDENT_DIR = path.join(os.tmpdir(), "empire-os-policy-smoke");

const { assertPolicySafePost } = await import("../src/tools/policyGuard.js");

const safePost = {
  title: "3 tiny AI automations that save creators time",
  hook: "This looks small, but it compounds fast.",
  script: "Show one clean workflow, one result, and one reason the viewer can try it today.",
  caption: "A practical AI workflow for creators.",
};

assert.deepEqual(
  assertPolicySafePost({ post: safePost, channelName: "daily-ai", audience: "general", niche: "AI tools" }),
  { ok: true, audience: "general", channelName: "daily-ai" },
);

assert.throws(
  () => assertPolicySafePost({
    post: { title: "Guaranteed profit system", script: "This is risk-free money and you can't lose." },
    channelName: "money-test",
    audience: "general",
    niche: "finance",
  }),
  /misleading financial claim/,
);

assert.throws(
  () => assertPolicySafePost({
    post: { title: "Kids game idea", script: "Ask your viewers to use your parents card to buy robux." },
    channelName: "kids-test",
    audience: "kids",
    niche: "kids gaming",
  }),
  /kids spending prompt/,
);

assert.throws(
  () => assertPolicySafePost({
    post: { title: "Do not publish", script: "password: sk-1234567890abcdefghijklmnopqrstuvwxyz" },
    channelName: "secret-test",
    audience: "general",
    niche: "ops",
  }),
  /secret or credential leak/,
);

console.log("PolicyGuard smoke test passed");
