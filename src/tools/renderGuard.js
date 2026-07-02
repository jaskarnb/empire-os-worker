import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);
const MIN_VIDEO_DURATION_SECONDS = Number(process.env.MIN_VIDEO_DURATION_SECONDS || 20);

async function ffprobeJson(filePath) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    filePath,
  ], { timeout: 30_000 });
  return JSON.parse(stdout);
}

export async function assertRenderableVideo(filePath, options = {}) {
  const minDuration = options.minDuration ?? MIN_VIDEO_DURATION_SECONDS;
  const requireAudio = options.requireAudio ?? true;
  const requireVertical = options.requireVertical ?? true;

  if (!filePath) throw new Error("RenderGuard: missing video path");
  if (path.extname(filePath).toLowerCase() !== ".mp4") {
    throw new Error(`RenderGuard: expected .mp4 output, got ${path.extname(filePath) || "no extension"}`);
  }
  if (!fs.existsSync(filePath)) throw new Error(`RenderGuard: file does not exist: ${filePath}`);

  const stat = fs.statSync(filePath);
  if (stat.size < 100_000) throw new Error(`RenderGuard: video file is too small (${stat.size} bytes)`);

  const probe = await ffprobeJson(filePath);
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");

  if (!video) throw new Error("RenderGuard: no video stream found");
  if (requireAudio && !audio) throw new Error("RenderGuard: no audio stream found");

  const width = Number(video.width || 0);
  const height = Number(video.height || 0);
  if (requireVertical && !(height > width)) {
    throw new Error(`RenderGuard: video is not vertical (${width}x${height})`);
  }

  const duration = Number(probe.format?.duration || video.duration || 0);
  if (!Number.isFinite(duration) || duration < minDuration) {
    throw new Error(`RenderGuard: duration ${duration || 0}s is below ${minDuration}s`);
  }

  return {
    ok: true,
    filePath,
    size: stat.size,
    width,
    height,
    duration,
    hasAudio: Boolean(audio),
    minDuration,
  };
}
