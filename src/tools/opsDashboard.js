function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function incidentRows(incidents) {
  if (!incidents.length) return '<tr><td colspan="5" class="empty">No incidents recorded.</td></tr>';
  return incidents.map((item) => `<tr>
    <td><span class="severity ${escapeHtml(item.severity)}">${escapeHtml(item.severity)}</span></td>
    <td>${escapeHtml(item.agent)}</td><td>${escapeHtml(item.service)}</td>
    <td>${escapeHtml(item.problem)}</td><td class="ts-cell">${escapeHtml(item.ts)}</td>
  </tr>`).join("");
}

function checkRows(report) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  if (!checks.length) return '<tr><td colspan="4" class="empty">No watcher check has run yet.</td></tr>';
  return checks.map((check) => {
    const details = check.incident || check.details || {};
    return `<tr>
      <td><span class="statusDot ${escapeHtml(check.status)}"></span>${escapeHtml(check.agent)}</td>
      <td class="status-cell ${escapeHtml(check.status)}">${escapeHtml(check.status)}</td>
      <td><span class="severity ${escapeHtml(check.severity)}">${escapeHtml(check.severity)}</span></td>
      <td><code>${escapeHtml(JSON.stringify(details).slice(0,180))}</code></td>
    </tr>`;
  }).join("");
}

export function renderOpsDashboard({ incidents = [], lastReport = null } = {}) {
  const initialStatus  = lastReport?.status || "idle";
  const initialUpdated = lastReport?.finishedAt ? new Date(lastReport.finishedAt).toLocaleTimeString() : "never";
  const initialReport  = lastReport ? escapeHtml(JSON.stringify(lastReport, null, 2)) : "Run a check to populate the report.";
  const incidentCount  = incidents.length;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Empire OS</title>
<style>
*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #05070e;
  color: #e3ebf5;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  font-size: 14px;
  min-height: 100vh;
  background-image:
    radial-gradient(circle at 50% -5%, rgba(34,211,238,0.09) 0%, transparent 55%),
    linear-gradient(rgba(120,160,220,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120,160,220,0.04) 1px, transparent 1px);
  background-size: 100% 100%, 42px 42px, 42px 42px;
}

@keyframes radar { to { transform: rotate(360deg); } }
@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.25; } }

