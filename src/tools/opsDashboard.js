function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function incidentRows(incidents) {
  if (!incidents.length) return "<tr><td colspan=\"5\" class=\"muted\">No incidents recorded yet.</td></tr>";
  return incidents.map((item) => `
    <tr>
      <td><span class="badge ${escapeHtml(item.severity)}">${escapeHtml(item.severity)}</span></td>
      <td>${escapeHtml(item.agent)}</td>
      <td>${escapeHtml(item.service)}</td>
      <td>${escapeHtml(item.problem)}</td>
      <td>${escapeHtml(item.ts)}</td>
    </tr>
  `).join("");
}

function checkCards(report) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  if (!checks.length) return "<div class=\"muted\">No watcher check has run yet.</div>";
  return checks.map((check) => {
    const details = check.incident || check.details || {};
    return `
      <article class="check ${escapeHtml(check.status)}">
        <div class="checkTop"><strong>${escapeHtml(check.agent)}</strong><span class="badge ${escapeHtml(check.severity)}">${escapeHtml(check.severity)}</span></div>
        <div class="statusLine">${escapeHtml(check.status)}</div>
        <pre>${escapeHtml(JSON.stringify(details, null, 2))}</pre>
      </article>
    `;
  }).join("");
}

export function renderOpsDashboard({ incidents = [], lastReport = null } = {}) {
  const initialStatus = lastReport?.status || "idle";
  const initialUpdated = lastReport?.finishedAt ? new Date(lastReport.finishedAt).toLocaleTimeString() : "never";
  const initialReport = lastReport ? escapeHtml(JSON.stringify(lastReport, null, 2)) : "Click Run Check to execute watchers.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Empire OS Ops</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0d1117; color: #e6edf3; }
    body { margin: 0; background: #0d1117; }
    header { padding: 20px 24px; border-bottom: 1px solid #30363d; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0; font-size: 22px; font-weight: 700; }
    h2 { margin: 0 0 12px; font-size: 16px; }
    button { background: #238636; color: white; border: 0; border-radius: 6px; padding: 10px 14px; font-weight: 700; cursor: pointer; }
    button.secondary { background: #1f6feb; }
    button.warn { background: #da3633; }
    button:disabled { opacity: 0.55; cursor: wait; }
    a { color: #58a6ff; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 18px; }
    .opsGrid, .checkGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .opsGrid { margin-bottom: 18px; }
    .panel { border: 1px solid #30363d; border-radius: 8px; padding: 16px; background: #161b22; }
    .check { border: 1px solid #30363d; border-radius: 8px; padding: 14px; background: #0d1117; }
    .check.incident { border-color: #f0883e; }
    .check.notice { border-color: #d29922; }
    .check.ok { border-color: #238636; }
    .checkTop { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .statusLine { color: #8b949e; margin: 6px 0 10px; text-transform: capitalize; }
    .metric { font-size: 28px; font-weight: 800; margin-top: 6px; }
    .muted { color: #8b949e; }
    .miniList { display: grid; gap: 10px; }
    .miniItem { border-top: 1px solid #30363d; padding-top: 10px; }
    .miniItem:first-child { border-top: 0; padding-top: 0; }
    pre { white-space: pre-wrap; overflow: auto; background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 12px; max-height: 420px; }
    .check pre { max-height: 180px; margin: 0; color: #8b949e; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 8px; }
    th, td { border-bottom: 1px solid #30363d; padding: 10px; text-align: left; vertical-align: top; }
    th { color: #8b949e; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .badge { border-radius: 999px; padding: 3px 8px; font-weight: 800; font-size: 12px; background: #30363d; }
    .P0 { background: #da3633; color: white; }
    .P1 { background: #f0883e; color: #111; }
    .P2 { background: #d29922; color: #111; }
    .P3 { background: #1f6feb; color: white; }
    @media (max-width: 860px) { .grid, .opsGrid, .checkGrid { grid-template-columns: 1fr; } header { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Empire OS Ops</h1>
      <div class="muted">Automation control, spend, scheduling, niches, watchers, and render tests</div>
    </div>
    <div class="actions">
      <button id="runBtn">Run Check</button>
      <button id="e2eBtn" class="secondary">Run E2E Test</button>
      <button id="videoBtn" class="secondary">Run Video Test</button>
      <button id="postizBtn" class="secondary">Run Postiz Test</button>
      <button id="pauseBtn" class="warn">Pause</button>
      <button id="resumeBtn" class="secondary">Resume</button>
    </div>
  </header>
  <main>
    <section class="grid">
      <div class="panel"><h2>Latest Status</h2><div id="status" class="metric">${escapeHtml(initialStatus)}</div></div>
      <div class="panel"><h2>Incidents</h2><div id="incidentCount" class="metric">${incidents.length}</div></div>
      <div class="panel"><h2>Last Updated</h2><div id="updated" class="metric">${escapeHtml(initialUpdated)}</div></div>
    </section>
    <section class="opsGrid">
      <div class="panel"><h2>Automation Control</h2><div id="controlState" class="miniList muted">Loading...</div></div>
      <div class="panel"><h2>Spend Guard</h2><div id="spendState" class="miniList muted">Loading...</div></div>
      <div class="panel"><h2>Scheduled Posts</h2><div id="scheduledState" class="miniList muted">Loading...</div></div>
      <div class="panel"><h2>Niche Scout</h2><div id="nicheState" class="miniList muted">Loading...</div></div>
    </section>
    <section class="panel" style="margin-bottom:16px"><h2>Latest Video</h2><a href="/ops/latest-video-page" target="_blank" rel="noreferrer">Open latest video preview</a></section>
    <section class="panel"><h2>Watcher Checks</h2><div id="checkCards" class="checkGrid">${checkCards(lastReport)}</div></section>
    <section class="panel" style="margin-top:16px"><h2>Incident Memory</h2><table><thead><tr><th>Severity</th><th>Agent</th><th>Service</th><th>Problem</th><th>Time</th></tr></thead><tbody id="incidentRows">${incidentRows(incidents)}</tbody></table></section>
    <section class="panel" style="margin-top:16px"><h2>Latest Check Report</h2><pre id="report" class="muted">${initialReport}</pre></section>
  </main>
  <script>
    const ids = ['runBtn','videoBtn','postizBtn','e2eBtn','pauseBtn','resumeBtn','status','report','updated','incidentCount','incidentRows','checkCards','controlState','spendState','scheduledState','nicheState'];
    const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
    function esc(value) { return String(value ?? '').replace(/[&<>']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;' }[char])); }
    function drawIncidents(incidents) {
      el.incidentCount.textContent = incidents.length;
      el.incidentRows.innerHTML = incidents.length ? incidents.map(item => '<tr><td><span class="badge '+esc(item.severity)+'">'+esc(item.severity)+'</span></td><td>'+esc(item.agent)+'</td><td>'+esc(item.service)+'</td><td>'+esc(item.problem)+'</td><td>'+esc(item.ts)+'</td></tr>').join('') : '<tr><td colspan="5" class="muted">No incidents recorded yet.</td></tr>';
    }
    function drawChecks(report) {
      const checks = Array.isArray(report?.checks) ? report.checks : [];
      el.checkCards.innerHTML = checks.length ? checks.map(check => '<article class="check '+esc(check.status)+'"><div class="checkTop"><strong>'+esc(check.agent)+'</strong><span class="badge '+esc(check.severity)+'">'+esc(check.severity)+'</span></div><div class="statusLine">'+esc(check.status)+'</div><pre>'+esc(JSON.stringify(check.incident || check.details || {}, null, 2))+'</pre></article>').join('') : '<div class="muted">No watcher check has run yet.</div>';
    }
    function drawOpsState(data) {
      const control = data.control || {};
      const spend = data.spend || {};
      const scheduled = data.scheduledPosts || [];
      const analytics = data.analytics || [];
      el.controlState.innerHTML = '<div class="miniItem"><strong>'+esc(control.paused ? 'Paused' : 'Running')+'</strong></div><div class="miniItem">'+esc(control.reason || 'No manual control note')+'</div>';
      el.spendState.innerHTML = '<div class="miniItem"><strong>$'+esc(spend.estimatedSpend ?? 0)+'</strong> spent today</div><div class="miniItem">Budget: $'+esc(spend.dailyBudget ?? 0)+' | Renders: '+esc(spend.renders ?? 0)+' | Remaining: $'+esc(spend.remaining ?? 0)+'</div>';
      el.scheduledState.innerHTML = scheduled.length ? scheduled.slice(0, 5).map(post => '<div class="miniItem"><strong>'+esc(post.title || 'Untitled')+'</strong><br>'+esc(post.channelName || 'channel')+' | '+esc(post.scheduledFor || '')+'</div>').join('') : '<div class="miniItem">No scheduled posts recorded yet.</div>';
      el.nicheState.innerHTML = analytics.length ? '<div class="miniItem">'+esc(analytics.length)+' analytics snapshot(s) saved</div>' : '<div class="miniItem">Analytics will fill in after posts publish.</div>';
      fetch('/ops/niches').then(res => res.json()).then(niches => {
        const top = (niches.recommendations || []).slice(0, 4);
        if (top.length) el.nicheState.innerHTML = top.map(item => '<div class="miniItem"><strong>'+esc(item.action.toUpperCase())+'</strong> '+esc(item.niche)+'<br>Score '+esc(item.score)+' - '+esc(item.reason)+'</div>').join('');
      }).catch(() => {});
    }
    async function refreshStatus() {
      const res = await fetch('/ops/status');
      const data = await res.json();
      drawIncidents(data.recentIncidents || []);
      drawOpsState(data);
      if (data.lastReport) {
        el.status.textContent = data.lastReport.status || 'unknown';
        el.report.textContent = JSON.stringify(data.lastReport, null, 2);
        el.updated.textContent = data.lastReport.finishedAt ? new Date(data.lastReport.finishedAt).toLocaleTimeString() : new Date().toLocaleTimeString();
        drawChecks(data.lastReport);
      }
    }
    async function post(path, button, loading) {
      button.disabled = true;
      el.status.textContent = loading;
      el.report.textContent = loading + '...';
      try {
        const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const data = await res.json();
        el.status.textContent = data.status || 'unknown';
        el.report.textContent = JSON.stringify(data, null, 2);
        if (data.checks) drawChecks(data);
        if (data.recentIncidents) drawIncidents(data.recentIncidents);
        await refreshStatus();
      } catch (error) {
        el.status.textContent = 'error';
        el.report.textContent = error.message;
      } finally {
        el.updated.textContent = new Date().toLocaleTimeString();
        button.disabled = false;
      }
    }
    el.runBtn.addEventListener('click', () => post('/ops/check', el.runBtn, 'running'));
    el.videoBtn.addEventListener('click', () => post('/ops/video-test', el.videoBtn, 'rendering'));
    el.postizBtn.addEventListener('click', () => post('/ops/postiz-test', el.postizBtn, 'scheduling'));
    el.e2eBtn.addEventListener('click', () => post('/ops/e2e-test', el.e2eBtn, 'running-e2e'));
    el.pauseBtn.addEventListener('click', () => post('/ops/pause', el.pauseBtn, 'pausing'));
    el.resumeBtn.addEventListener('click', () => post('/ops/resume', el.resumeBtn, 'resuming'));
    refreshStatus().catch(() => {});
  </script>
</body>
</html>`;
}
