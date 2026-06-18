/**
 * Remotion root — registers the ShortVideo composition.
 */
import { Composition } from "remotion";
import { ShortVideo } from "./ShortVideo.jsx";

export const RemotionRoot = () => (
  <Composition
    id="ShortVideo"
    component={ShortVideo}
    durationInFrames={450}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{
      title: "5 Money Habits That Changed My Life",
      hook: "Most people never learn this in school...",
      script: "Most people are never taught how money actually works. Here are five habits that transformed my finances.",
      niche: "Personal finance",
      accentColor: "#22d3ee",
      audioPath: null,
    }}
  />
);
