import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { mkdirSync } from 'fs';
import { join } from 'path';

const AUDIO_DIR = process.env.AUDIO_DIR ?? './output/audio';

export async function synthesize({ script, ideaId, voice = process.env.DEFAULT_TTS_VOICE ?? 'en-US-AriaNeural' }) {
  mkdirSync(AUDIO_DIR, { recursive: true });
  const outPath = join(AUDIO_DIR, `${ideaId}.mp3`);

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  await tts.toFile(outPath, script);

  return outPath;
}
