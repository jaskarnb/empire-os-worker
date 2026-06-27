function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function incidentRows(incidents) {
  if (!incidents.length) {
    return "<tr><td colspan=\"5\" class=\"empty\">No incidents recorded.</td></tr>";
  }
  return incidents.map((item) => `
    <tr>
      <td><span class="severity ${escapeHtml(item.severity)}">${escapeHtml(item.severity)}</span></td>
      <td>${escapeHtml(item.agent)}</td>
      <td>${escapeHtml(item.service)}</td>
      <td>${escapeHtml(item.problem)}</td>
      <td class="ts-cell">${escapeHtml(item.ts)}</td>
    </tr>
  `).join("");
}

function checkRows(report) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  if (!checks.length) return "<tr><td colspan=\"4\" class=\"empty\">No watcher check has run yet.</td></tr>";
  return checks.map((check) => {
    const details = check.incident || check.details || {};
    return `
      <tr>
        <td><span class="statusDot ${escapeHtml(check.status)}"></span>${escapeHtml(check.agent)}</td>
        <td class="status-cell ${escapeHtml(check.status)}">${escapeHtml(check.status)}</td>
        <td><span class="severity ${escapeHtml(check.severity)}">${escapeHtml(check.severity)}</span></td>
        <td><code>${escapeHtml(JSON.stringify(details).slice(0, 180))}</code></td>
      </tr>
    `;
  }).join("");
}

