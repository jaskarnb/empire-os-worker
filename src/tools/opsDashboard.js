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
    return "<tr><td colspan=\"5\" class=\"muted\">No incidents recorded yet.</td></tr>";
  }
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

export function renderOpsDashboard({ incidents = [] } = {}) {
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
    button:disabled { opacity: 0.55; cursor: wait; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 18px; }
    .panel { border: 1px solid #30363d; border-radius: 8px; padding: 16px; background: #161b22; }
    .metric { font-size: 28px; font-weight: 800; margin-top: 6px; }
    .muted { color: #8b949e; }
    pre { white-space: pre-wrap; overflow: auto; background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 12px; max-height: 420px; }
    table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 8px; }
    th, td { border-bottom: 1px solid #30363d; padding: 10px; text-align: left; vertical-align: top; }
    th { color: #8b949e; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .badge { border-radius: 999px; padding: 3px 8px; font-weight: 800; font-size: 12px; background: #30363d; }
    .P0 { background: #da3633; color: white; }
    .P1 { background: #f0883e; color: #111; }
    .P2 { background: #d29922; color: #111; }
    .P3 { background: #1f6feb; color: white; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } header { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Empire OS Ops</h1>
      <div class="muted">Railway, Postiz, GitHub, render, secrets, and cost watchers</div>
    </div>
    <button id="runBtn">Run Check</button>
  </header>
  <main>
    <section class="grid">
      <div class="panel"><h2>Latest Status</h2><div id="status" class="metric">idle</div></div>
      <div class="panel"><h2>Incidents</h2><div id="incidentCount" class="metric">${incidents.length}</div></div>
      <div class="panel"><h2>Last Updated</h2><div id="updated" class="metric">now</div></div>
    </section>
    <section class="panel">
      <h2>Incident Memory</h2>
      <table>
        <thead><tr><th>Severity</th><th>Agent</th><th>Service</th><th>Problem</th><th>Time</th></tr></thead>
        <tbody id="incidentRows">${incidentRows(incidents)}</tbody>
      </table>
    </section>
    <section class="panel" style="margin-top:16px">
      <h2>Latest Check Report</h2>
      <pre id="report" class="muted">Click Run Check to execute watchers.</pre>
    </section>
  </main>
  <script>
    const runBtn = document.getElementById("runBtn");
    const statusEl = document.getElementById("status");
    const reportEl = document.getElementById("report");
    const updatedEl = document.getElementById("updated");
    const incidentCountEl = document.getElementById("incidentCount");
    const rowsEl = document.getElementById("incidentRows");
    function esc(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => {
        switch (char) {
          case "&": return "&amp;";
          case "<": return "&lt;";
          case ">": return "&gt;";
          case "\\\"": return "&quot;";
          case "'": return "&#039;";
          default: return char;
        }
      });
    }
    function drawIncidents(incidents) {
      incidentCountEl.textContent = incidents.length;
      rowsEl.innerHTML = incidents.length ? incidents.map(item => '<tr><td><span class="badge '+esc(item.severity)+'">'+esc(item.severity)+'</span></td><td>'+esc(item.agent)+'</td><td>'+esc(item.service)+'</td><td>'+esc(item.problem)+'</td><td>'+esc(item.ts)+'</td></tr>').join('') : '<tr><td colspan="5" class="muted">No incidents recorded yet.</td></tr>';
    }
    async function refreshStatus() {
      const res = await fetch('/ops/status');
      const data = await res.json();
      drawIncidents(data.recentIncidents || []);
      updatedEl.textContent = new Date().toLocaleTimeString();
    }
    runBtn.addEventListener('click', async () => {
      runBtn.disabled = true;
      statusEl.textContent = 'running';
      reportEl.textContent = 'Running watchers...';
      try {
        const res = await fetch('/ops/check', { method: 'POST' });
        const data = await res.json();
        statusEl.textContent = data.status || 'unknown';
        reportEl.textContent = JSON.stringify(data, null, 2);
        drawIncidents(data.recentIncidents || []);
      } catch (error) {
        statusEl.textContent = 'error';
        reportEl.textContent = error.message;
      } finally {
        updatedEl.textContent = new Date().toLocaleTimeString();
        runBtn.disabled = false;
      }
    });
    refreshStatus().catch(() => {});
  </script>
</body>
</html>`;
}
