/**
 * Edge TTS — free Microsoft neural voices (no API key).
 */
import { EdgeTTS } from "edge-tts";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";

const AUDIO_DIR = process.env.AUDIO_DIR || "./output/audio";

export async function synthesize({ script, ideaId, voice = "en-US-AriaNeural" }) {
  await mkdir(AUDIO_DIR, { recursive: true });
  const outPath = join(AUDIO_DIR, `${ideaId}.mp3`);
  const tts = new EdgeTTS();
  await tts.ttsPromise(script, outPath, voice);
  console.log(`[edge-tts] synthesized → ${outPath}`);
  return outPath;
}

export async function listVoices() {
  const tts = new EdgeTTS();
  return tts.getVoices();
}