.mono { font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.eyebrow { font-family: ui-monospace,'SF Mono',Menlo,monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #8593ab; }

.header {
  padding: 18px 22px;
  border-bottom: 1px solid rgba(120,160,220,0.16);
  background: linear-gradient(180deg, rgba(16,22,40,.5), transparent);
  display: flex; gap: 20px; align-items: center;
}
.radar-wrap { flex-shrink: 0; }
.radar-svg  { display: block; }
.radar-sweep { transform-origin: 66px 66px; animation: radar 4.5s linear infinite; }
.hdr-title  { font-size: 26px; font-weight: 800; letter-spacing: -1px; margin-top: 5px; }
.hdr-title span { color: #22d3ee; }
.hdr-status { display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: #34d399; font-family: ui-monospace,'SF Mono',Menlo,monospace; margin-top: 8px; }
.hdr-dot { width: 7px; height: 7px; border-radius: 50%; background: #34d399; box-shadow: 0 0 8px #34d399; animation: pulse 2.2s ease-in-out infinite; display: inline-block; }
.stats-row { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.stat-card {
  position: relative; flex: 1; min-width: 100px;
  background: linear-gradient(180deg,rgba(22,30,50,.6),rgba(11,16,28,.6));
  border: 1px solid rgba(120,160,220,0.16); border-radius: 4px; padding: 11px 14px;
}
.stat-val { font-size: 22px; font-weight: 700; color: #22d3ee; margin-top: 5px; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.stat-val.green     { color: #34d399; }
.stat-val.health    { color: #34d399; }
.stat-val.attention { color: #fbbf24; }
.stat-val.bad       { color: #ef4444; }
.stat-sub { font-size: 10px; color: #8593ab; margin-top: 4px; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.bar-track { height: 3px; background: rgba(120,160,220,0.12); border-radius: 2px; overflow: hidden; margin-top: 8px; }
.bar-fill  { height: 100%; width: 0%; background: linear-gradient(90deg,#fbbf24,#fde68a); border-radius: 2px; transition: width .5s ease; }

.tabs { display: flex; gap: 3px; padding: 9px 14px; border-bottom: 1px solid rgba(120,160,220,0.16); overflow-x: auto; }
.tab-btn {
  white-space: nowrap; background: transparent; color: #8593ab;
  border: 1px solid transparent; border-radius: 3px; padding: 7px 13px;
  font-size: 11px; font-weight: 600; font-family: ui-monospace,'SF Mono',Menlo,monospace;
  letter-spacing: .6px; text-transform: uppercase; cursor: pointer; transition: .15s;
}
.tab-btn.active { background: rgba(34,211,238,0.12); color: #22d3ee; border-color: rgba(34,211,238,0.45); box-shadow: 0 0 14px rgba(34,211,238,.2); }
.tab-btn:hover:not(.active) { color: #e3ebf5; }

.body-wrap  { display: flex; }
.main-panel { flex: 1; padding: 20px 22px; overflow-y: auto; max-height: calc(100vh - 240px); }
.tele-panel { width: 230px; border-left: 1px solid rgba(120,160,220,0.16); padding: 14px; overflow-y: auto; max-height: calc(100vh - 240px); background: linear-gradient(180deg,rgba(14,20,36,.4),transparent); }

.panel { position: relative; border: 1px solid rgba(120,160,220,0.16); border-radius: 4px; background: linear-gradient(180deg,rgba(17,24,41,.72),rgba(8,12,22,.72)); padding: 14px; }
.panel-2 { background: linear-gradient(180deg,rgba(22,30,50,.6),rgba(11,16,28,.6)); }
.panel + .panel, .panel + .platDetailCard { margin-top: 10px; }
.section-title { font-size: 18px; font-weight: 700; letter-spacing: -.4px; margin: 5px 0 4px; }
.section-sub   { font-size: 13px; color: #8593ab; margin-bottom: 16px; line-height: 1.5; }
.panelHead  { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid rgba(120,160,220,0.16); }
.panelTitle { font-family: ui-monospace,'SF Mono',Menlo,monospace; font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #e3ebf5; }
.panelBadge { font-size: 10px; font-weight: 700; color: #8593ab; background: rgba(120,160,220,0.08); border: 1px solid rgba(120,160,220,0.16); border-radius: 3px; padding: 2px 8px; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.panelGrid2 { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
.panelGrid3 { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; }
.sec { font-family: ui-monospace,'SF Mono',Menlo,monospace; font-size: 10px; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; color: #8593ab; margin: 0 0 12px; display: flex; align-items: center; gap: 10px; }
.sec::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg,rgba(120,160,220,0.24),transparent); }
.mt { margin-top: 22px; }

.miniList { display: grid; }
.miniItem { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 7px 0; border-bottom: 1px solid rgba(120,160,220,0.08); font-size: 12px; }
.miniItem:last-child  { border-bottom: 0; padding-bottom: 0; }
.miniItem:first-child { padding-top: 0; }
.miniItem strong { font-weight: 600; color: #e3ebf5; font-size: 12px; }
.miniItem span   { color: #8593ab; font-size: 11px; text-align: right; }

.btn { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; border-radius: 3px; padding: 8px 13px; font-size: 11.5px; font-weight: 600; font-family: ui-monospace,'SF Mono',Menlo,monospace; letter-spacing: .4px; text-transform: uppercase; transition: .15s; border: 1px solid; }
.btn-cyan   { color: #22d3ee; border-color: rgba(34,211,238,.5);  background: rgba(34,211,238,.1);  }
.btn-gold   { color: #fbbf24; border-color: rgba(251,191,36,.5);  background: rgba(251,191,36,.1);  }
.btn-green  { color: #34d399; border-color: rgba(52,211,153,.5);  background: rgba(52,211,153,.1);  }
.btn-violet { color: #a855f7; border-color: rgba(168,85,247,.5);  background: rgba(168,85,247,.1);  }
.btn-orange { color: #fb923c; border-color: rgba(251,146,60,.5);  background: rgba(251,146,60,.1);  }
.btn-blue   { color: #60a5fa; border-color: rgba(96,165,250,.5);  background: rgba(96,165,250,.1);  }
.btn-dim    { color: #8593ab; border-color: rgba(120,160,220,0.16); background: rgba(255,255,255,.03); }
.btn:disabled { opacity: .4; cursor: default; }
.btn-row { display: flex; gap: 9px; flex-wrap: wrap; margin-bottom: 16px; }

.team-grid { display: grid; gap: 10px; }
.team-card { border: 1px solid rgba(120,160,220,0.16); border-radius: 4px; padding: 14px; border-left-width: 2px; background: linear-gradient(180deg,rgba(22,30,50,.6),rgba(11,16,28,.6)); }
.agent-node { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,.02); border: 1px solid rgba(120,160,220,0.16); border-radius: 3px; padding: 6px 10px; }
.agent-dot  { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; animation: pulse 2.2s ease-in-out infinite; }
.agent-name { font-size: 12.5px; font-weight: 600; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.agent-role { font-size: 10.5px; color: #525d75; margin-top: 1px; }
.agents-row { display: flex; flex-wrap: wrap; gap: 8px; }

.squadGrid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; }
.squadCard { background: linear-gradient(180deg,rgba(22,30,50,.6),rgba(11,16,28,.6)); border: 1px solid rgba(120,160,220,0.16); border-radius: 4px; border-left-width: 2px; overflow: hidden; cursor: pointer; transition: border-color .2s; }
.squadHeader { padding: 11px 13px; display: flex; align-items: center; justify-content: space-between; }
.squadName   { font-size: 12px; font-weight: 700; color: #e3ebf5; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.squadCount  { font-size: 9.5px; font-weight: 700; color: #8593ab; background: rgba(120,160,220,0.08); border: 1px solid rgba(120,160,220,0.16); border-radius: 2px; padding: 2px 7px; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.squadPhase  { font-size: 10.5px; color: #8593ab; padding: 0 13px 10px; border-bottom: 1px solid rgba(120,160,220,0.16); }
.squadDetail { padding: 11px 13px; display: none; }
.squadCard.open .squadDetail { display: block; }
.squadAgentList { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
.agentTag    { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 600; background: rgba(255,255,255,.02); border: 1px solid rgba(120,160,220,0.16); border-radius: 3px; padding: 4px 8px; color: #e3ebf5; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.agentTagDot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; animation: pulse 2.2s ease-in-out infinite; }
.squadMeta   { display: grid; gap: 4px; }
.squadMetaRow { display: flex; justify-content: space-between; font-size: 11px; }
.squadMetaRow span   { color: #8593ab; }
.squadMetaRow strong { color: #e3ebf5; font-weight: 600; font-family: ui-monospace,'SF Mono',Menlo,monospace; }

.pipeStep     { flex-shrink: 0; background: linear-gradient(180deg,rgba(22,30,50,.6),rgba(11,16,28,.6)); border: 1px solid rgba(120,160,220,0.16); border-radius: 4px; padding: 11px 12px; min-width: 100px; text-align: center; transition: border-color .2s; }
.pipeStep.active { border-color: rgba(34,211,238,0.45); box-shadow: 0 0 12px rgba(34,211,238,0.1); }
.pipeStepNum  { font-size: 9px; font-weight: 700; color: #525d75; letter-spacing: .08em; margin-bottom: 4px; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.pipeStepName { font-size: 11.5px; font-weight: 700; color: #e3ebf5; line-height: 1.3; }
.pipeStepSub  { font-size: 10px; color: #8593ab; margin-top: 3px; }
.pipeArrow    { flex-shrink: 0; width: 24px; text-align: center; color: #525d75; font-size: 12px; }
.pipeBarGrid  { display: grid; gap: 10px; }
.pipeBarRow   { display: grid; grid-template-columns: 66px minmax(0,1fr) 64px; align-items: center; gap: 10px; }
.stepName     { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #8593ab; font-family: ui-monospace,'SF Mono',Menlo,monospace; }

.agentStats    { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.agentStat     { background: linear-gradient(180deg,rgba(22,30,50,.6),rgba(11,16,28,.6)); border: 1px solid rgba(120,160,220,0.16); border-radius: 4px; padding: 10px 14px; display: flex; align-items: baseline; gap: 7px; }
.agentStatVal  { font-size: 20px; font-weight: 800; color: #e3ebf5; letter-spacing: -.5px; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.agentStatVal.g { color: #34d399; }
.agentStatVal.v { color: #22d3ee; }
.agentStatLabel { font-size: 10px; font-weight: 600; color: #8593ab; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.systemsRow    { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 8px; margin-bottom: 16px; }
.sysNode       { background: linear-gradient(180deg,rgba(22,30,50,.6),rgba(11,16,28,.6)); border: 1px solid rgba(120,160,220,0.16); border-radius: 4px; padding: 11px; text-align: center; }
.sysNode.core  { border-color: rgba(34,211,238,0.45); box-shadow: 0 0 10px rgba(34,211,238,0.1); }
.sysNodeDot    { width: 7px; height: 7px; border-radius: 50%; background: #34d399; box-shadow: 0 0 6px #34d399; margin: 0 auto 7px; display: block; animation: pulse 2.2s ease-in-out infinite; }
.sysNodeName   { font-size: 10.5px; font-weight: 700; color: #e3ebf5; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.sysNodeSub    { font-size: 9.5px; color: #8593ab; margin-top: 3px; }
.agentPipeFlow { display: flex; align-items: center; overflow-x: auto; padding: 14px; background: linear-gradient(180deg,rgba(22,30,50,.6),rgba(11,16,28,.6)); border: 1px solid rgba(120,160,220,0.16); border-radius: 4px; scrollbar-width: thin; scrollbar-color: #525d75 transparent; }
.agentPipeNode { flex-shrink: 0; background: linear-gradient(180deg,rgba(17,24,41,.72),rgba(8,12,22,.72)); border: 1px solid rgba(120,160,220,0.16); border-radius: 4px; padding: 9px 11px; min-width: 90px; text-align: center; }
.agentPipeNode.hl { border-color: rgba(34,211,238,0.45); background: rgba(34,211,238,.1); }
.agentPipeName { font-size: 10.5px; font-weight: 700; color: #e3ebf5; line-height: 1.3; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.agentPipeSub  { font-size: 9px; color: #8593ab; margin-top: 2px; }
.agentPipeArr  { flex-shrink: 0; width: 22px; text-align: center; color: #525d75; font-size: 12px; font-weight: 700; }

.platGrid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }
.platCard { background: linear-gradient(180deg,rgba(22,30,50,.6),rgba(11,16,28,.6)); border: 1px solid rgba(120,160,220,0.16); border-radius: 4px; padding: 12px 14px; display: flex; align-items: center; gap: 11px; }
.platIcon { width: 36px; height: 36px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; flex-shrink: 0; font-family: ui-monospace,'SF Mono',Menlo,monospace; letter-spacing: -.5px; }
.plat-tt { background: rgba(255,45,85,.1); border: 1px solid rgba(255,45,85,.25); color: #ff2d55; }
.plat-ig { background: rgba(225,48,108,.1); border: 1px solid rgba(225,48,108,.25); color: #e1306c; }
.plat-yt { background: rgba(255,68,68,.1);  border: 1px solid rgba(255,68,68,.22);  color: #ff4444; }
.platName   { font-size: 12.5px; font-weight: 700; color: #e3ebf5; }
.platStatus { font-size: 10.5px; font-weight: 600; color: #34d399; margin-top: 2px; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.platDot    { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: currentColor; margin-right: 5px; vertical-align: middle; }
.platDetailCard { background: linear-gradient(180deg,rgba(22,30,50,.6),rgba(11,16,28,.6)); border: 1px solid rgba(120,160,220,0.16); border-radius: 4px; overflow: hidden; margin-bottom: 10px; }
.platDetailHead { padding: 14px; display: flex; align-items: center; gap: 13px; border-bottom: 1px solid rgba(120,160,220,0.16); }
.platDetailIcon { width: 40px; height: 40px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; flex-shrink: 0; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.platDetailName { font-size: 15px; font-weight: 800; color: #e3ebf5; }
.platDetailSub  { font-size: 11px; color: #8593ab; margin-top: 2px; }
.platDetailGrid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 0; }
.platStat       { padding: 12px 14px; border-right: 1px solid rgba(120,160,220,0.16); }
.platStat:last-child { border-right: 0; }
.platStatLabel  { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #8593ab; margin-bottom: 5px; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.platStatVal    { font-size: 15px; font-weight: 800; color: #e3ebf5; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.platStatNote   { font-size: 10.5px; color: #8593ab; margin-top: 3px; }

.pill { font-size: 10px; font-weight: 700; border-radius: 3px; padding: 2px 8px; text-align: center; background: rgba(120,160,220,0.06); border: 1px solid rgba(120,160,220,0.16); color: #8593ab; letter-spacing: .5px; font-family: ui-monospace,'SF Mono',Menlo,monospace; text-transform: uppercase; display: inline-block; }
.pill.ok,.pill.ready,.pill.active,.pill.passing,.pill.queued { background: rgba(52,211,153,.1); border-color: rgba(52,211,153,.3); color: #34d399; }
.pill.blocked,.pill.fail { background: rgba(239,68,68,.1); border-color: rgba(239,68,68,.25); color: #ef4444; }

.metricRow  { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px; margin-bottom: 10px; }
.metricCard { background: linear-gradient(180deg,rgba(22,30,50,.6),rgba(11,16,28,.6)); border: 1px solid rgba(120,160,220,0.16); border-radius: 4px; padding: 13px; }
.metricLabel { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #8593ab; margin-bottom: 7px; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.metricVal   { font-size: 24px; font-weight: 800; color: #e3ebf5; letter-spacing: -.4px; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.metricMeta  { font-size: 10.5px; color: #8593ab; margin-top: 5px; }
.recommendBox   { background: rgba(34,211,238,.1); border: 1px solid rgba(34,211,238,.35); border-radius: 4px; padding: 12px 14px; }
.recommendTitle { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #22d3ee; margin-bottom: 8px; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.recommendList  { display: grid; gap: 5px; }
.recommendItem  { font-size: 12px; color: #e3ebf5; display: flex; gap: 7px; align-items: flex-start; }
.recommendItem::before { content: "&#8594;"; color: #22d3ee; flex-shrink: 0; font-weight: 700; font-family: ui-monospace,'SF Mono',Menlo,monospace; }

.healthGrid    { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; }
.healthCard    { background: linear-gradient(180deg,rgba(22,30,50,.6),rgba(11,16,28,.6)); border: 1px solid rgba(120,160,220,0.16); border-radius: 4px; border-top-width: 2px; padding: 13px; }
.healthCard.ok   { border-top-color: #34d399; }
.healthCard.warn { border-top-color: #fbbf24; }
.healthCard.bad  { border-top-color: #ef4444; }
.healthCardName   { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #8593ab; margin-bottom: 5px; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.healthCardStatus { font-size: 13px; font-weight: 700; color: #34d399; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.healthCardStatus.warn { color: #fbbf24; }
.healthCardStatus.bad  { color: #ef4444; }
.healthCardMeta   { font-size: 10.5px; color: #8593ab; margin-top: 3px; }

a { color: #22d3ee; text-decoration: none; }
a:hover { color: #a5f3fc; }
.video-link { display: flex; align-items: center; gap: 9px; padding: 11px 13px; background: rgba(34,211,238,.1); border: 1px solid rgba(34,211,238,.35); border-radius: 4px; font-size: 12.5px; font-weight: 700; color: #22d3ee; font-family: ui-monospace,'SF Mono',Menlo,monospace; transition: all .15s; margin-top: 8px; }

.tableWrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
thead th { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #8593ab; padding: 0 8px 9px; border-bottom: 1px solid rgba(120,160,220,0.16); text-align: left; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
tbody tr { border-bottom: 1px solid rgba(120,160,220,0.08); transition: background .1s; }
tbody tr:hover { background: rgba(120,160,220,0.03); }
tbody tr:last-child { border-bottom: 0; }
tbody td { padding: 9px 8px; vertical-align: middle; color: #e3ebf5; font-size: 12px; }
.ts-cell { color: #8593ab; font-size: 10.5px; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.empty   { color: #525d75; font-size: 12px; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
code { font-size: 10.5px; color: #525d75; font-family: ui-monospace,'SF Mono',Menlo,monospace; }

.severity { display: inline-block; font-size: 9.5px; font-weight: 700; border-radius: 3px; padding: 2px 7px; background: rgba(120,160,220,0.06); border: 1px solid rgba(120,160,220,0.16); color: #8593ab; letter-spacing: .05em; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.severity.P0 { background: rgba(239,68,68,.1);  border-color: rgba(239,68,68,.25);  color: #ef4444; }
.severity.P1 { background: rgba(251,146,60,.1); border-color: rgba(251,146,60,.28); color: #fb923c; }
.severity.P2 { background: rgba(251,191,36,.1); border-color: rgba(251,191,36,.25); color: #fbbf24; }
.severity.P3 { background: rgba(96,165,250,.1); border-color: rgba(96,165,250,.28);  color: #60a5fa; }
.statusDot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 7px; background: #525d75; vertical-align: middle; }
.statusDot.ok,.statusDot.pass    { background: #34d399; box-shadow: 0 0 5px rgba(52,211,153,.5); }
.statusDot.notice                { background: #fbbf24; }
.statusDot.incident,.statusDot.fail { background: #ef4444; box-shadow: 0 0 5px rgba(239,68,68,.4); }
.status-cell { font-weight: 600; text-transform: capitalize; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.status-cell.ok,.status-cell.pass    { color: #34d399; }
.status-cell.notice                  { color: #fbbf24; }
.status-cell.incident,.status-cell.fail { color: #ef4444; }

pre { background: rgba(0,0,0,.4); border: 1px solid rgba(120,160,220,0.16); border-radius: 4px; padding: 12px; font-family: ui-monospace,'SF Mono',Menlo,monospace; font-size: 10.5px; color: #8593ab; white-space: pre-wrap; overflow: auto; max-height: 260px; line-height: 1.7; }

.tele-head { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; }
.tele-dot  { width: 6px; height: 6px; border-radius: 50%; background: #22d3ee; box-shadow: 0 0 6px #22d3ee; animation: pulse 2.2s ease-in-out infinite; }
.log-entry { margin-bottom: 11px; }
.log-who   { display: flex; align-items: center; gap: 6px; }
.log-dot   { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
.log-agent { font-size: 11.5px; font-weight: 700; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.log-time  { margin-left: auto; font-size: 10px; color: #525d75; font-family: ui-monospace,'SF Mono',Menlo,monospace; }
.log-msg   { font-size: 12px; color: #8593ab; padding-left: 11px; margin-top: 2px; line-height: 1.45; }

.notif { position: fixed; bottom: 16px; right: 16px; z-index: 999; background: rgba(17,24,41,.95); border: 1px solid rgba(34,211,238,.4); border-radius: 4px; padding: 12px 16px; font-size: 13px; max-width: 280px; box-shadow: 0 4px 24px rgba(0,0,0,.5); display: none; }
.notif.visible { display: block; }
.hidden { display: none !important; }

@media(max-width:1100px){ .squadGrid,.healthGrid{ grid-template-columns:repeat(2,minmax(0,1fr)) } .platDetailGrid{ grid-template-columns:repeat(2,minmax(0,1fr)) } .metricRow{ grid-template-columns:repeat(2,minmax(0,1fr)) } .tele-panel{ display:none } .main-panel{ max-height:none } }
@media(max-width:720px){ .header{ padding:12px 14px;gap:12px } .radar-wrap{ display:none } .stats-row{ gap:6px } .stat-card{ min-width:80px;padding:9px 11px } .stat-val{ font-size:18px } .main-panel{ padding:14px 12px;max-height:none } .platGrid,.panelGrid2,.panelGrid3,.squadGrid,.healthGrid,.systemsRow{ grid-template-columns:1fr } .platDetailGrid{ grid-template-columns:repeat(2,minmax(0,1fr)) } }
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div class="radar-wrap">
    <svg class="radar-svg" width="110" height="110" viewBox="0 0 132 132">
      <defs>
        <radialGradient id="sw" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#22d3ee" stop-opacity="0"/>
          <stop offset="80%" stop-color="#22d3ee" stop-opacity="0"/>
          <stop offset="100%" stop-color="#22d3ee" stop-opacity="0.35"/>
        </radialGradient>
      </defs>
      <circle cx="66" cy="66" r="20" fill="none" stroke="rgba(120,160,220,0.16)" stroke-width="1"/>
      <circle cx="66" cy="66" r="38" fill="none" stroke="rgba(120,160,220,0.16)" stroke-width="1"/>
      <circle cx="66" cy="66" r="56" fill="none" stroke="rgba(120,160,220,0.16)" stroke-width="1"/>
      <line x1="10" y1="66" x2="122" y2="66" stroke="rgba(120,160,220,0.16)" stroke-width=".6"/>
      <line x1="66" y1="10" x2="66" y2="122" stroke="rgba(120,160,220,0.16)" stroke-width=".6"/>
      <g class="radar-sweep">
        <path d="M66,66 L122,66 A56,56 0 0,1 112.5,35 Z" fill="url(#sw)"/>
        <line x1="66" y1="66" x2="122" y2="66" stroke="#22d3ee" stroke-width="1.4" opacity=".8"/>
      </g>
      <circle cx="90" cy="50" r="3" fill="#fbbf24" style="animation:pulse 2.2s ease-in-out 0s infinite"/>
      <circle cx="42" cy="55" r="3" fill="#60a5fa" style="animation:pulse 2.2s ease-in-out .4s infinite"/>
      <circle cx="78" cy="82" r="3" fill="#a855f7" style="animation:pulse 2.2s ease-in-out .8s infinite"/>
      <circle cx="50" cy="85" r="3" fill="#22d3ee" style="animation:pulse 2.2s ease-in-out 1.2s infinite"/>
      <circle cx="95" cy="75" r="3" fill="#fb923c" style="animation:pulse 2.2s ease-in-out 1.6s infinite"/>
      <circle cx="60" cy="40" r="3" fill="#34d399" style="animation:pulse 2.2s ease-in-out 2s infinite"/>
      <circle cx="66" cy="66" r="3.5" fill="#22d3ee"/>
    </svg>
  </div>
  <div style="flex:1">
    <div class="eyebrow" style="color:#22d3ee">&#9698; Mission control &middot; faceless content network</div>
    <div class="hdr-title">EMPIRE<span>&middot;</span>OS</div>
    <div class="hdr-status">
      <span class="hdr-dot"></span>
      9 SQUADS &middot; 31 AGENTS &middot; AUTONOMOUS &middot;&nbsp;<span id="updated">${escapeHtml(initialUpdated)}</span>
    </div>
    <div class="stats-row">
      <div class="stat-card">
        <div class="eyebrow">System</div>
        <div id="status" class="stat-val">${escapeHtml(initialStatus)}</div>
      </div>
      <div class="stat-card">
        <div class="eyebrow">Incidents</div>
        <div id="incidentCount" class="stat-val">${incidentCount}</div>
        <div class="stat-sub">In memory</div>
      </div>
      <div class="stat-card">
        <div class="eyebrow">Daily Spend</div>
        <div id="spendValue" class="stat-val">$0</div>
        <div id="spendMeta" class="stat-sub">Loading budget</div>
        <div class="bar-track"><div id="spendBar" class="bar-fill"></div></div>
      </div>
      <div class="stat-card">
        <div class="eyebrow">Scheduled</div>
        <div id="scheduledValue" class="stat-val">0</div>
        <div id="scheduledMeta" class="stat-sub">Posts in queue</div>
      </div>
      <div class="stat-card">
        <div class="eyebrow">Generator</div>
        <div id="generatorValue" class="stat-val">HGF</div>
        <div id="generatorMeta" class="stat-sub">Production path</div>
      </div>
    </div>
  </div>
</div>

<!-- TABS -->
<div class="tabs">
  <button class="tab-btn active" onclick="switchTab('overview',this)">&#11041; Overview</button>
  <button class="tab-btn" onclick="switchTab('pipeline',this)">&#9654; Pipeline</button>
  <button class="tab-btn" onclick="switchTab('agents',this)">&#10792; Agents</button>
  <button class="tab-btn" onclick="switchTab('platforms',this)">&#9678; Platforms</button>
  <button class="tab-btn" onclick="switchTab('analytics',this)">&#8599; Analytics</button>
  <button class="tab-btn" onclick="switchTab('ops',this)">&#9874; Ops / Safety</button>
</div>

<div class="body-wrap">
<div class="main-panel">

<!-- TAB: OVERVIEW -->
<div id="tab-overview">
  <div class="eyebrow" style="color:#22d3ee;margin-bottom:6px">Empire OS &middot; Control</div>
  <div class="section-title">Mission Control</div>
  <div class="section-sub">9 squads, 31 agents. Autonomous short-form content pipeline.</div>

  <div class="btn-row">
    <button id="standupBtn" class="btn btn-cyan">&#9654;&#9654; Run Meetings</button>
    <button id="runBtn" class="btn btn-dim">&#9654; Run Check</button>
    <button id="videoBtn" class="btn btn-violet">&#11041; Video Test</button>
    <button id="postizBtn" class="btn btn-blue">&#8599; Postiz</button>
    <button id="e2eBtn" class="btn btn-green">&#11041; E2E</button>
    <button id="pauseBtn" class="btn btn-orange">&#9208; Pause</button>
    <button id="resumeBtn" class="btn btn-dim">&#9654; Resume</button>
  </div>

  <div class="sec">Platforms</div>
  <div class="platGrid">
    <div class="platCard">
      <div class="platIcon plat-tt">TT</div>
      <div><div class="platName">TikTok</div><div class="platStatus"><span class="platDot"></span>Monitoring</div></div>
    </div>
    <div class="platCard">
      <div class="platIcon plat-ig">IG</div>
      <div><div class="platName">Instagram</div><div class="platStatus"><span class="platDot"></span>Monitoring</div></div>
    </div>
    <div class="platCard">
      <div class="platIcon plat-yt">YT</div>
      <div><div class="platName">YouTube Shorts</div><div class="platStatus"><span class="platDot"></span>Monitoring</div></div>
    </div>
  </div>

  <div class="sec mt">Control</div>
  <div class="panelGrid2">
    <div class="panel">
      <div class="panelHead"><div class="panelTitle">Automation State</div></div>
      <div id="controlState" class="miniList">
        <div class="miniItem"><strong>State</strong><span>Loading&hellip;</span></div>
      </div>
    </div>
    <div class="panel">
      <div class="panelHead"><div class="panelTitle">Niche Scout</div></div>
      <div id="nicheState" class="miniList">
        <div class="miniItem"><strong>Signals</strong><span>Waiting</span></div>
      </div>
    </div>
  </div>
</div>


<!-- TAB: PIPELINE -->
<div id="tab-pipeline" class="hidden">
  <div class="eyebrow" style="color:#a855f7;margin-bottom:6px">Niche Scout &rarr; Higgsfield &rarr; Postiz</div>
  <div class="section-title">Video Production Pipeline</div>
  <div class="section-sub">Scout &rarr; Research &rarr; Script &rarr; Video &rarr; Verify &rarr; Publish. Autonomous loop.</div>

  <div style="overflow-x:auto;margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:0;padding:14px;background:linear-gradient(180deg,rgba(22,30,50,.6),rgba(11,16,28,.6));border:1px solid rgba(120,160,220,0.16);border-radius:4px;min-width:840px">
      <div class="pipeStep active"><div class="pipeStepNum">01</div><div class="pipeStepName">Niche Scout</div><div class="pipeStepSub">Trend signals</div></div>
      <div class="pipeArrow">&rarr;</div>
      <div class="pipeStep"><div class="pipeStepNum">02</div><div class="pipeStepName">Reference Research</div><div class="pipeStepSub">Pattern extract</div></div>
      <div class="pipeArrow">&rarr;</div>
      <div class="pipeStep"><div class="pipeStepNum">03</div><div class="pipeStepName">Idea Generation</div><div class="pipeStepSub">Concepts</div></div>
      <div class="pipeArrow">&rarr;</div>
      <div class="pipeStep"><div class="pipeStepNum">04</div><div class="pipeStepName">Hook + Script</div><div class="pipeStepSub">Hook Writer</div></div>
      <div class="pipeArrow">&rarr;</div>
      <div class="pipeStep active"><div class="pipeStepNum">05</div><div class="pipeStepName">Higgsfield Video</div><div class="pipeStepSub">Pro 9:16</div></div>
      <div class="pipeArrow">&rarr;</div>
      <div class="pipeStep"><div class="pipeStepNum">06</div><div class="pipeStepName">Voice + Sound</div><div class="pipeStepSub">Audio dir</div></div>
      <div class="pipeArrow">&rarr;</div>
      <div class="pipeStep"><div class="pipeStepNum">07</div><div class="pipeStepName">Quality Gate</div><div class="pipeStepSub">Pass / Fail</div></div>
      <div class="pipeArrow">&rarr;</div>
      <div class="pipeStep"><div class="pipeStepNum">08</div><div class="pipeStepName">Postiz Schedule</div><div class="pipeStepSub">Auto-queue</div></div>
      <div class="pipeArrow">&rarr;</div>
      <div class="pipeStep"><div class="pipeStepNum">09</div><div class="pipeStepName">Published</div><div class="pipeStepSub">TT / IG / YT</div></div>
    </div>
  </div>
  <div style="text-align:center;font-size:9.5px;font-weight:700;color:#525d75;letter-spacing:.1em;margin-bottom:18px;font-family:ui-monospace,'SF Mono',Menlo,monospace">&#8635; ANALYTICS FEEDBACK LOOP &mdash; BACK TO NICHE SCOUT</div>

  <div class="sec">Pipeline Progress</div>
  <div class="panelGrid2">
    <div class="panel">
      <div class="panelHead"><div class="panelTitle">Stage Progress</div></div>
      <div class="pipeBarGrid">
        <div class="pipeBarRow">
          <div class="stepName">Scout</div>
          <div class="bar-track"><div id="scoutBar" class="bar-fill" style="background:linear-gradient(90deg,#34d399,#6ee7b7)"></div></div>
          <span id="scoutPill" class="pill">Idle</span>
        </div>
        <div class="pipeBarRow">
          <div class="stepName">Create</div>
          <div class="bar-track"><div id="createBar" class="bar-fill" style="background:linear-gradient(90deg,#22d3ee,#60a5fa)"></div></div>
          <span id="createPill" class="pill">HGF</span>
        </div>
        <div class="pipeBarRow">
          <div class="stepName">Verify</div>
          <div class="bar-track"><div id="verifyBar" class="bar-fill" style="background:linear-gradient(90deg,#fbbf24,#fde68a)"></div></div>
          <span id="verifyPill" class="pill">Gated</span>
        </div>
        <div class="pipeBarRow">
          <div class="stepName">Schedule</div>
          <div class="bar-track"><div id="scheduleBar" class="bar-fill" style="background:linear-gradient(90deg,#a855f7,#d8b4fe)"></div></div>
          <span id="schedulePill" class="pill">Postiz</span>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panelHead">
        <div class="panelTitle">Publish Queue</div>
        <div class="panelBadge" id="queueBadge">0 posts</div>
      </div>
      <div id="scheduledState" class="miniList">
        <div class="miniItem"><strong>No posts</strong><span>Queue empty</span></div>
      </div>
    </div>
  </div>

  <div class="sec mt">Latest Video</div>
  <div class="panel" style="max-width:400px">
    <div class="panelHead"><div class="panelTitle">Latest Generation</div></div>
    <a class="video-link" href="/ops/latest-video-page" target="_blank" rel="noreferrer">&#9654; Open video preview</a>
  </div>
</div>


<!-- TAB: AGENTS -->
<div id="tab-agents" class="hidden">
  <div class="eyebrow" style="color:#22d3ee;margin-bottom:6px">9 Squads &middot; 31 Agents</div>
  <div class="section-title">Agent Network</div>
  <div class="section-sub">Click any squad to expand and see agents, last task, and memory.</div>

  <div class="agentStats">
    <div class="agentStat"><div class="agentStatVal">31</div><div class="agentStatLabel">Total Agents</div></div>
    <div class="agentStat"><div class="agentStatVal v">9</div><div class="agentStatLabel">Squads</div></div>
    <div class="agentStat"><div class="agentStatVal g" id="agentSpawnerStatus">Active</div><div class="agentStatLabel">Spawner</div></div>
    <div class="agentStat"><div class="agentStatVal g" id="agentMemoryStatus">Online</div><div class="agentStatLabel">Memory</div></div>
    <div class="agentStat"><div class="agentStatVal" id="agentActiveCount">0</div><div class="agentStatLabel">Active Tasks</div></div>
  </div>

  <div class="sec">Core Systems</div>
  <div class="systemsRow">
    <div class="sysNode core"><span class="sysNodeDot"></span><div class="sysNodeName">Orchestrator</div><div class="sysNodeSub">Coordinates squads</div></div>
    <div class="sysNode core"><span class="sysNodeDot" style="animation-delay:.4s"></span><div class="sysNodeName">Agent Spawner</div><div class="sysNodeSub">Selects + spawns</div></div>
    <div class="sysNode core"><span class="sysNodeDot" style="animation-delay:.8s"></span><div class="sysNodeName">Memory System</div><div class="sysNodeSub">Shared + per-agent</div></div>
    <div class="sysNode core"><span class="sysNodeDot" style="animation-delay:1.2s"></span><div class="sysNodeName">Quality Gate</div><div class="sysNodeSub">Pass / fail</div></div>
    <div class="sysNode core"><span class="sysNodeDot" style="animation-delay:1.6s"></span><div class="sysNodeName">Publisher</div><div class="sysNodeSub">Postiz + schedule</div></div>
  </div>

  <div class="sec mt">Main Agent Flow</div>
  <div style="overflow-x:auto;margin-bottom:6px">
    <div class="agentPipeFlow" style="min-width:880px">
      <div class="agentPipeNode hl"><div class="agentPipeName">Niche Scout</div><div class="agentPipeSub">Trend signals</div></div><div class="agentPipeArr">&rarr;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Reference Research</div><div class="agentPipeSub">Pattern analysis</div></div><div class="agentPipeArr">&rarr;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Content Strategy</div><div class="agentPipeSub">Idea selection</div></div><div class="agentPipeArr">&rarr;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Script + Hook</div><div class="agentPipeSub">Hook Writer</div></div><div class="agentPipeArr">&rarr;</div>
      <div class="agentPipeNode hl"><div class="agentPipeName">Higgsfield Video</div><div class="agentPipeSub">cinematic_v2 pro</div></div><div class="agentPipeArr">&rarr;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Voice + Sound</div><div class="agentPipeSub">Audio direction</div></div><div class="agentPipeArr">&rarr;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Retention Edit</div><div class="agentPipeSub">Pacing check</div></div><div class="agentPipeArr">&rarr;</div>
      <div class="agentPipeNode hl"><div class="agentPipeName">Quality Gate</div><div class="agentPipeSub">Pass / Fail</div></div><div class="agentPipeArr">&rarr;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Postiz Publish</div><div class="agentPipeSub">TT / IG / YT</div></div><div class="agentPipeArr">&rarr;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Analytics Feed</div><div class="agentPipeSub">Performance</div></div><div class="agentPipeArr">&rarr;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Memory Update</div><div class="agentPipeSub">Learn + loop</div></div>
    </div>
  </div>
  <div style="text-align:center;font-size:9.5px;font-weight:700;color:#525d75;letter-spacing:.1em;margin-bottom:20px;font-family:ui-monospace,'SF Mono',Menlo,monospace">&#8635; LOOPS BACK TO NICHE SCOUT / CONTENT STRATEGY</div>

  <div class="sec">Squad Clusters <span style="font-size:10px;color:#8593ab;font-weight:500;letter-spacing:0;text-transform:none">&nbsp;&mdash; click to expand</span></div>
  <div class="squadGrid" id="squadGrid">

    <div class="squadCard" data-squad="horror" style="border-left-color:#ef4444">
      <div class="squadHeader"><div class="squadName">Horror Squad</div><div class="squadCount">13 agents</div></div>
      <div class="squadPhase">Hook/Script &rarr; Higgsfield &rarr; Voice &rarr; Quality Gate</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag"><span class="agentTagDot" style="background:#ef4444;box-shadow:0 0 4px #ef4444"></span>Trend Radar</span><span class="agentTag"><span class="agentTagDot" style="background:#ef4444"></span>Competitor Tracker</span><span class="agentTag"><span class="agentTagDot" style="background:#ef4444"></span>Reference Analyst</span><span class="agentTag"><span class="agentTagDot" style="background:#ef4444"></span>Audience Psychologist</span><span class="agentTag"><span class="agentTagDot" style="background:#ef4444"></span>Content Strategist</span><span class="agentTag"><span class="agentTagDot" style="background:#ef4444"></span>Hook Writer</span><span class="agentTag"><span class="agentTagDot" style="background:#ef4444"></span>Script Doctor</span><span class="agentTag"><span class="agentTagDot" style="background:#ef4444"></span>First Frame Agent</span><span class="agentTag"><span class="agentTagDot" style="background:#ef4444"></span>Higgsfield Director</span><span class="agentTag"><span class="agentTagDot" style="background:#ef4444"></span>Voice Director</span><span class="agentTag"><span class="agentTagDot" style="background:#ef4444"></span>Retention Editor</span><span class="agentTag"><span class="agentTagDot" style="background:#ef4444"></span>Compliance Safety</span><span class="agentTag"><span class="agentTagDot" style="background:#ef4444"></span>Quality Gate</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:#34d399">Ready</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="horror-last">&mdash;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="horror-mem">&mdash;</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="kids" style="border-left-color:#fbbf24">
      <div class="squadHeader"><div class="squadName">Kids Squad</div><div class="squadCount">11 agents</div></div>
      <div class="squadPhase">Hook/Script &rarr; Higgsfield &rarr; Caption SEO &rarr; Quality Gate</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag"><span class="agentTagDot" style="background:#fbbf24"></span>Trend Radar</span><span class="agentTag"><span class="agentTagDot" style="background:#fbbf24"></span>Reference Analyst</span><span class="agentTag"><span class="agentTagDot" style="background:#fbbf24"></span>Audience Psychologist</span><span class="agentTag"><span class="agentTagDot" style="background:#fbbf24"></span>Content Strategist</span><span class="agentTag"><span class="agentTagDot" style="background:#fbbf24"></span>Hook Writer</span><span class="agentTag"><span class="agentTagDot" style="background:#fbbf24"></span>Script Doctor</span><span class="agentTag"><span class="agentTagDot" style="background:#fbbf24"></span>Higgsfield Director</span><span class="agentTag"><span class="agentTagDot" style="background:#fbbf24"></span>Voice Director</span><span class="agentTag"><span class="agentTagDot" style="background:#fbbf24"></span>Caption SEO Agent</span><span class="agentTag"><span class="agentTagDot" style="background:#fbbf24"></span>Compliance Safety</span><span class="agentTag"><span class="agentTagDot" style="background:#fbbf24"></span>Quality Gate</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:#34d399">Ready</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="kids-last">&mdash;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="kids-mem">&mdash;</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="brainrot" style="border-left-color:#60a5fa">
      <div class="squadHeader"><div class="squadName">Brainrot Squad</div><div class="squadCount">12 agents</div></div>
      <div class="squadPhase">Hook/Script &rarr; Higgsfield &rarr; Retention &rarr; Quality Gate</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag"><span class="agentTagDot" style="background:#60a5fa"></span>Trend Radar</span><span class="agentTag"><span class="agentTagDot" style="background:#60a5fa"></span>Competitor Tracker</span><span class="agentTag"><span class="agentTagDot" style="background:#60a5fa"></span>Reference Analyst</span><span class="agentTag"><span class="agentTagDot" style="background:#60a5fa"></span>Content Strategist</span><span class="agentTag"><span class="agentTagDot" style="background:#60a5fa"></span>Hook Writer</span><span class="agentTag"><span class="agentTagDot" style="background:#60a5fa"></span>Script Doctor</span><span class="agentTag"><span class="agentTagDot" style="background:#60a5fa"></span>Higgsfield Director</span><span class="agentTag"><span class="agentTagDot" style="background:#60a5fa"></span>Voice Director</span><span class="agentTag"><span class="agentTagDot" style="background:#60a5fa"></span>Retention Editor</span><span class="agentTag"><span class="agentTagDot" style="background:#60a5fa"></span>Caption SEO Agent</span><span class="agentTag"><span class="agentTagDot" style="background:#60a5fa"></span>Compliance Safety</span><span class="agentTag"><span class="agentTagDot" style="background:#60a5fa"></span>Quality Gate</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:#34d399">Ready</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="brainrot-last">&mdash;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="brainrot-mem">&mdash;</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="niche-discovery" style="border-left-color:#34d399">
      <div class="squadHeader"><div class="squadName">Niche Discovery</div><div class="squadCount">4 agents</div></div>
      <div class="squadPhase">Niche Scout &rarr; Trend analysis &rarr; Launch decisions</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag"><span class="agentTagDot" style="background:#34d399"></span>Trend Radar</span><span class="agentTag"><span class="agentTagDot" style="background:#34d399"></span>Market Analyst</span><span class="agentTag"><span class="agentTagDot" style="background:#34d399"></span>Niche Scorer</span><span class="agentTag"><span class="agentTagDot" style="background:#34d399"></span>Competition Gauge</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:#34d399">Active</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="niche-last">&mdash;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="niche-mem">&mdash;</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="reference" style="border-left-color:#22d3ee">
      <div class="squadHeader"><div class="squadName">Reference Research</div><div class="squadCount">3 agents</div></div>
      <div class="squadPhase">Reference Research &rarr; Pattern extract &rarr; Insight</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag"><span class="agentTagDot" style="background:#22d3ee"></span>Reference Analyst</span><span class="agentTag"><span class="agentTagDot" style="background:#22d3ee"></span>Competitor Tracker</span><span class="agentTag"><span class="agentTagDot" style="background:#22d3ee"></span>Pattern Extractor</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:#34d399">Ready</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="reference-last">&mdash;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="reference-mem">&mdash;</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="publishing" style="border-left-color:#f472b6">
      <div class="squadHeader"><div class="squadName">Publishing Squad</div><div class="squadCount">3 agents</div></div>
      <div class="squadPhase">Quality Gate pass &rarr; Postiz upload &rarr; Schedule</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag"><span class="agentTagDot" style="background:#f472b6"></span>Publishing Controller</span><span class="agentTag"><span class="agentTagDot" style="background:#f472b6"></span>Postiz Uploader</span><span class="agentTag"><span class="agentTagDot" style="background:#f472b6"></span>Schedule Optimizer</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:#34d399">Ready</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="publishing-last">&mdash;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="publishing-mem">&mdash;</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="analytics" style="border-left-color:#a855f7">
      <div class="squadHeader"><div class="squadName">Analytics Feedback</div><div class="squadCount">4 agents</div></div>
      <div class="squadPhase">Post performance &rarr; Niche signals &rarr; Memory</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag"><span class="agentTagDot" style="background:#a855f7"></span>Analytics Watcher</span><span class="agentTag"><span class="agentTagDot" style="background:#a855f7"></span>Hook Evaluator</span><span class="agentTag"><span class="agentTagDot" style="background:#a855f7"></span>Format Ranker</span><span class="agentTag"><span class="agentTagDot" style="background:#a855f7"></span>Memory Writer</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:#34d399">Monitoring</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="analytics-last">&mdash;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="analytics-mem">&mdash;</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="ops-safety" style="border-left-color:#fb923c">
      <div class="squadHeader"><div class="squadName">Ops Safety Squad</div><div class="squadCount">4 agents</div></div>
      <div class="squadPhase">Railway / Higgsfield / Postiz / spend safety</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag"><span class="agentTagDot" style="background:#fb923c"></span>Spend Watcher</span><span class="agentTag"><span class="agentTagDot" style="background:#fb923c"></span>Railway Monitor</span><span class="agentTag"><span class="agentTagDot" style="background:#fb923c"></span>Higgsfield Guard</span><span class="agentTag"><span class="agentTagDot" style="background:#fb923c"></span>Postiz Health</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:#34d399">Watching</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="ops-last">&mdash;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="ops-mem">&mdash;</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="monetization" style="border-left-color:#10b981">
      <div class="squadHeader"><div class="squadName">Monetization Squad</div><div class="squadCount">3 agents</div></div>
      <div class="squadPhase">Revenue paths &rarr; Channel monetization &rarr; Brand ops</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag"><span class="agentTagDot" style="background:#10b981"></span>Revenue Tracker</span><span class="agentTag"><span class="agentTagDot" style="background:#10b981"></span>Brand Deal Scout</span><span class="agentTag"><span class="agentTagDot" style="background:#10b981"></span>Affiliate Optimizer</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:#8593ab">Standby</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="monetization-last">&mdash;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="monetization-mem">&mdash;</strong></div>
        </div>
      </div>
    </div>

  </div>
</div>


<!-- TAB: PLATFORMS -->
<div id="tab-platforms" class="hidden">
  <div class="eyebrow" style="color:#ff2d55;margin-bottom:6px">TikTok &middot; Instagram &middot; YouTube Shorts</div>
  <div class="section-title">Platform Health</div>
  <div class="section-sub">All publishing via Postiz. Real-time monitoring.</div>

  <div class="platDetailCard">
    <div class="platDetailHead">
      <div class="platDetailIcon plat-tt">TT</div>
      <div><div class="platDetailName">TikTok</div><div class="platDetailSub">Short-form video &middot; Primary platform</div></div>
      <div style="margin-left:auto"><span class="pill ok" style="padding:3px 10px">Monitoring</span></div>
    </div>
    <div class="platDetailGrid">
      <div class="platStat"><div class="platStatLabel">Status</div><div class="platStatVal" style="color:#34d399">Connected</div><div class="platStatNote">Via Postiz</div></div>
      <div class="platStat"><div class="platStatLabel">Scheduled</div><div class="platStatVal">&mdash;</div><div class="platStatNote">Waiting</div></div>
      <div class="platStat"><div class="platStatLabel">Last Post</div><div class="platStatVal">&mdash;</div><div class="platStatNote">No posts yet</div></div>
      <div class="platStat"><div class="platStatLabel">Next Post</div><div class="platStatVal">&mdash;</div><div class="platStatNote">Queue empty</div></div>
    </div>
  </div>

  <div class="platDetailCard">
    <div class="platDetailHead">
      <div class="platDetailIcon plat-ig">IG</div>
      <div><div class="platDetailName">Instagram</div><div class="platDetailSub">Reels + Feed &middot; Secondary platform</div></div>
      <div style="margin-left:auto"><span class="pill ok" style="padding:3px 10px">Monitoring</span></div>
    </div>
    <div class="platDetailGrid">
      <div class="platStat"><div class="platStatLabel">Status</div><div class="platStatVal" style="color:#34d399">Connected</div><div class="platStatNote">Via Postiz</div></div>
      <div class="platStat"><div class="platStatLabel">Scheduled</div><div class="platStatVal">&mdash;</div><div class="platStatNote">Waiting</div></div>
      <div class="platStat"><div class="platStatLabel">Last Post</div><div class="platStatVal">&mdash;</div><div class="platStatNote">No posts yet</div></div>
      <div class="platStat"><div class="platStatLabel">Next Post</div><div class="platStatVal">&mdash;</div><div class="platStatNote">Queue empty</div></div>
    </div>
  </div>

  <div class="platDetailCard">
    <div class="platDetailHead">
      <div class="platDetailIcon plat-yt">YT</div>
      <div><div class="platDetailName">YouTube Shorts</div><div class="platDetailSub">Vertical shorts &middot; Long-term SEO</div></div>
      <div style="margin-left:auto"><span class="pill ok" style="padding:3px 10px">Monitoring</span></div>
    </div>
    <div class="platDetailGrid">
      <div class="platStat"><div class="platStatLabel">Status</div><div class="platStatVal" style="color:#34d399">Connected</div><div class="platStatNote">Via Postiz</div></div>
      <div class="platStat"><div class="platStatLabel">Scheduled</div><div class="platStatVal">&mdash;</div><div class="platStatNote">Waiting</div></div>
      <div class="platStat"><div class="platStatLabel">Last Post</div><div class="platStatVal">&mdash;</div><div class="platStatNote">No posts yet</div></div>
      <div class="platStat"><div class="platStatLabel">Next Post</div><div class="platStatVal">&mdash;</div><div class="platStatNote">Queue empty</div></div>
    </div>
  </div>
</div>


<!-- TAB: ANALYTICS -->
<div id="tab-analytics" class="hidden">
  <div class="eyebrow" style="color:#a855f7;margin-bottom:6px">Analytics Feedback Squad</div>
  <div class="section-title">Performance Analytics</div>
  <div class="section-sub">Post performance, niche signals, and agent recommendations.</div>

  <div class="sec">Performance Metrics</div>
  <div class="metricRow">
    <div class="metricCard"><div class="metricLabel">Total Views</div><div class="metricVal">&mdash;</div><div class="metricMeta">Awaiting first post</div></div>
    <div class="metricCard"><div class="metricLabel">Likes</div><div class="metricVal">&mdash;</div><div class="metricMeta">Awaiting data</div></div>
    <div class="metricCard"><div class="metricLabel">Comments</div><div class="metricVal">&mdash;</div><div class="metricMeta">Awaiting data</div></div>
    <div class="metricCard"><div class="metricLabel">Shares</div><div class="metricVal">&mdash;</div><div class="metricMeta">Awaiting data</div></div>
  </div>

  <div class="sec mt">Performance Snapshots</div>
  <div class="panel">
    <div class="panelHead"><div class="panelTitle">Analytics Data</div></div>
    <div id="performanceState" class="miniList">
      <div class="miniItem"><strong>Waiting</strong><span>Analytics appear after posts publish</span></div>
    </div>
  </div>

  <div class="sec mt">Niche Intelligence</div>
  <div class="panelGrid2">
    <div class="panel">
      <div class="panelHead"><div class="panelTitle">Top Niche Signals</div></div>
      <div class="miniList" id="nicheAnalytics">
        <div class="miniItem"><strong>No signals yet</strong><span>Run niche scout</span></div>
      </div>
    </div>
    <div class="panel">
      <div class="panelHead"><div class="panelTitle">Agent Recommendations</div></div>
      <div class="recommendBox" style="margin:0">
        <div class="recommendTitle">What to make next</div>
        <div class="recommendList" id="agentRecommends">
          <div class="recommendItem">Run a check to get agent recommendations</div>
        </div>
      </div>
    </div>
  </div>

  <div class="sec mt">Winning Patterns</div>
  <div class="panelGrid3">
    <div class="panel"><div class="panelHead"><div class="panelTitle">Best Hooks</div></div><div id="bestHooks" class="miniList"><div class="miniItem"><strong>Waiting</strong><span>No data yet</span></div></div></div>
    <div class="panel"><div class="panelHead"><div class="panelTitle">Best Formats</div></div><div id="bestFormats" class="miniList"><div class="miniItem"><strong>Waiting</strong><span>No data yet</span></div></div></div>
    <div class="panel"><div class="panelHead"><div class="panelTitle">Best Niches</div></div><div id="bestNiches" class="miniList"><div class="miniItem"><strong>Waiting</strong><span>No data yet</span></div></div></div>
  </div>
</div>


<!-- TAB: OPS / SAFETY -->
<div id="tab-ops" class="hidden">
  <div class="eyebrow" style="color:#fb923c;margin-bottom:6px">Ops Safety Squad</div>
  <div class="section-title">Ops &amp; Safety</div>
  <div class="section-sub">Railway health, Higgsfield status, spend safety, and incident log.</div>

  <div class="sec">Service Health</div>
  <div class="healthGrid">
    <div class="healthCard ok">
      <div class="healthCardName">Railway</div>
      <div class="healthCardStatus">Online</div>
      <div class="healthCardMeta">Worker deployed</div>
    </div>
    <div class="healthCard ok">
      <div class="healthCardName">Higgsfield</div>
      <div class="healthCardStatus" id="hgfHealthStatus">Checking&hellip;</div>
      <div class="healthCardMeta" id="hgfHealthMeta">cinematic_studio_video_v2</div>
    </div>
    <div class="healthCard ok">
      <div class="healthCardName">Postiz</div>
      <div class="healthCardStatus">Monitoring</div>
      <div class="healthCardMeta">Scheduling layer</div>
    </div>
  </div>

  <div class="sec mt">Automation State</div>
  <div class="panelGrid2">
    <div class="panel">
      <div class="panelHead"><div class="panelTitle">Control</div></div>
      <div id="controlStateOps" class="miniList">
        <div class="miniItem"><strong>State</strong><span>Loading&hellip;</span></div>
      </div>
    </div>
    <div class="panel">
      <div class="panelHead"><div class="panelTitle">Budget</div></div>
      <div class="miniList">
        <div class="miniItem"><strong>Daily Spend</strong><span id="opsSpendDisplay">$0.00</span></div>
        <div class="miniItem"><strong>Budget Cap</strong><span id="opsBudgetDisplay">No cap set</span></div>
        <div class="miniItem"><strong>Status</strong><span style="color:#34d399;font-family:ui-monospace,'SF Mono',Menlo,monospace">Safe</span></div>
      </div>
    </div>
  </div>

  <div class="sec mt">Watcher Health</div>
  <div class="panel">
    <div class="panelHead">
      <div class="panelTitle">Agent Checks</div>
      <div class="panelBadge" id="watcherCount">&mdash; agents</div>
    </div>
    <div class="tableWrap">
      <table>
        <thead><tr><th>Agent</th><th>Status</th><th>Severity</th><th>Details</th></tr></thead>
        <tbody id="checkRows">${checkRows(lastReport)}</tbody>
      </table>
    </div>
  </div>

  <div class="sec mt">Diagnostic Report</div>
  <div class="panel">
    <div class="panelHead"><div class="panelTitle">Last Report</div></div>
    <pre id="report">${initialReport}</pre>
  </div>

  <div class="sec mt">Incident Memory</div>
  <div class="panel">
    <div class="tableWrap">
      <table>
        <thead><tr><th>Severity</th><th>Agent</th><th>Service</th><th>Problem</th><th>Time</th></tr></thead>
        <tbody id="incidentRows">${incidentRows(incidents)}</tbody>
      </table>
    </div>
  </div>
</div>

</div><!-- /main-panel -->

<!-- TELEMETRY -->
<div class="tele-panel">
  <div class="tele-head">
    <span class="tele-dot"></span>
    <span class="eyebrow" style="color:#22d3ee">Telemetry</span>
  </div>
  <div id="tele-log">
    <div class="log-entry">
      <div class="log-who"><span class="log-dot" style="background:#34d399"></span><span class="log-agent" style="color:#34d399">System</span><span class="log-time">--:--</span></div>
      <div class="log-msg">Empire OS online. Awaiting commands.</div>
    </div>
  </div>
</div>
</div><!-- /body-wrap -->

<div id="notif" class="notif"></div>

<script>
function nowt() { return new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
function pushLog(agent, color, msg) {
  var el = document.getElementById('tele-log');
  var div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = '<div class="log-who"><span class="log-dot" style="background:'+color+'"></span><span class="log-agent" style="color:'+color+'">'+agent+'</span><span class="log-time">'+nowt()+'</span></div><div class="log-msg">'+msg+'</div>';
  el.prepend(div);
  while(el.children.length > 20) el.removeChild(el.lastChild);
}
function showNotif(msg, color) {
  var n = document.getElementById('notif');
  n.style.borderColor = (color||'#22d3ee')+'70';
  n.textContent = msg;
  n.classList.add('visible');
  setTimeout(function(){ n.classList.remove('visible'); }, 4000);
}
function switchTab(id, btn) {
  document.querySelectorAll('[id^="tab-"]').forEach(function(el){ el.classList.add('hidden'); });
  document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
  document.getElementById('tab-'+id).classList.remove('hidden');
  btn.classList.add('active');
}

document.querySelectorAll('.squadCard').forEach(function(card){
  card.addEventListener('click', function(){ card.classList.toggle('open'); });
});

var standupBtn       = document.getElementById('standupBtn');
var runBtn           = document.getElementById('runBtn');
var videoBtn         = document.getElementById('videoBtn');
var postizBtn        = document.getElementById('postizBtn');
var e2eBtn           = document.getElementById('e2eBtn');
var pauseBtn         = document.getElementById('pauseBtn');
var resumeBtn        = document.getElementById('resumeBtn');
var statusEl         = document.getElementById('status');
var reportEl         = document.getElementById('report');
var updatedEl        = document.getElementById('updated');
var incidentCountEl  = document.getElementById('incidentCount');
var incidentRowsEl   = document.getElementById('incidentRows');
var checkRowsEl      = document.getElementById('checkRows');
var controlStateEl   = document.getElementById('controlState');
var scheduledStateEl = document.getElementById('scheduledState');
var nicheStateEl     = document.getElementById('nicheState');
var performanceStateEl = document.getElementById('performanceState');
var spendValueEl     = document.getElementById('spendValue');
var spendMetaEl      = document.getElementById('spendMeta');
var spendBarEl       = document.getElementById('spendBar');
var scheduledValueEl = document.getElementById('scheduledValue');
var scheduledMetaEl  = document.getElementById('scheduledMeta');
var generatorValueEl = document.getElementById('generatorValue');
var generatorMetaEl  = document.getElementById('generatorMeta');

function esc(value){ return String(value??'').replace(/[&<>']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;'}[c]||c; }); }
function money(value){ var n=Number(value||0); return '$'+n.toFixed(n>=10?0:2); }
function setStatusClass(el,status){
  el.classList.remove('health','attention','bad');
  var l=String(status||'').toLowerCase();
  if(['ok','pass','running'].includes(l)) el.classList.add('health');
  else if(['p0','fail','error','incident'].includes(l)) el.classList.add('bad');
  else el.classList.add('attention');
}
function updatePill(id,text){
  var el=document.getElementById(id); if(!el) return;
  el.textContent=text; el.className='pill '+text;
}

function drawIncidents(incidents){
  incidentCountEl.textContent=incidents.length;
  incidentRowsEl.innerHTML=incidents.length
    ?incidents.map(function(item){
        return '<tr><td><span class="severity '+esc(item.severity)+'">'+esc(item.severity)+'</span></td>'+
          '<td>'+esc(item.agent)+'</td><td>'+esc(item.service)+'</td>'+
          '<td>'+esc(item.problem)+'</td><td class="ts-cell">'+esc(item.ts)+'</td></tr>';
      }).join('')
    :'<tr><td colspan="5" class="empty">No incidents recorded.</td></tr>';
}

function drawChecks(report){
  var checks=Array.isArray(report&&report.checks)?report.checks:[];
  var badge=document.getElementById('watcherCount');
  if(badge) badge.textContent=checks.length+' agent'+(checks.length!==1?'s':'');
  var hgf=checks.find(function(c){ return String(c.agent||'').toLowerCase().includes('higgsfield'); });
  if(hgf){
    generatorValueEl.textContent=hgf.status==='ok'?'Ready':'Blocked';
    generatorMetaEl.textContent=hgf.status==='ok'?'Higgsfield active':'No fallback posting';
    setStatusClass(generatorValueEl,hgf.status==='ok'?'ok':'fail');
    var hgfS=document.getElementById('hgfHealthStatus');
    if(hgfS){ hgfS.textContent=hgf.status==='ok'?'Ready':'Blocked'; hgfS.className='healthCardStatus'+(hgf.status==='ok'?'':' bad'); }
  }
  checkRowsEl.innerHTML=checks.length
    ?checks.map(function(check){
        var d=check.incident||check.details||{};
        return '<tr><td><span class="statusDot '+esc(check.status)+'"></span>'+esc(check.agent)+'</td>'+
          '<td class="status-cell '+esc(check.status)+'">'+esc(check.status)+'</td>'+
          '<td><span class="severity '+esc(check.severity)+'">'+esc(check.severity)+'</span></td>'+
          '<td><code>'+esc(JSON.stringify(d).slice(0,180))+'</code></td></tr>';
      }).join('')
    :'<tr><td colspan="4" class="empty">No watcher check has run yet.</td></tr>';
}

function drawOpsState(data){
  var control=data.control||{};
  var spend=data.spend||{};
  var scheduled=data.scheduledPosts||[];
  var runs=data.automationRuns||[];
  var analytics=data.analytics||[];
  var dailyBudget=Number(spend.dailyBudget||0);
  var estimatedSpend=Number(spend.estimatedSpend||0);
  var spendPct=dailyBudget>0?Math.min(100,Math.round((estimatedSpend/dailyBudget)*100)):0;
  var upcoming=scheduled.filter(function(p){ return Date.parse(p.scheduledFor||'')>Date.now(); }).length;

  spendValueEl.textContent=money(estimatedSpend);
  spendMetaEl.textContent=dailyBudget>0?spendPct+'% of '+money(dailyBudget)+' cap':'No cap set';
  spendBarEl.style.width=spendPct+'%';
  scheduledValueEl.textContent=String(scheduled.length);
  scheduledMetaEl.textContent=upcoming+' upcoming';

  var qb=document.getElementById('queueBadge');
  if(qb) qb.textContent=scheduled.length+' post'+(scheduled.length!==1?'s':'');
  var opsSpend=document.getElementById('opsSpendDisplay');
  var opsBudget=document.getElementById('opsBudgetDisplay');
  if(opsSpend)  opsSpend.textContent=money(estimatedSpend);
  if(opsBudget) opsBudget.textContent=dailyBudget>0?money(dailyBudget):'No cap set';

  var paused=control.paused;
  var stateHtml='<div class="miniItem"><strong>State</strong><span style="color:'+(paused?'#fbbf24':'#34d399')+';font-weight:700;font-family:ui-monospace,monospace">'+esc(paused?'Paused':'Running')+'</span></div>'+
    '<div class="miniItem"><strong>Note</strong><span>'+esc(control.reason||'No note')+'</span></div>';
  controlStateEl.innerHTML=stateHtml;
  var opsControl=document.getElementById('controlStateOps');
  if(opsControl) opsControl.innerHTML=stateHtml;

  scheduledStateEl.innerHTML=scheduled.length
    ?scheduled.slice(0,6).map(function(p){
        return '<div class="miniItem"><strong>'+esc(p.title||'Untitled')+'</strong><span>'+esc(p.channelName||'channel')+'</span></div>';
      }).join('')
    :runs.length
      ?runs.slice(0,3).map(function(run){
          var label=(run.reason||run.type||'automation')+' - '+(run.status||'unknown');
          var detail=run.error||((run.result&&run.result.results)||[]).slice(-1)[0]||'No scheduled post yet';
          return '<div class="miniItem"><strong>'+esc(label)+'</strong><span>'+esc(detail)+'</span></div>';
        }).join('')
      :'<div class="miniItem"><strong>No posts</strong><span>Queue empty</span></div>';

  performanceStateEl.innerHTML=analytics.length
    ?analytics.slice(0,4).map(function(item,i){
        return '<div class="miniItem"><strong>Snapshot '+(i+1)+'</strong><span>'+esc(item.measurable||0)+' measurable posts</span></div>';
      }).join('')
    :'<div class="miniItem"><strong>Waiting</strong><span>Analytics appear after posts publish</span></div>';

  fetch('/ops/niches').then(function(r){ return r.json(); }).then(function(niches){
    var top=(niches.recommendations||[]).slice(0,5);
    var html=top.length
      ?top.map(function(item){ return '<div class="miniItem"><strong>'+esc(item.niche)+'</strong><span>Score '+esc(item.score)+'</span></div>'; }).join('')
      :'<div class="miniItem"><strong>No signals</strong><span>Scout waiting</span></div>';
    nicheStateEl.innerHTML=html;
    var na=document.getElementById('nicheAnalytics');
    if(na) na.innerHTML=html;
    document.getElementById('scoutBar').style.width=top.length?'100%':'35%';
    updatePill('scoutPill',top.length?'active':'waiting');
  }).catch(function(){ nicheStateEl.innerHTML='<div class="miniItem"><strong>Scout offline</strong><span>Retry later</span></div>'; });

  var genBlocked=generatorValueEl.textContent==='Blocked';
  document.getElementById('createBar').style.width=genBlocked?'35%':'100%';
  document.getElementById('verifyBar').style.width=scheduled.length?'100%':'55%';
  document.getElementById('scheduleBar').style.width=upcoming?'100%':'45%';
  updatePill('createPill',genBlocked?'blocked':'ready');
  updatePill('verifyPill',scheduled.length?'passing':'waiting');
  updatePill('schedulePill',upcoming?'queued':'empty');
}

async function refreshStatus(){
  var res=await fetch('/ops/status');
  var data=await res.json();
  drawIncidents(data.recentIncidents||[]);
  drawOpsState(data);
  if(data.lastReport){
    statusEl.textContent=data.lastReport.status||'unknown';
    setStatusClass(statusEl,data.lastReport.status);
    reportEl.textContent=JSON.stringify(data.lastReport,null,2);
    updatedEl.textContent=data.lastReport.finishedAt
      ?new Date(data.lastReport.finishedAt).toLocaleTimeString()
      :new Date().toLocaleTimeString();
    drawChecks(data.lastReport);
  }
}

async function postJson(path,button,label,body){
  body=body||{};
  button.disabled=true;
  statusEl.textContent=label;
  setStatusClass(statusEl,'notice');
  reportEl.textContent=label+'...';
  try{
    var res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var data=await res.json();
    statusEl.textContent=data.status||'unknown';
    setStatusClass(statusEl,data.status);
    reportEl.textContent=JSON.stringify(data,null,2);
    if(data.checks)          drawChecks(data);
    if(data.recentIncidents) drawIncidents(data.recentIncidents);
    await refreshStatus();
    showNotif(label+' complete','#34d399');
  }catch(e){
    statusEl.textContent='error';
    setStatusClass(statusEl,'fail');
    reportEl.textContent=e.message;
    showNotif('Error: '+e.message,'#ef4444');
    pushLog('System','#ef4444','Error: '+e.message);
  }finally{
    updatedEl.textContent=new Date().toLocaleTimeString();
    button.disabled=false;
  }
}

async function fetchAgents(){
  try{
    var res=await fetch('/ops/agents');
    var data=await res.json();
    if(data.activeCount!==undefined){ var el=document.getElementById('agentActiveCount'); if(el) el.textContent=data.activeCount; }
    var spawnerEl=document.getElementById('agentSpawnerStatus');
    if(spawnerEl&&data.spawnerStatus) spawnerEl.textContent=data.spawnerStatus;
    var memoryEl=document.getElementById('agentMemoryStatus');
    if(memoryEl&&data.memoryStatus) memoryEl.textContent=data.memoryStatus;
    if(data.squads){
      data.squads.forEach(function(squad){
        var lastEl=document.getElementById(squad.id+'-last');
        var memEl=document.getElementById(squad.id+'-mem');
        if(lastEl) lastEl.textContent=squad.lastTask||'No task yet';
        if(memEl)  memEl.textContent=squad.memoryCount!==undefined?squad.memoryCount+' notes':'No notes';
      });
    }
  }catch(e){ /* endpoint not yet live */ }
}

async function fetchAgentMemory(){
  try{
    var res=await fetch('/ops/agent-memory');
    var data=await res.json();
    if(data.recommendations&&data.recommendations.length){
      var el=document.getElementById('agentRecommends');
      if(el) el.innerHTML=data.recommendations.map(function(r){ return '<div class="recommendItem">'+esc(r)+'</div>'; }).join('');
    }
  }catch(e){ /* endpoint not yet live */ }
}

standupBtn.addEventListener('click', function(){
  pushLog('Atlas','#22d3ee','Triggering all 3 Empire meetings — Daily, BrainRot, Kids…');
  postJson('/ops/run-standup',standupBtn,'running');
});
runBtn.addEventListener('click', function(){
  pushLog('Ops','#22d3ee','Running watcher check…');
  postJson('/ops/check',runBtn,'running');
});
videoBtn.addEventListener('click', function(){
  pushLog('Higgsfield Director','#a855f7','Generating horror video — cinematic_studio_video_v2…');
  postJson('/ops/video-test',videoBtn,'generating',{
    niche:'realistic caught-on-camera horror videos',
    style:'horror',
    hook:'My dog would not stop barking at the yard',
    script:'Dark backyard. Motion sensor trips. Camera pans right. Something standing at the fence line. Light cuts to black.'
  });
});
postizBtn.addEventListener('click', function(){
  pushLog('Nova','#60a5fa','Scheduling post via Postiz…');
  postJson('/ops/postiz-test',postizBtn,'scheduling');
});
e2eBtn.addEventListener('click', function(){
  pushLog('Atlas','#34d399','Running end-to-end test…');
  postJson('/ops/e2e-test',e2eBtn,'running-e2e');
});
pauseBtn.addEventListener('click', function(){
  pushLog('Atlas','#fb923c','Pausing automation…');
  postJson('/ops/pause',pauseBtn,'pausing',{reason:'Paused from Empire OS'});
});
resumeBtn.addEventListener('click', function(){
  pushLog('Atlas','#34d399','Resuming automation…');
  postJson('/ops/resume',resumeBtn,'resuming',{reason:'Resumed from Empire OS'});
});

setStatusClass(statusEl,'${escapeHtml(initialStatus)}');
pushLog('System','#22d3ee','Dashboard loaded. Fetching status…');
refreshStatus().catch(function(){ pushLog('System','#ef4444','Could not reach worker.'); });
fetchAgents().catch(function(){});
fetchAgentMemory().catch(function(){});
<\/script>
</body>
</html>`;
}
