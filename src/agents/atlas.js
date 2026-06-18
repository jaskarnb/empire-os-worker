// CMD-01 · Atlas — morning standup
import { ask } from "../claude.js";

export async function standup(state) {
  const { pageCount, followersK, revMonth, ideasInPipeline } = state;
  return ask(
    `You are Atlas, chief of a faceless short-form content empire.
State: ${pageCount} pages, ${followersK}k followers, $${revMonth.toLocaleString()}/mo, ${ideasInPipeline} ideas in pipeline.
Write a sharp ~55-word morning briefing: what's working, the single #1 priority today, one number to watch.
Plain text, no markdown.`
  );
}
