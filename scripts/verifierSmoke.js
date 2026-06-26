import { verifyAutomationReady, verifyTaskCompletion } from "../src/agents/verifier.js";

const automation = await verifyAutomationReady();
if (!automation.status || !Array.isArray(automation.checks)) {
  throw new Error("verifyAutomationReady returned an invalid report");
}

const task = await verifyTaskCompletion({ task: "smoke" });
if (!task.status || !Array.isArray(task.checks)) {
  throw new Error("verifyTaskCompletion returned an invalid report");
}

console.log("Verifier smoke passed");