export function renderOpsDashboard({ incidents = [], lastReport = null } = {}) {
  const initialStatus = lastReport?.status || "idle";
  const initialUpdated = lastReport?.finishedAt ? new Date(lastReport.finishedAt).toLocaleTimeString() : "never";
  const initialReport = lastReport ? escapeHtml(JSON.stringify(lastReport, null, 2)) : "Run a check to populate the report.";
  const incidentCount = incidents.length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Empire OS</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg:     #080810;
      --s1:     #0d0d1c;
      --s2:     #111124;
      --s3:     #16162e;
      --b:      rgba(255,255,255,0.06);
      --b2:     rgba(255,255,255,0.10);
      --b3:     rgba(255,255,255,0.16);
      --v:      #7c3aed;
      --v2:     #a78bfa;
      --v-dim:  rgba(124,58,237,0.14);
      --v-glow: rgba(124,58,237,0.35);
      --green:  #22c55e;
      --g-dim:  rgba(34,197,94,0.12);
      --g-bdr:  rgba(34,197,94,0.25);
      --red:    #ef4444;
      --r-dim:  rgba(239,68,68,0.10);
      --r-bdr:  rgba(239,68,68,0.22);
      --amber:  #f59e0b;
      --a-dim:  rgba(245,158,11,0.10);
      --a-bdr:  rgba(245,158,11,0.22);
      --blue:   #6366f1;
      --b-dim:  rgba(99,102,241,0.12);
      --b-bdr:  rgba(99,102,241,0.25);
      --tt:     #ff2d55; --tt-dim: rgba(255,45,85,0.10);  --tt-bdr: rgba(255,45,85,0.22);
      --ig:     #e1306c; --ig-dim: rgba(225,48,108,0.10); --ig-bdr: rgba(225,48,108,0.22);
      --yt:     #ff4444; --yt-dim: rgba(255,68,68,0.10);  --yt-bdr: rgba(255,68,68,0.18);
      --ink:    #f0f0ff;
      --ink2:   #a0a0c0;
      --muted:  #50507a;
      --dim:    #2a2a4a;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:var(--bg);color:var(--ink);font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased}

    /* ── HEADER ── */
    header{background:rgba(13,13,28,0.98);backdrop-filter:blur(12px);border-bottom:1px solid var(--b);padding:0 24px;height:58px;display:flex;align-items:center;justify-content:space-between;gap:12px;position:sticky;top:0;z-index:200}
    .logo{display:flex;align-items:center;gap:10px}
    .logo-mark{width:33px;height:33px;background:linear-gradient(135deg,#7c3aed,#4f46e5);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 0 14px rgba(124,58,237,0.45);flex-shrink:0}
    .logo-name{font-size:16px;font-weight:800;letter-spacing:-0.4px;background:linear-gradient(135deg,#fff 0%,#c4b5fd 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .logo-tag{font-size:10px;font-weight:600;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-top:1px}
    .live-badge{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.05em;color:var(--green);background:var(--g-dim);border:1px solid var(--g-bdr);border-radius:20px;padding:4px 11px;flex-shrink:0}
    .live-dot{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 7px var(--green);animation:pulse 2s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
    .hdr-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .actions{display:flex;gap:5px;flex-wrap:wrap}
    button{font-family:'Inter',sans-serif;font-size:11px;font-weight:600;border-radius:7px;padding:6px 12px;cursor:pointer;border:1px solid var(--b2);background:var(--b);color:var(--ink2);transition:all .15s}
    button:hover{background:var(--b2);border-color:var(--b3);color:var(--ink)}
    button.primary{background:var(--v);border-color:transparent;color:#fff;box-shadow:0 0 12px var(--v-glow)}
    button.primary:hover{background:#6d28d9}
    button.warn{background:var(--r-dim);border-color:var(--r-bdr);color:var(--red)}
    button.warn:hover{background:rgba(239,68,68,.18)}
    button:disabled{opacity:.4;cursor:wait;pointer-events:none}

    /* ── TAB NAV ── */
    .tabNav{background:rgba(13,13,28,0.96);border-bottom:1px solid var(--b);display:flex;padding:0 24px;position:sticky;top:58px;z-index:100;overflow-x:auto;scrollbar-width:none}
    .tabNav::-webkit-scrollbar{display:none}
    .tabBtn{background:transparent;border:none;border-bottom:2px solid transparent;border-radius:0;color:var(--muted);font-size:12px;font-weight:600;letter-spacing:.02em;padding:12px 16px;cursor:pointer;white-space:nowrap;transition:color .15s,border-color .15s}
    .tabBtn:hover{background:transparent;border-color:var(--b2);color:var(--ink2)}
    .tabBtn.active{color:var(--v2);border-bottom-color:var(--v)}

    /* ── TAB SECTIONS ── */
    .tabSection{display:none}
    .tabSection.active{display:block}
    main{max-width:1380px;margin:0 auto;padding:20px 20px 52px}

    /* ── SECTION LABELS ── */
    .sec{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 10px;display:flex;align-items:center;gap:10px}
    .sec::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,var(--b2),transparent)}
    .mt{margin-top:22px}

    /* ── KPI TILES ── */
    .kpiGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
    .tile{background:var(--s1);border:1px solid var(--b);border-left-width:2px;border-radius:12px;padding:16px;transition:border-color .2s,box-shadow .2s}
    .tile:hover{border-color:var(--b2);box-shadow:0 4px 20px rgba(0,0,0,.4)}
    .tile-status   {border-left-color:var(--blue)}
    .tile-incidents{border-left-color:var(--red)}
    .tile-spend    {border-left-color:var(--amber)}
    .tile-scheduled{border-left-color:var(--green)}
    .tile-generator{border-left-color:var(--v)}
    .tileLabel{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:9px}
    .tileValue{font-size:30px;font-weight:800;color:var(--ink);line-height:1;letter-spacing:-.5px}
    .tileValue.health{color:var(--green)}
    .tileValue.attention{color:var(--amber)}
    .tileValue.bad{color:var(--red)}
    .tileMeta{font-size:11px;color:var(--muted);margin-top:7px;font-weight:500}
    .barTrack{height:3px;background:var(--b);border-radius:9px;overflow:hidden;margin-top:11px}
    .barFill{height:100%;width:0%;background:linear-gradient(90deg,var(--amber),#fbbf24);border-radius:9px;transition:width .5s ease}

    /* ── PLATFORM ROW ── */
    .platGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .platCard{background:var(--s1);border:1px solid var(--b);border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px;transition:border-color .2s}
    .platCard:hover{border-color:var(--b2)}
    .platIcon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;flex-shrink:0;letter-spacing:-.5px}
    .plat-tt{background:var(--tt-dim);border:1px solid var(--tt-bdr);color:var(--tt)}
    .plat-ig{background:var(--ig-dim);border:1px solid var(--ig-bdr);color:var(--ig)}
    .plat-yt{background:var(--yt-dim);border:1px solid var(--yt-bdr);color:var(--yt)}
    .platName{font-size:13px;font-weight:700;color:var(--ink2)}
    .platStatus{font-size:11px;font-weight:600;color:var(--green);margin-top:2px}
    .platStatus.offline{color:var(--muted)}
    .platDot{display:inline-block;width:5px;height:5px;border-radius:50%;background:currentColor;margin-right:5px;vertical-align:middle}

    /* ── PANELS ── */
    .panel{background:var(--s1);border:1px solid var(--b);border-radius:12px;padding:16px}
    .panelHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--b)}
    .panelTitle{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2)}
    .panelBadge{font-size:10px;font-weight:600;color:var(--muted);background:var(--b);border:1px solid var(--b2);border-radius:20px;padding:2px 8px}
    .panelGrid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .panelGrid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}

    /* ── MINI LIST ── */
    .miniList{display:grid}
    .miniItem{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--b);font-size:12px}
    .miniItem:last-child{border-bottom:0;padding-bottom:0}
    .miniItem:first-child{padding-top:0}
    .miniItem strong{font-weight:600;color:var(--ink2);font-size:12px}
    .miniItem span{color:var(--muted);font-size:12px;text-align:right}

    /* ── PIPELINE VISUAL (Content Pipeline tab) ── */
    .pipeFlow{display:flex;align-items:center;gap:0;overflow-x:auto;padding:4px 0 16px;scrollbar-width:thin;scrollbar-color:var(--dim) transparent}
    .pipeStep{flex-shrink:0;background:var(--s1);border:1px solid var(--b);border-radius:11px;padding:13px 14px;min-width:105px;text-align:center;position:relative;transition:border-color .2s}
    .pipeStep:hover{border-color:var(--b3)}
    .pipeStep.active{border-color:var(--v);box-shadow:0 0 10px var(--v-dim)}
    .pipeStepNum{font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.06em;margin-bottom:5px}
    .pipeStepName{font-size:12px;font-weight:700;color:var(--ink2);line-height:1.3}
    .pipeStepSub{font-size:10px;color:var(--muted);margin-top:3px}
    .pipeArrow{flex-shrink:0;width:28px;text-align:center;color:var(--dim);font-size:14px;font-weight:600}
    .loopBack{display:flex;align-items:center;gap:6px;padding:8px 0;font-size:10px;font-weight:600;color:var(--muted);letter-spacing:.05em}
    .loopLine{flex:1;height:1px;background:repeating-linear-gradient(90deg,var(--dim) 0,var(--dim) 4px,transparent 4px,transparent 8px)}

    /* ── PIPELINE BARS (existing IDs) ── */
    .pipeBarGrid{display:grid;gap:11px}
    .pipeBarRow{display:grid;grid-template-columns:72px minmax(0,1fr) 68px;align-items:center;gap:10px}
    .stepName{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
    .pill{font-size:10px;font-weight:700;border-radius:20px;padding:3px 8px;text-align:center;background:var(--b);border:1px solid var(--b2);color:var(--muted);letter-spacing:.03em}
    .pill.ok,.pill.ready,.pill.active,.pill.passing,.pill.queued{background:var(--g-dim);border-color:var(--g-bdr);color:var(--green)}
    .pill.blocked,.pill.fail{background:var(--r-dim);border-color:var(--r-bdr);color:var(--red)}

    /* ── TABLES ── */
    .tableWrap{overflow-x:auto}
    table{width:100%;border-collapse:collapse;font-size:12px}
    thead th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);padding:0 8px 10px;border-bottom:1px solid var(--b);text-align:left}
    tbody tr{border-bottom:1px solid var(--b);transition:background .1s}
    tbody tr:hover{background:rgba(255,255,255,.02)}
    tbody tr:last-child{border-bottom:0}
    tbody td{padding:10px 8px;vertical-align:middle;color:var(--ink2);font-size:12px}
    .ts-cell{color:var(--muted);font-size:11px}
    .empty{color:var(--dim);font-size:12px}
    code{font-size:11px;color:var(--dim);font-family:ui-monospace,'SFMono-Regular',Consolas,monospace}

    /* ── STATUS / SEVERITY ── */
    .severity{display:inline-block;font-size:10px;font-weight:700;border-radius:5px;padding:2px 7px;background:var(--b);border:1px solid var(--b2);color:var(--muted);letter-spacing:.04em}
    .severity.P0{background:var(--r-dim);border-color:var(--r-bdr);color:var(--red)}
    .severity.P1{background:rgba(234,88,12,.1);border-color:rgba(234,88,12,.22);color:#fb923c}
    .severity.P2{background:var(--a-dim);border-color:var(--a-bdr);color:var(--amber)}
    .severity.P3{background:var(--b-dim);border-color:var(--b-bdr);color:#818cf8}
    .statusDot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:7px;background:var(--dim);vertical-align:middle}
    .statusDot.ok,.statusDot.pass{background:var(--green);box-shadow:0 0 5px rgba(34,197,94,.5)}
    .statusDot.notice{background:var(--amber)}
    .statusDot.incident,.statusDot.fail{background:var(--red);box-shadow:0 0 5px rgba(239,68,68,.4)}
    .status-cell{font-weight:600;text-transform:capitalize}
    .status-cell.ok,.status-cell.pass{color:var(--green)}
    .status-cell.notice{color:var(--amber)}
    .status-cell.incident,.status-cell.fail{color:var(--red)}

    /* ── HEALTH INDICATORS (Ops tab) ── */
    .healthGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .healthCard{background:var(--s1);border:1px solid var(--b);border-radius:12px;padding:14px}
    .healthCard.ok{border-top:2px solid var(--green)}
    .healthCard.warn{border-top:2px solid var(--amber)}
    .healthCard.bad{border-top:2px solid var(--red)}
    .healthCardName{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink2);margin-bottom:6px}
    .healthCardStatus{font-size:13px;font-weight:700;color:var(--green)}
    .healthCardStatus.warn{color:var(--amber)}
    .healthCardStatus.bad{color:var(--red)}
    .healthCardMeta{font-size:11px;color:var(--muted);margin-top:3px}

    /* ── REPORT ── */
    pre{background:#050510;border:1px solid var(--b);border-radius:8px;padding:13px;font-family:ui-monospace,'SFMono-Regular',Consolas,monospace;font-size:11px;color:var(--muted);white-space:pre-wrap;overflow:auto;max-height:260px;line-height:1.7}

    /* ── VIDEO LINK ── */
    a{color:var(--v2);text-decoration:none}
    a:hover{color:#c4b5fd}
    .video-link{display:flex;align-items:center;gap:9px;padding:12px 14px;background:var(--v-dim);border:1px solid rgba(124,58,237,.25);border-radius:9px;font-size:13px;font-weight:600;color:var(--v2);text-decoration:none;transition:all .15s;margin-top:8px}
    .video-link:hover{background:rgba(124,58,237,.22);color:#c4b5fd;text-decoration:none}

    /* ── AGENTS TAB ── */
    .agentStats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
    .agentStat{background:var(--s1);border:1px solid var(--b);border-radius:10px;padding:10px 16px;display:flex;align-items:baseline;gap:7px}
    .agentStatVal{font-size:22px;font-weight:800;color:var(--ink);letter-spacing:-.5px}
    .agentStatVal.g{color:var(--green)}
    .agentStatVal.v{color:var(--v2)}
    .agentStatLabel{font-size:11px;font-weight:600;color:var(--muted)}

    .systemsRow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:16px}
    .sysNode{background:var(--s2);border:1px solid var(--b2);border-radius:10px;padding:12px;text-align:center}
    .sysNode.core{border-color:rgba(124,58,237,.35);box-shadow:0 0 10px rgba(124,58,237,.1)}
    .sysNodeName{font-size:11px;font-weight:700;color:var(--ink2)}
    .sysNodeSub{font-size:10px;color:var(--muted);margin-top:3px}
    .sysNodeDot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 6px var(--green);margin:0 auto 7px;display:block}

    .agentPipeFlow{display:flex;align-items:center;gap:0;overflow-x:auto;padding:4px 0 16px;scrollbar-width:thin;scrollbar-color:var(--dim) transparent;background:var(--s2);border:1px solid var(--b);border-radius:12px;padding:16px}
    .agentPipeNode{flex-shrink:0;background:var(--s1);border:1px solid var(--b);border-radius:9px;padding:10px 12px;min-width:95px;text-align:center}
    .agentPipeNode.hl{border-color:rgba(124,58,237,.4);background:var(--v-dim)}
    .agentPipeName{font-size:11px;font-weight:700;color:var(--ink2);line-height:1.3}
    .agentPipeSub{font-size:9px;color:var(--muted);margin-top:2px}
    .agentPipeArr{flex-shrink:0;width:24px;text-align:center;color:var(--dim);font-size:12px;font-weight:700}

    .squadGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .squadCard{background:var(--s1);border:1px solid var(--b);border-radius:12px;overflow:hidden;cursor:pointer;transition:border-color .2s}
    .squadCard:hover{border-color:var(--b3)}
    .squadHeader{padding:12px 14px;display:flex;align-items:center;justify-content:space-between}
    .squadName{font-size:12px;font-weight:700;color:var(--ink2)}
    .squadCount{font-size:10px;font-weight:700;color:var(--muted);background:var(--b2);border-radius:20px;padding:2px 7px}
    .squadPhase{font-size:10px;color:var(--muted);padding:0 14px 10px;border-bottom:1px solid var(--b)}
    .squadDetail{padding:12px 14px;display:none}
    .squadCard.open .squadDetail{display:block}
    .squadCard.open{border-color:var(--v)}
    .squadAgentList{display:flex;flex-wrap:wrap;gap:5px}
    .agentTag{font-size:10px;font-weight:600;background:var(--b2);border-radius:5px;padding:2px 7px;color:var(--ink2)}
    .squadMeta{display:grid;gap:5px;margin-top:10px}
    .squadMetaRow{display:flex;justify-content:space-between;font-size:11px}
    .squadMetaRow span{color:var(--muted)}
    .squadMetaRow strong{color:var(--ink2);font-weight:600}
    .squadsHint{font-size:11px;color:var(--muted);margin-bottom:10px}

    /* ── PLATFORMS TAB ── */
    .platDetailCard{background:var(--s1);border:1px solid var(--b);border-radius:12px;overflow:hidden;margin-bottom:10px}
    .platDetailHead{padding:16px;display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--b)}
    .platDetailIcon{width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;flex-shrink:0}
    .platDetailName{font-size:16px;font-weight:800;color:var(--ink)}
    .platDetailSub{font-size:11px;color:var(--muted);margin-top:2px}
    .platDetailGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0}
    .platStat{padding:14px 16px;border-right:1px solid var(--b)}
    .platStat:last-child{border-right:0}
    .platStatLabel{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:5px}
    .platStatVal{font-size:16px;font-weight:800;color:var(--ink)}
    .platStatNote{font-size:11px;color:var(--muted);margin-top:3px}

    /* ── ANALYTICS TAB ── */
    .metricRow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:10px}
    .metricCard{background:var(--s1);border:1px solid var(--b);border-radius:12px;padding:16px}
    .metricLabel{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:8px}
    .metricVal{font-size:26px;font-weight:800;color:var(--ink);letter-spacing:-.4px}
    .metricMeta{font-size:11px;color:var(--muted);margin-top:6px}
    .recommendBox{background:var(--v-dim);border:1px solid rgba(124,58,237,.25);border-radius:10px;padding:14px 16px}
    .recommendTitle{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--v2);margin-bottom:8px}
    .recommendList{display:grid;gap:6px}
    .recommendItem{font-size:12px;color:var(--ink2);display:flex;gap:8px;align-items:flex-start}
    .recommendItem::before{content:"→";color:var(--v2);flex-shrink:0;font-weight:700}

    /* ── RESPONSIVE ── */
    @media(max-width:1100px){
      .kpiGrid{grid-template-columns:repeat(3,minmax(0,1fr))}
      .systemsRow{grid-template-columns:repeat(3,minmax(0,1fr))}
      .squadGrid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .platDetailGrid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .metricRow{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
    @media(max-width:720px){
      header{height:auto;padding:10px 14px;flex-wrap:wrap}
      .tabNav{padding:0 12px}
      main{padding:14px 12px 40px}
      .kpiGrid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .platGrid{grid-template-columns:1fr}
      .panelGrid2,.panelGrid3{grid-template-columns:1fr}
      .squadGrid{grid-template-columns:1fr}
      .healthGrid{grid-template-columns:1fr}
      .tileValue{font-size:26px}
      .systemsRow{grid-template-columns:repeat(2,minmax(0,1fr))}
      .platDetailGrid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .metricRow{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
    @media(max-width:440px){
      .kpiGrid{grid-template-columns:1fr}
      .metricRow{grid-template-columns:1fr}
    }
  </style>
</head>
<body>

<header>
  <div class="logo">
    <div class="logo-mark">&#9819;</div>
    <div>
      <div class="logo-name">Empire OS</div>
      <div class="logo-tag">Autonomous Content Intelligence</div>
    </div>
  </div>
  <div class="hdr-right">
    <div class="live-badge"><div class="live-dot"></div>Live</div>
    <div class="actions">
      <button id="runBtn" class="primary">Run Check</button>
      <button id="videoBtn">Video Test</button>
      <button id="postizBtn">Postiz</button>
      <button id="e2eBtn">E2E</button>
      <button id="pauseBtn" class="warn">Pause</button>
      <button id="resumeBtn">Resume</button>
    </div>
  </div>
</header>

<nav class="tabNav">
  <button class="tabBtn active" data-tab="overview">Overview</button>
  <button class="tabBtn" data-tab="pipeline">Content Pipeline</button>
  <button class="tabBtn" data-tab="agents">Agents</button>
  <button class="tabBtn" data-tab="platforms">Platforms</button>
  <button class="tabBtn" data-tab="analytics">Analytics</button>
  <button class="tabBtn" data-tab="ops">Ops / Safety</button>
</nav>

<main>

<!-- ═══════════════════════════════════════
     TAB 1 — OVERVIEW
═══════════════════════════════════════ -->
<section id="tab-overview" class="tabSection active">
  <div class="sec">System Status</div>
  <section class="kpiGrid">
    <article class="tile tile-status">
      <div class="tileLabel">Status</div>
      <div id="status" class="tileValue">${escapeHtml(initialStatus)}</div>
      <div class="tileMeta">Updated <span id="updated">${escapeHtml(initialUpdated)}</span></div>
    </article>
    <article class="tile tile-incidents">
      <div class="tileLabel">Incidents</div>
      <div id="incidentCount" class="tileValue">${incidentCount}</div>
      <div class="tileMeta">Open in memory</div>
    </article>
    <article class="tile tile-spend">
      <div class="tileLabel">Daily Spend</div>
      <div id="spendValue" class="tileValue">$0</div>
      <div id="spendMeta" class="tileMeta">Loading budget</div>
      <div class="barTrack"><div id="spendBar" class="barFill"></div></div>
    </article>
    <article class="tile tile-scheduled">
      <div class="tileLabel">Scheduled</div>
      <div id="scheduledValue" class="tileValue">0</div>
      <div id="scheduledMeta" class="tileMeta">Posts in queue</div>
    </article>
    <article class="tile tile-generator">
      <div class="tileLabel">Generator</div>
      <div id="generatorValue" class="tileValue">HGF</div>
      <div id="generatorMeta" class="tileMeta">Production path</div>
    </article>
  </section>

  <div class="sec mt">Platforms</div>
  <div class="platGrid">
    <div class="platCard">
      <div class="platIcon plat-tt">TT</div>
      <div>
        <div class="platName">TikTok</div>
        <div class="platStatus"><span class="platDot"></span>Monitoring</div>
      </div>
    </div>
    <div class="platCard">
      <div class="platIcon plat-ig">IG</div>
      <div>
        <div class="platName">Instagram</div>
        <div class="platStatus"><span class="platDot"></span>Monitoring</div>
      </div>
    </div>
    <div class="platCard">
      <div class="platIcon plat-yt">YT</div>
      <div>
        <div class="platName">YouTube Shorts</div>
        <div class="platStatus"><span class="platDot"></span>Monitoring</div>
      </div>
    </div>
  </div>

  <div class="sec mt">Quick Stats</div>
  <div class="panelGrid2">
    <div class="panel">
      <div class="panelHead"><div class="panelTitle">Automation</div></div>
      <div id="controlState" class="miniList">
        <div class="miniItem"><strong>State</strong><span>Loading...</span></div>
      </div>
    </div>
    <div class="panel">
      <div class="panelHead"><div class="panelTitle">Niche Scout</div></div>
      <div id="nicheState" class="miniList">
        <div class="miniItem"><strong>Signals</strong><span>Waiting</span></div>
      </div>
    </div>
  </div>
</section>


<!-- ═══════════════════════════════════════
     TAB 2 — CONTENT PIPELINE
═══════════════════════════════════════ -->
<section id="tab-pipeline" class="tabSection">
  <div class="sec">Video Production Workflow</div>
  <div style="overflow-x:auto;margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:0;padding:16px;background:var(--s1);border:1px solid var(--b);border-radius:12px;min-width:860px">
      <div class="pipeStep active"><div class="pipeStepNum">01</div><div class="pipeStepName">Niche Scout</div><div class="pipeStepSub">Trend signals</div></div>
      <div class="pipeArrow">&#8594;</div>
      <div class="pipeStep"><div class="pipeStepNum">02</div><div class="pipeStepName">Reference Research</div><div class="pipeStepSub">Pattern extract</div></div>
      <div class="pipeArrow">&#8594;</div>
      <div class="pipeStep"><div class="pipeStepNum">03</div><div class="pipeStepName">Idea Generation</div><div class="pipeStepSub">Concepts</div></div>
      <div class="pipeArrow">&#8594;</div>
      <div class="pipeStep"><div class="pipeStepNum">04</div><div class="pipeStepName">Hook + Script</div><div class="pipeStepSub">Hook Writer</div></div>
      <div class="pipeArrow">&#8594;</div>
      <div class="pipeStep active"><div class="pipeStepNum">05</div><div class="pipeStepName">Higgsfield Video</div><div class="pipeStepSub">Pro 9:16</div></div>
      <div class="pipeArrow">&#8594;</div>
      <div class="pipeStep"><div class="pipeStepNum">06</div><div class="pipeStepName">Voice + Sound</div><div class="pipeStepSub">Audio dir</div></div>
      <div class="pipeArrow">&#8594;</div>
      <div class="pipeStep"><div class="pipeStepNum">07</div><div class="pipeStepName">Quality Gate</div><div class="pipeStepSub">Pass / Fail</div></div>
      <div class="pipeArrow">&#8594;</div>
      <div class="pipeStep"><div class="pipeStepNum">08</div><div class="pipeStepName">Postiz Schedule</div><div class="pipeStepSub">Auto-queue</div></div>
      <div class="pipeArrow">&#8594;</div>
      <div class="pipeStep"><div class="pipeStepNum">09</div><div class="pipeStepName">Published</div><div class="pipeStepSub">TT / IG / YT</div></div>
    </div>
  </div>
  <div style="text-align:center;font-size:10px;font-weight:600;color:var(--muted);letter-spacing:.08em;margin-bottom:20px">&#8635; ANALYTICS FEEDBACK LOOP &#8212; BACK TO NICHE SCOUT</div>

  <div class="sec">Pipeline Progress</div>
  <div class="panelGrid2">
    <div class="panel">
      <div class="panelHead"><div class="panelTitle">Stage Progress</div></div>
      <div class="pipeBarGrid">
        <div class="pipeBarRow">
          <div class="stepName">Scout</div>
          <div class="barTrack"><div id="scoutBar" class="barFill" style="background:linear-gradient(90deg,var(--green),#4ade80)"></div></div>
          <span id="scoutPill" class="pill">Idle</span>
        </div>
        <div class="pipeBarRow">
          <div class="stepName">Create</div>
          <div class="barTrack"><div id="createBar" class="barFill" style="background:linear-gradient(90deg,var(--v),var(--blue))"></div></div>
          <span id="createPill" class="pill">HGF</span>
        </div>
        <div class="pipeBarRow">
          <div class="stepName">Verify</div>
          <div class="barTrack"><div id="verifyBar" class="barFill" style="background:linear-gradient(90deg,var(--amber),#fbbf24)"></div></div>
          <span id="verifyPill" class="pill">Gated</span>
        </div>
        <div class="pipeBarRow">
          <div class="stepName">Schedule</div>
          <div class="barTrack"><div id="scheduleBar" class="barFill" style="background:linear-gradient(90deg,var(--blue),#818cf8)"></div></div>
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
  <div class="panel" style="max-width:420px">
    <div class="panelHead"><div class="panelTitle">Latest Generation</div></div>
    <a class="video-link" href="/ops/latest-video-page" target="_blank" rel="noreferrer">
      &#9654; Open video preview
    </a>
  </div>
</section>


<!-- ═══════════════════════════════════════
     TAB 3 — AGENTS
═══════════════════════════════════════ -->
<section id="tab-agents" class="tabSection">
  <div class="agentStats">
    <div class="agentStat"><div class="agentStatVal">31</div><div class="agentStatLabel">Total Agents</div></div>
    <div class="agentStat"><div class="agentStatVal v">9</div><div class="agentStatLabel">Squads</div></div>
    <div class="agentStat"><div class="agentStatVal g" id="agentSpawnerStatus">Active</div><div class="agentStatLabel">Spawner</div></div>
    <div class="agentStat"><div class="agentStatVal g" id="agentMemoryStatus">Online</div><div class="agentStatLabel">Memory System</div></div>
    <div class="agentStat"><div class="agentStatVal" id="agentActiveCount">0</div><div class="agentStatLabel">Active Tasks</div></div>
  </div>

  <div class="sec">Core Systems</div>
  <div class="systemsRow">
    <div class="sysNode core">
      <span class="sysNodeDot"></span>
      <div class="sysNodeName">Empire OS Orchestrator</div>
      <div class="sysNodeSub">Coordinates all squads</div>
    </div>
    <div class="sysNode core">
      <span class="sysNodeDot"></span>
      <div class="sysNodeName">Agent Spawner</div>
      <div class="sysNodeSub">Selects + spawns squads</div>
    </div>
    <div class="sysNode core">
      <span class="sysNodeDot"></span>
      <div class="sysNodeName">Memory System</div>
      <div class="sysNodeSub">Shared + per-agent memory</div>
    </div>
    <div class="sysNode core">
      <span class="sysNodeDot"></span>
      <div class="sysNodeName">Quality Gate</div>
      <div class="sysNodeSub">Pass / fail gate</div>
    </div>
    <div class="sysNode core">
      <span class="sysNodeDot"></span>
      <div class="sysNodeName">Publishing Controller</div>
      <div class="sysNodeSub">Postiz + schedule</div>
    </div>
  </div>

  <div class="sec mt">Main Agent Flow</div>
  <div style="overflow-x:auto;margin-bottom:6px">
    <div class="agentPipeFlow" style="min-width:900px">
      <div class="agentPipeNode hl"><div class="agentPipeName">Niche Scout</div><div class="agentPipeSub">Trend signals</div></div>
      <div class="agentPipeArr">&#8594;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Reference Research</div><div class="agentPipeSub">Pattern analysis</div></div>
      <div class="agentPipeArr">&#8594;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Content Strategy</div><div class="agentPipeSub">Idea selection</div></div>
      <div class="agentPipeArr">&#8594;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Script + Hook</div><div class="agentPipeSub">Hook Writer</div></div>
      <div class="agentPipeArr">&#8594;</div>
      <div class="agentPipeNode hl"><div class="agentPipeName">Higgsfield Video</div><div class="agentPipeSub">cinematic_v2 pro</div></div>
      <div class="agentPipeArr">&#8594;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Voice + Sound</div><div class="agentPipeSub">Audio direction</div></div>
      <div class="agentPipeArr">&#8594;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Retention Editing</div><div class="agentPipeSub">Pacing check</div></div>
      <div class="agentPipeArr">&#8594;</div>
      <div class="agentPipeNode hl"><div class="agentPipeName">Quality Gate</div><div class="agentPipeSub">Pass / Fail</div></div>
      <div class="agentPipeArr">&#8594;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Postiz Publish</div><div class="agentPipeSub">TT / IG / YT</div></div>
      <div class="agentPipeArr">&#8594;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Analytics Feedback</div><div class="agentPipeSub">Performance</div></div>
      <div class="agentPipeArr">&#8594;</div>
      <div class="agentPipeNode"><div class="agentPipeName">Memory Update</div><div class="agentPipeSub">Learn + loop</div></div>
    </div>
  </div>
  <div style="text-align:center;font-size:10px;font-weight:600;color:var(--muted);letter-spacing:.08em;margin-bottom:20px">&#8635; LOOPS BACK TO NICHE SCOUT / CONTENT STRATEGY</div>

  <div class="sec">Squad Clusters <span style="font-size:10px;color:var(--muted);font-weight:500;letter-spacing:0;text-transform:none">&nbsp;&#8212; click a card to expand agents</span></div>
  <div class="squadGrid" id="squadGrid">

    <div class="squadCard" data-squad="horror">
      <div class="squadHeader" style="border-top:2px solid var(--red)">
        <div class="squadName">Horror Squad</div>
        <div class="squadCount">13 agents</div>
      </div>
      <div class="squadPhase">Handles: Hook/Script &#8594; Higgsfield &#8594; Voice &#8594; Quality Gate</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag">Trend Radar</span><span class="agentTag">Competitor Tracker</span><span class="agentTag">Reference Analyst</span><span class="agentTag">Audience Psychologist</span><span class="agentTag">Content Strategist</span><span class="agentTag">Hook Writer</span><span class="agentTag">Script Doctor</span><span class="agentTag">First Frame Agent</span><span class="agentTag">Higgsfield Director</span><span class="agentTag">Voice Director</span><span class="agentTag">Retention Editor</span><span class="agentTag">Compliance Safety</span><span class="agentTag">Quality Gate</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:var(--green)">Ready</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="horror-last">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="horror-mem">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Can spawn subagents</span><strong style="color:var(--green)">Yes</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="kids">
      <div class="squadHeader" style="border-top:2px solid #f59e0b">
        <div class="squadName">Kids Squad</div>
        <div class="squadCount">11 agents</div>
      </div>
      <div class="squadPhase">Handles: Hook/Script &#8594; Higgsfield &#8594; Caption SEO &#8594; Quality Gate</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag">Trend Radar</span><span class="agentTag">Reference Analyst</span><span class="agentTag">Audience Psychologist</span><span class="agentTag">Content Strategist</span><span class="agentTag">Hook Writer</span><span class="agentTag">Script Doctor</span><span class="agentTag">Higgsfield Director</span><span class="agentTag">Voice Director</span><span class="agentTag">Caption SEO Agent</span><span class="agentTag">Compliance Safety</span><span class="agentTag">Quality Gate</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:var(--green)">Ready</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="kids-last">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="kids-mem">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Can spawn subagents</span><strong style="color:var(--green)">Yes</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="brainrot">
      <div class="squadHeader" style="border-top:2px solid var(--blue)">
        <div class="squadName">Brainrot Squad</div>
        <div class="squadCount">12 agents</div>
      </div>
      <div class="squadPhase">Handles: Hook/Script &#8594; Higgsfield &#8594; Retention &#8594; Quality Gate</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag">Trend Radar</span><span class="agentTag">Competitor Tracker</span><span class="agentTag">Reference Analyst</span><span class="agentTag">Content Strategist</span><span class="agentTag">Hook Writer</span><span class="agentTag">Script Doctor</span><span class="agentTag">Higgsfield Director</span><span class="agentTag">Voice Director</span><span class="agentTag">Retention Editor</span><span class="agentTag">Caption SEO Agent</span><span class="agentTag">Compliance Safety</span><span class="agentTag">Quality Gate</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:var(--green)">Ready</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="brainrot-last">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="brainrot-mem">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Can spawn subagents</span><strong style="color:var(--green)">Yes</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="niche-discovery">
      <div class="squadHeader" style="border-top:2px solid var(--green)">
        <div class="squadName">Niche Discovery Squad</div>
        <div class="squadCount">Agents</div>
      </div>
      <div class="squadPhase">Handles: Niche Scout &#8594; Trend analysis &#8594; Launch decisions</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag">Trend Radar</span><span class="agentTag">Market Analyst</span><span class="agentTag">Niche Scorer</span><span class="agentTag">Competition Gauge</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:var(--green)">Active</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="niche-last">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="niche-mem">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Can spawn subagents</span><strong style="color:var(--green)">Yes</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="reference">
      <div class="squadHeader" style="border-top:2px solid var(--v2)">
        <div class="squadName">Reference Research Squad</div>
        <div class="squadCount">Agents</div>
      </div>
      <div class="squadPhase">Handles: Reference Research &#8594; Pattern extract &#8594; Insight</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag">Reference Analyst</span><span class="agentTag">Competitor Tracker</span><span class="agentTag">Pattern Extractor</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:var(--green)">Ready</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="reference-last">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="reference-mem">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Can spawn subagents</span><strong style="color:var(--green)">Yes</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="publishing">
      <div class="squadHeader" style="border-top:2px solid var(--tt)">
        <div class="squadName">Publishing Squad</div>
        <div class="squadCount">Agents</div>
      </div>
      <div class="squadPhase">Handles: Quality Gate pass &#8594; Postiz upload &#8594; Schedule</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag">Publishing Controller</span><span class="agentTag">Postiz Uploader</span><span class="agentTag">Schedule Optimizer</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:var(--green)">Ready</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="publishing-last">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="publishing-mem">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Can spawn subagents</span><strong style="color:var(--green)">Yes</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="analytics">
      <div class="squadHeader" style="border-top:2px solid var(--blue)">
        <div class="squadName">Analytics Feedback Squad</div>
        <div class="squadCount">Agents</div>
      </div>
      <div class="squadPhase">Handles: Post performance &#8594; Niche signals &#8594; Memory</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag">Analytics Watcher</span><span class="agentTag">Hook Evaluator</span><span class="agentTag">Format Ranker</span><span class="agentTag">Memory Writer</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:var(--green)">Monitoring</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="analytics-last">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="analytics-mem">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Can spawn subagents</span><strong style="color:var(--green)">Yes</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="ops-safety">
      <div class="squadHeader" style="border-top:2px solid var(--amber)">
        <div class="squadName">Ops Safety Squad</div>
        <div class="squadCount">Agents</div>
      </div>
      <div class="squadPhase">Handles: Railway / Higgsfield / Postiz / spend safety</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag">Spend Watcher</span><span class="agentTag">Railway Monitor</span><span class="agentTag">Higgsfield Guard</span><span class="agentTag">Postiz Health</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:var(--green)">Watching</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="ops-last">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="ops-mem">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Can spawn subagents</span><strong style="color:var(--green)">Yes</strong></div>
        </div>
      </div>
    </div>

    <div class="squadCard" data-squad="monetization">
      <div class="squadHeader" style="border-top:2px solid #10b981">
        <div class="squadName">Monetization Squad</div>
        <div class="squadCount">Agents</div>
      </div>
      <div class="squadPhase">Handles: Revenue paths &#8594; Channel monetization &#8594; Brand ops</div>
      <div class="squadDetail">
        <div class="squadAgentList">
          <span class="agentTag">Revenue Tracker</span><span class="agentTag">Brand Deal Scout</span><span class="agentTag">Affiliate Optimizer</span>
        </div>
        <div class="squadMeta">
          <div class="squadMetaRow"><span>Status</span><strong style="color:var(--muted)">Standby</strong></div>
          <div class="squadMetaRow"><span>Last task</span><strong id="monetization-last">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Memory notes</span><strong id="monetization-mem">&#8212;</strong></div>
          <div class="squadMetaRow"><span>Can spawn subagents</span><strong style="color:var(--green)">Yes</strong></div>
        </div>
      </div>
    </div>

  </div>
</section>


<!-- ═══════════════════════════════════════
     TAB 4 — PLATFORMS
═══════════════════════════════════════ -->
<section id="tab-platforms" class="tabSection">
  <div class="sec">Platform Health</div>

  <div class="platDetailCard">
    <div class="platDetailHead">
      <div class="platDetailIcon plat-tt">TT</div>
      <div>
        <div class="platDetailName">TikTok</div>
        <div class="platDetailSub">Short-form video &#8226; Primary platform</div>
      </div>
      <div style="margin-left:auto"><span class="pill ok" style="font-size:11px;padding:4px 10px">Monitoring</span></div>
    </div>
    <div class="platDetailGrid">
      <div class="platStat"><div class="platStatLabel">Status</div><div class="platStatVal" style="color:var(--green)">Connected</div><div class="platStatNote">Via Postiz</div></div>
      <div class="platStat"><div class="platStatLabel">Scheduled</div><div class="platStatVal">&#8212;</div><div class="platStatNote">Waiting</div></div>
      <div class="platStat"><div class="platStatLabel">Last Post</div><div class="platStatVal">&#8212;</div><div class="platStatNote">No posts yet</div></div>
      <div class="platStat"><div class="platStatLabel">Next Post</div><div class="platStatVal">&#8212;</div><div class="platStatNote">Queue empty</div></div>
    </div>
  </div>

  <div class="platDetailCard">
    <div class="platDetailHead">
      <div class="platDetailIcon plat-ig">IG</div>
      <div>
        <div class="platDetailName">Instagram</div>
        <div class="platDetailSub">Reels + Feed posts &#8226; Secondary platform</div>
      </div>
      <div style="margin-left:auto"><span class="pill ok" style="font-size:11px;padding:4px 10px">Monitoring</span></div>
    </div>
    <div class="platDetailGrid">
      <div class="platStat"><div class="platStatLabel">Status</div><div class="platStatVal" style="color:var(--green)">Connected</div><div class="platStatNote">Via Postiz</div></div>
      <div class="platStat"><div class="platStatLabel">Scheduled</div><div class="platStatVal">&#8212;</div><div class="platStatNote">Waiting</div></div>
      <div class="platStat"><div class="platStatLabel">Last Post</div><div class="platStatVal">&#8212;</div><div class="platStatNote">No posts yet</div></div>
      <div class="platStat"><div class="platStatLabel">Next Post</div><div class="platStatVal">&#8212;</div><div class="platStatNote">Queue empty</div></div>
    </div>
  </div>

  <div class="platDetailCard">
    <div class="platDetailHead">
      <div class="platDetailIcon plat-yt">YT</div>
      <div>
        <div class="platDetailName">YouTube Shorts</div>
        <div class="platDetailSub">Vertical shorts &#8226; Long-term SEO</div>
      </div>
      <div style="margin-left:auto"><span class="pill ok" style="font-size:11px;padding:4px 10px">Monitoring</span></div>
    </div>
    <div class="platDetailGrid">
      <div class="platStat"><div class="platStatLabel">Status</div><div class="platStatVal" style="color:var(--green)">Connected</div><div class="platStatNote">Via Postiz</div></div>
      <div class="platStat"><div class="platStatLabel">Scheduled</div><div class="platStatVal">&#8212;</div><div class="platStatNote">Waiting</div></div>
      <div class="platStat"><div class="platStatLabel">Last Post</div><div class="platStatVal">&#8212;</div><div class="platStatNote">No posts yet</div></div>
      <div class="platStat"><div class="platStatLabel">Next Post</div><div class="platStatVal">&#8212;</div><div class="platStatNote">Queue empty</div></div>
    </div>
  </div>
</section>


<!-- ═══════════════════════════════════════
     TAB 5 — ANALYTICS
═══════════════════════════════════════ -->
<section id="tab-analytics" class="tabSection">
  <div class="sec">Performance Metrics</div>
  <div class="metricRow">
    <div class="metricCard"><div class="metricLabel">Total Views</div><div class="metricVal">&#8212;</div><div class="metricMeta">Awaiting first post</div></div>
    <div class="metricCard"><div class="metricLabel">Likes</div><div class="metricVal">&#8212;</div><div class="metricMeta">Awaiting data</div></div>
    <div class="metricCard"><div class="metricLabel">Comments</div><div class="metricVal">&#8212;</div><div class="metricMeta">Awaiting data</div></div>
    <div class="metricCard"><div class="metricLabel">Shares</div><div class="metricVal">&#8212;</div><div class="metricMeta">Awaiting data</div></div>
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
</section>


<!-- ═══════════════════════════════════════
     TAB 6 — OPS / SAFETY
═══════════════════════════════════════ -->
<section id="tab-ops" class="tabSection">
  <div class="sec">Service Health</div>
  <div class="healthGrid">
    <div class="healthCard ok">
      <div class="healthCardName">Railway</div>
      <div class="healthCardStatus">Online</div>
      <div class="healthCardMeta">Worker deployed</div>
    </div>
    <div class="healthCard ok">
      <div class="healthCardName">Higgsfield</div>
      <div class="healthCardStatus" id="hgfHealthStatus">Checking...</div>
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
        <div class="miniItem"><strong>State</strong><span>Loading...</span></div>
      </div>
    </div>
    <div class="panel">
      <div class="panelHead"><div class="panelTitle">Budget</div></div>
      <div class="miniList">
        <div class="miniItem"><strong>Daily Spend</strong><span id="opsSpendDisplay">$0.00</span></div>
        <div class="miniItem"><strong>Budget Cap</strong><span id="opsBudgetDisplay">No cap set</span></div>
        <div class="miniItem"><strong>Status</strong><span style="color:var(--green)">Safe</span></div>
      </div>
    </div>
  </div>

  <div class="sec mt">Watcher Health</div>
  <div class="panel">
    <div class="panelHead">
      <div class="panelTitle">Agent Checks</div>
      <div class="panelBadge" id="watcherCount">&#8212; agents</div>
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
</section>

</main>

<script>
  /* ── TAB SWITCHING ── */
  document.querySelectorAll('.tabBtn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.tabBtn').forEach(function(b){ b.classList.remove('active'); });
      document.querySelectorAll('.tabSection').forEach(function(s){ s.classList.remove('active'); });
      btn.classList.add('active');
      var section = document.getElementById('tab-' + btn.dataset.tab);
      if(section) section.classList.add('active');
    });
  });

  /* ── SQUAD CARD TOGGLE ── */
  document.querySelectorAll('.squadCard').forEach(function(card){
    card.addEventListener('click', function(){
      card.classList.toggle('open');
    });
  });

  /* ── ELEMENT REFS ── */
  var runBtn          = document.getElementById("runBtn");
  var videoBtn        = document.getElementById("videoBtn");
  var postizBtn       = document.getElementById("postizBtn");
  var e2eBtn          = document.getElementById("e2eBtn");
  var pauseBtn        = document.getElementById("pauseBtn");
  var resumeBtn       = document.getElementById("resumeBtn");
  var statusEl        = document.getElementById("status");
  var reportEl        = document.getElementById("report");
  var updatedEl       = document.getElementById("updated");
  var incidentCountEl = document.getElementById("incidentCount");
  var incidentRowsEl  = document.getElementById("incidentRows");
  var checkRowsEl     = document.getElementById("checkRows");
  var controlStateEl  = document.getElementById("controlState");
  var scheduledStateEl= document.getElementById("scheduledState");
  var nicheStateEl    = document.getElementById("nicheState");
  var performanceStateEl = document.getElementById("performanceState");
  var spendValueEl    = document.getElementById("spendValue");
  var spendMetaEl     = document.getElementById("spendMeta");
  var spendBarEl      = document.getElementById("spendBar");
  var scheduledValueEl= document.getElementById("scheduledValue");
  var scheduledMetaEl = document.getElementById("scheduledMeta");
  var generatorValueEl= document.getElementById("generatorValue");
  var generatorMetaEl = document.getElementById("generatorMeta");

  function esc(value) {
    return String(value ?? "").replace(/[&<>']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;'}[c]||c;
    });
  }

  function money(value) {
    var n = Number(value || 0);
    return "$" + n.toFixed(n >= 10 ? 0 : 2);
  }

  function setStatusClass(el, status) {
    el.classList.remove("health","attention","bad");
    var lower = String(status||"").toLowerCase();
    if(["ok","pass","running"].includes(lower)) el.classList.add("health");
    else if(["p0","fail","error","incident"].includes(lower)) el.classList.add("bad");
    else el.classList.add("attention");
  }

  function updatePill(id, text) {
    var el = document.getElementById(id);
    if(!el) return;
    el.textContent = text;
    el.className = "pill " + text;
  }

  function drawIncidents(incidents) {
    incidentCountEl.textContent = incidents.length;
    incidentRowsEl.innerHTML = incidents.length
      ? incidents.map(function(item){
          return '<tr><td><span class="severity '+esc(item.severity)+'">'+esc(item.severity)+'</span></td>'+
            '<td>'+esc(item.agent)+'</td><td>'+esc(item.service)+'</td>'+
            '<td>'+esc(item.problem)+'</td><td class="ts-cell">'+esc(item.ts)+'</td></tr>';
        }).join('')
      : '<tr><td colspan="5" class="empty">No incidents recorded.</td></tr>';
  }

  function drawChecks(report) {
    var checks = Array.isArray(report&&report.checks) ? report.checks : [];
    var badge = document.getElementById("watcherCount");
    if(badge) badge.textContent = checks.length + " agent" + (checks.length!==1?"s":"");
    var hgf = checks.find(function(c){ return String(c.agent||"").toLowerCase().includes("higgsfield"); });
    if(hgf){
      generatorValueEl.textContent = hgf.status==="ok" ? "Ready" : "Blocked";
      generatorMetaEl.textContent  = hgf.status==="ok" ? "Higgsfield active" : "No fallback posting";
      setStatusClass(generatorValueEl, hgf.status==="ok" ? "ok" : "fail");
      var hgfStatus = document.getElementById("hgfHealthStatus");
      if(hgfStatus) { hgfStatus.textContent = hgf.status==="ok" ? "Ready" : "Blocked"; hgfStatus.className = "healthCardStatus" + (hgf.status==="ok" ? "" : " bad"); }
    }
    checkRowsEl.innerHTML = checks.length
      ? checks.map(function(check){
          var d = check.incident||check.details||{};
          return '<tr>'+
            '<td><span class="statusDot '+esc(check.status)+'"></span>'+esc(check.agent)+'</td>'+
            '<td class="status-cell '+esc(check.status)+'">'+esc(check.status)+'</td>'+
            '<td><span class="severity '+esc(check.severity)+'">'+esc(check.severity)+'</span></td>'+
            '<td><code>'+esc(JSON.stringify(d).slice(0,180))+'</code></td></tr>';
        }).join('')
      : '<tr><td colspan="4" class="empty">No watcher check has run yet.</td></tr>';
  }

  function drawOpsState(data) {
    var control    = data.control||{};
    var spend      = data.spend||{};
    var scheduled  = data.scheduledPosts||[];
    var analytics  = data.analytics||[];
    var dailyBudget   = Number(spend.dailyBudget||0);
    var estimatedSpend= Number(spend.estimatedSpend||0);
    var spendPct   = dailyBudget>0 ? Math.min(100,Math.round((estimatedSpend/dailyBudget)*100)) : 0;
    var upcoming   = scheduled.filter(function(p){ return Date.parse(p.scheduledFor||"")>Date.now(); }).length;

    spendValueEl.textContent  = money(estimatedSpend);
    spendMetaEl.textContent   = dailyBudget>0 ? spendPct+"% of "+money(dailyBudget)+" cap" : "No cap set";
    spendBarEl.style.width    = spendPct+"%";
    scheduledValueEl.textContent = String(scheduled.length);
    scheduledMetaEl.textContent  = upcoming+" upcoming";

    var qb = document.getElementById("queueBadge");
    if(qb) qb.textContent = scheduled.length+" post"+(scheduled.length!==1?"s":"");

    var opsSpend = document.getElementById("opsSpendDisplay");
    var opsBudget = document.getElementById("opsBudgetDisplay");
    if(opsSpend)  opsSpend.textContent  = money(estimatedSpend);
    if(opsBudget) opsBudget.textContent = dailyBudget>0 ? money(dailyBudget) : "No cap set";

    var paused = control.paused;
    var stateHtml = '<div class="miniItem"><strong>State</strong><span style="color:'+(paused?'#f59e0b':'#22c55e')+';font-weight:600">'+esc(paused?'Paused':'Running')+'</span></div>'+
      '<div class="miniItem"><strong>Note</strong><span>'+esc(control.reason||'No note')+'</span></div>';
    controlStateEl.innerHTML = stateHtml;
    var opsControl = document.getElementById("controlStateOps");
    if(opsControl) opsControl.innerHTML = stateHtml;

    scheduledStateEl.innerHTML = scheduled.length
      ? scheduled.slice(0,6).map(function(p){
          return '<div class="miniItem"><strong>'+esc(p.title||'Untitled')+'</strong><span>'+esc(p.channelName||'channel')+'</span></div>';
        }).join('')
      : '<div class="miniItem"><strong>No posts</strong><span>Queue empty</span></div>';

    performanceStateEl.innerHTML = analytics.length
      ? analytics.slice(0,4).map(function(item,i){
          return '<div class="miniItem"><strong>Snapshot '+(i+1)+'</strong><span>'+esc(item.measurable||0)+' measurable posts</span></div>';
        }).join('')
      : '<div class="miniItem"><strong>Waiting</strong><span>Analytics appear after posts publish</span></div>';

    fetch('/ops/niches').then(function(r){ return r.json(); }).then(function(niches){
      var top = (niches.recommendations||[]).slice(0,5);
      var html = top.length
        ? top.map(function(item){ return '<div class="miniItem"><strong>'+esc(item.niche)+'</strong><span>Score '+esc(item.score)+'</span></div>'; }).join('')
        : '<div class="miniItem"><strong>No signals</strong><span>Scout waiting</span></div>';
      nicheStateEl.innerHTML = html;
      var na = document.getElementById("nicheAnalytics");
      if(na) na.innerHTML = html;
      document.getElementById("scoutBar").style.width = top.length ? "100%" : "35%";
      updatePill("scoutPill", top.length ? "active" : "waiting");
    }).catch(function(){
      nicheStateEl.innerHTML = '<div class="miniItem"><strong>Scout offline</strong><span>Retry later</span></div>';
    });

    var genBlocked = generatorValueEl.textContent === "Blocked";
    document.getElementById("createBar").style.width  = genBlocked ? "35%" : "100%";
    document.getElementById("verifyBar").style.width  = scheduled.length ? "100%" : "55%";
    document.getElementById("scheduleBar").style.width= upcoming ? "100%" : "45%";
    updatePill("createPill",   genBlocked     ? "blocked" : "ready");
    updatePill("verifyPill",   scheduled.length ? "passing" : "waiting");
    updatePill("schedulePill", upcoming       ? "queued"  : "empty");
  }

  async function refreshStatus() {
    var res  = await fetch('/ops/status');
    var data = await res.json();
    drawIncidents(data.recentIncidents||[]);
    drawOpsState(data);
    if(data.lastReport){
      statusEl.textContent = data.lastReport.status||'unknown';
      setStatusClass(statusEl, data.lastReport.status);
      reportEl.textContent = JSON.stringify(data.lastReport, null, 2);
      updatedEl.textContent = data.lastReport.finishedAt
        ? new Date(data.lastReport.finishedAt).toLocaleTimeString()
        : new Date().toLocaleTimeString();
      drawChecks(data.lastReport);
    }
  }

  async function postJson(path, button, label, body) {
    body = body || {};
    button.disabled = true;
    statusEl.textContent = label;
    setStatusClass(statusEl,"notice");
    reportEl.textContent = label + "...";
    try {
      var res  = await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      var data = await res.json();
      statusEl.textContent = data.status||'unknown';
      setStatusClass(statusEl, data.status);
      reportEl.textContent = JSON.stringify(data, null, 2);
      if(data.checks)          drawChecks(data);
      if(data.recentIncidents) drawIncidents(data.recentIncidents);
      await refreshStatus();
    } catch(e) {
      statusEl.textContent = 'error';
      setStatusClass(statusEl,"fail");
      reportEl.textContent = e.message;
    } finally {
      updatedEl.textContent = new Date().toLocaleTimeString();
      button.disabled = false;
    }
  }

  /* ── AGENT DATA FETCH ── */
  async function fetchAgents() {
    try {
      var res  = await fetch('/ops/agents');
      var data = await res.json();
      if(data.activeCount !== undefined){
        var el = document.getElementById("agentActiveCount");
        if(el) el.textContent = data.activeCount;
      }
      var spawnerEl = document.getElementById("agentSpawnerStatus");
      if(spawnerEl && data.spawnerStatus) spawnerEl.textContent = data.spawnerStatus;
      var memoryEl = document.getElementById("agentMemoryStatus");
      if(memoryEl && data.memoryStatus) memoryEl.textContent = data.memoryStatus;
      if(data.squads){
        data.squads.forEach(function(squad){
          var lastEl = document.getElementById(squad.id+'-last');
          var memEl  = document.getElementById(squad.id+'-mem');
          if(lastEl) lastEl.textContent = squad.lastTask || 'No task yet';
          if(memEl)  memEl.textContent  = squad.memoryCount !== undefined ? squad.memoryCount + ' notes' : 'No notes';
        });
      }
    } catch(e) { /* endpoint not yet live — placeholder data shown */ }
  }

  async function fetchAgentMemory() {
    try {
      var res  = await fetch('/ops/agent-memory');
      var data = await res.json();
      if(data.recommendations && data.recommendations.length){
        var el = document.getElementById("agentRecommends");
        if(el) el.innerHTML = data.recommendations.map(function(r){
          return '<div class="recommendItem">'+esc(r)+'</div>';
        }).join('');
      }
    } catch(e) { /* endpoint not yet live */ }
  }

  /* ── EVENT LISTENERS ── */
  runBtn.addEventListener('click', function(){ postJson('/ops/check', runBtn, 'running'); });
  videoBtn.addEventListener('click', function(){
    postJson('/ops/video-test', videoBtn, 'generating', {
      niche:'realistic caught-on-camera horror videos',
      style:'horror',
      hook:'My dog would not stop barking at the yard',
      script:'Dark backyard. Motion sensor trips. Camera pans right. Something standing at the fence line. Light cuts to black.'
    });
  });
  postizBtn.addEventListener('click', function(){ postJson('/ops/postiz-test', postizBtn, 'scheduling'); });
  e2eBtn.addEventListener('click', function(){ postJson('/ops/e2e-test', e2eBtn, 'running-e2e'); });
  pauseBtn.addEventListener('click', function(){ postJson('/ops/pause', pauseBtn, 'pausing', { reason:'Paused from Empire OS' }); });
  resumeBtn.addEventListener('click', function(){ postJson('/ops/resume', resumeBtn, 'resuming', { reason:'Resumed from Empire OS' }); });

  /* ── INIT ── */
  setStatusClass(statusEl, "${escapeHtml(initialStatus)}");
  refreshStatus().catch(function(){});
  fetchAgents().catch(function(){});
  fetchAgentMemory().catch(function(){});
</script>
</body>
</html>`;
}
