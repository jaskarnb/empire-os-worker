/**
 * Remotion server-side renderer.
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { mkdir } from "fs/promises";
import { join, resolve } from "path";

const VIDEO_DIR = process.env.VIDEO_DIR || "./output/video";
const COMPOSITION_ID = "ShortVideo";

let bundleCache = null;

export async function renderVideo(props) {
  await mkdir(VIDEO_DIR, { recursive: true });
  const outPath = join(VIDEO_DIR, `${props.ideaId}.mp4`);

  if (!bundleCache) {
    const entryPoint = resolve("./remotion/Root.jsx");
    console.log("[remotion] bundling…");
    bundleCache = await bundle({ entryPoint, onProgress: (p) => process.stdout.write(`\r  bundle ${p}%`) });
    process.stdout.write("\n");
  }

  const composition = await selectComposition({ serveUrl: bundleCache, id: COMPOSITION_ID, inputProps: props });

  console.log(`[remotion] rendering → ${outPath}`);
  await renderMedia({
    composition, serveUrl: bundleCache, codec: "h264", outputLocation: outPath, inputProps: props,
    concurrency: 1, crf: 23,
    onProgress: ({ progress }) => process.stdout.write(`\r  render ${Math.round(progress * 100)}%`),
  });
  process.stdout.write("\n");
  console.log(`[remotion] done → ${outPath}`);
  return outPath;
}
