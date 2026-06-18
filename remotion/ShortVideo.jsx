/**
 * ShortVideo composition.
 * Renders: gradient BG → hook text fade-in → scrolling script captions → CTA
 */
import {
  AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";

function splitWords(text, maxChars = 38) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = w;
    } else { current = (current + " " + w).trim(); }
  }
  if (current) lines.push(current.trim());
  return lines;
}

export function ShortVideo({ title, hook, script, niche, accentColor = "#22d3ee", audioPath }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const HOOK_START = 10, HOOK_DUR = 60, SCRIPT_START = 80, OUTRO_START = durationInFrames - 60;

  const hookOpacity = interpolate(frame, [HOOK_START, HOOK_START+20], [0,1], { extrapolateRight: "clamp" });
  const hookY = interpolate(frame, [HOOK_START, HOOK_START+30], [40,0], { extrapolateRight: "clamp" });

  const lines = splitWords(script);
  const framesPerLine = Math.floor((OUTRO_START - SCRIPT_START) / Math.max(lines.length, 1));
  const currentLineIdx = Math.min(Math.floor((frame - SCRIPT_START) / framesPerLine), lines.length - 1);
  const currentLine = frame >= SCRIPT_START ? lines[Math.max(currentLineIdx, 0)] : "";
  const captionOpacity = interpolate(frame, [SCRIPT_START+currentLineIdx*framesPerLine, SCRIPT_START+currentLineIdx*framesPerLine+10], [0,1], { extrapolateRight: "clamp" });
  const outroOpacity = interpolate(frame, [OUTRO_START%�UTRO_START+20], [0,1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: "#05070e", fontFamily: "system-ui, sans-serif" }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 0%, ${accentColor}22 0%, transparent 60%)` }} />
      <AbsoluteFill style={{ backgroundImage: `linear-gradient(rgba(120,160,220,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(120,160,220,0.04) 1px,transparent 1px)`, backgroundSize: "60px 60px" }} />
      <div style={{ position: "absolute", top: 80, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ background: accentColor+"22", border: `1px solid ${accentColor}66`, color: accentColor, padding: "10px 28px", borderRadius: 6, fontSize: 28, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
          {niche}
        </div>
      </div>
      <div style={{ position: "absolute", top: "25%", left: 60, right: 60, opacity: hookOpacity, transform: `translateY(${hookY}px)` }}>
        <div style={{ fontSize: 62, fontWeight: 900, lineHeight: 1.15, color: "#e3ebf5", textAlign: "center" }}>{hook}</div>
      </div>
      {frame >= SCRIPT_START && (
        <div style={{ position: "absolute", bottom: "20%", left: 60, right: 60, opacity: captionOpacity }}>
          <div style={{ background: "rgba(0,0,0,0.72)", borderLeft: `5px solid ${accentColor}`, padding: "22px 30px", borderRadius: 6, fontSize: 46, fontWeight: 700, lineHeight: 1.3, color: "#e3ebf5" }}>
            {currentLine}
          </div>
        </div>
      )}
      {frame >= OUTRO_START && (
        <div style={{ position: "absolute", bottom: 80, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: outroOpacity }}>
          <div style={{ background: accentColor, color: "#05070e", padding: "18px 60px", borderRadius: 6, fontSize: 36, fontWeight: 900 }}>
            FOLLOW FOR MORE ↑
          </div>
        </div>
      )}
      {audioPath && <Audio src={staticFile(audioPath)} />}
    </AbsoluteFill>
  );
}
