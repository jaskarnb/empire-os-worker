import fs from "fs";
import path from "path";
import { getChannels } from "../tools/postiz.js";
import { assertRenderableVideo } from "../tools/renderGuard.js";
import { runOpsWatchers } from "../watchers/opsWatchers.js";

function pass(name, details = {}) {
  return { name, status: "pass", details };
}

function fail(name, error, details = {}) {
  return { name, status: "fail", error: error instanceof Error ? error.message : String(error), details };
}

function notice(name, details = {}) {
  return { name, status: "notice", details };
}

function overall(checks) {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "notice")) return "notice";
  return "pass";
}

function envFlag(name) {
  return process.env[name] === "true";
}

export async function verifyPostizReady() {
  try {
    const channels = await getChannels();
    if (!channels.length) throw new Error("No connected Postiz channels found");
    return pass("postiz-ready", { channels: channels.length });
  } catch (error) {
    return fail("postiz-ready", error);
  }
}

export async function verifyAgentMediaReady() {
  if (!envFlag("AGENT_MEDIA_ENABLED")) {
    return notice("agentmedia-ready", { enabled: false, note: "AGENT_MEDIA_ENABLED is not true" });
  }
  if (!process.env.AGENT_MEDIA_API_KEY) {
    return fail("agentmedia-ready", "AGENT_MEDIA_ENABLED is true but AGENT_MEDIA_API_KEY is missing");
  }
  return pass("agentmedia-ready", { enabled: true });
}

export async function verifyVideoArtifact(filePath) {
  try {
    const result = await assertRenderableVideo(filePath, { minDuration: 8, requireAudio: true, requireVertical: true });
    return pass("video-artifact", result);
  } catch (error) {
    return fail("video-artifact", error, { filePath });
  }
}

export async function verifyRemoteVideoUrl(url) {
  try {
    if (!/^https?:\/\//i.test(String(url || ""))) throw new Error("Remote video URL is missing or invalid");
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) throw new Error(`Remote video returned ${res.status}`);
    const contentType = res.headers.get("content-type") || "";
    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentType && !/video|octet-stream/i.test(contentType)) {
      throw new Error(`Remote video has unexpected content-type: ${contentType}`);
    }
    if (contentLength > 0 && contentLength < 100_000) {
      throw new Error(`Remote video is too small (${contentLength} bytes)`);
    }
    return pass("remote-video-url", { url, contentType, contentLength });
  } catch (error) {
    return fail("remote-video-url", error, { url });
  }
}

export async function verifyMediaSource(source) {
  return /^https?:\/\//i.test(String(source || ""))
    ? verifyRemoteVideoUrl(source)
    : verifyVideoArtifact(source);
}

export function verifyVideoDirectory() {
  const videoDir = path.resolve(process.env.VIDEO_DIR || "./output/video");
  if (!fs.existsSync(videoDir)) return notice("video-directory", { videoDir, mp4s: 0 });

  const mp4s = fs.readdirSync(videoDir)
    .filter((name) => name.toLowerCase().endsWith(".mp4"))
    .map((name) => path.join(videoDir, name));

  return mp4s.length
    ? pass("video-directory", { videoDir, mp4s: mp4s.length })
    : notice("video-directory", { videoDir, mp4s: 0 });
}

export async function verifyAutomationReady({ requireVideoInventory = false } = {}) {
  const checks = [
    await verifyPostizReady(),
    await verifyAgentMediaReady(),
    verifyVideoDirectory(),
  ];

  if (requireVideoInventory && checks.find((check) => check.name === "video-directory")?.status !== "pass") {
    checks.push(fail("automation-ready", "No verified MP4 inventory exists yet"));
  }

  const status = overall(checks);
  return {
    status,
    ready: status === "pass",
    ts: new Date().toISOString(),
    checks,
  };
}

export async function verifyTaskCompletion({ task = "manual", artifactPath } = {}) {
  const checks = [await verifyAutomationReady()];
  if (artifactPath) checks.push(await verifyMediaSource(artifactPath));

  const flatChecks = checks.flatMap((item) => item.checks || [item]);
  return {
    task,
    status: overall(flatChecks),
    ts: new Date().toISOString(),
    checks: flatChecks,
  };
}

export async function runVerifierAfterTask(task) {
  const taskReport = await verifyTaskCompletion({ task });
  const opsReport = await runOpsWatchers();
  return {
    task,
    status: taskReport.status === "fail" || opsReport.status === "p0" ? "fail" : opsReport.status,
    taskReport,
    opsReport,
  };
}
