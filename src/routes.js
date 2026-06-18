/**
 * All API routes for Empire OS worker.
 */
import { Router } from "express";
import { v4 as uuid } from "uuid";
import { standup }       from "./agents/atlas.js";
import { generateIdeas } from "./agents/muse.js";
import { produce }       from "./agents/smith.js";
import { scanTrends }    from "./agents/scout.js";
import { growthPlan }    from "./agents/ledger.js";
import { scheduleContent } from "./agents/nova.js";
import { synthesize }    from "./tools/edgeTTS.js";
import { renderVideo }   from "./tools/remotion.js";

export const router = Router();
const jobs = new Map();

function startJob(fn) {
  const id = uuid();
  jobs.set(id, { id, status: "pending", createdAt: Date.now() });
  fn().then(
    (result) => jobs.set(id, { id, status: "done", result, finishedAt: Date.now() }),
    (error)  => jobs.set(id, { id, status: "error", error: error.message, finishedAt: Date.now() })
  );
  return id;
}

function ok(res, data)  { res.json({ ok: true, ...data }); }
function err(res, msg, code = 400) { res.status(code).json({ ok: false, error: msg }); }

router.post("/standup", async (req, res) => {
  try { const brief = await standup(req.body); ok(res, { brief }); } catch (e) { err(res, e.message, 500); }
});

router.post("/ideas", async (req, res) => {
  const { niche } = req.body;
  if (!niche) return err(res, "niche required");
  try { const ideas = await generateIdeas(niche); ok(res, { ideas }); } catch (e) { err(res, e.message, 500); }
});

router.post("/forge", async (req, res) => {
  const { niche, title, hook } = req.body;
  if (!title || !hook) return err(res, "title and hook required");
  try { const pkg = await produce({ niche, title, hook }); ok(res, pkg); } catch (e) { err(res, e.message, 500); }
});

router.post("/radar", async (req, res) => {
  try { const report = await scanTrends(); ok(res, { report }); } catch (e) { err(res, e.message, 500); }
});

router.post("/vault", async (req, res) => {
  const { niches, revMonth } = req.body;
  if (!niches || !Array.isArray(niches)) return err(res, "niches[] required");
  try { const plan = await growthPlan({ niches, revMonth: revMonth || 0 }); ok(res, plan); } catch (e) { err(res, e.message, 500); }
});

router.post("/schedule", async (req, res) => {
  const { ideaId, platform, caption, hashtags, videoPath } = req.body;
  if (!caption) return err(res, "caption required");
  try { const result = await scheduleContent({ ideaId, platform, caption, hashtags, videoPath }); ok(res, result); } catch (e) { err(res, e.message, 500); }
});

router.post("/render/tts", async (req, res) => {
  const { script, ideaId, voice } = req.body;
  if (!script) return err(res, "script required");
  try { const audioPath = await synthesize({ script, ideaId: ideaId || uuid(), voice }); ok(res, { audioPath }); } catch (e) { err(res, e.message, 500); }
});

router.post("/render/video", (req, res) => {
  const { title, hook, script, niche, accentColor, audioPath, ideaId } = req.body;
  if (!script) return err(res, "script required");
  const jobId = startJob(() => renderVideo({ title, hook, script, niche, accentColor, audioPath, ideaId: ideaId || uuid() }));
  res.status(202).json({ ok: true, jobId, status: "pending" });
});

router.get("/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return err(res, "job not found", 404);
  ok(res, job);
});
