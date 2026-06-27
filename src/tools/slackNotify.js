function slackEnabled() {
  return process.env.SLACK_NOTIFICATIONS_ENABLED === "true" && Boolean(process.env.SLACK_WEBHOOK_URL);
}

function appName() {
  return process.env.SLACK_APP_NAME || "Empire OS";
}

function trim(value, max = 900) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function severityEmoji(status) {
  const lower = String(status || "").toLowerCase();
  if (["p0", "fail", "error", "incident", "urgent"].includes(lower)) return ":rotating_light:";
  if (["attention", "notice", "warning"].includes(lower)) return ":warning:";
  if (["pass", "ok", "scheduled", "published"].includes(lower)) return ":white_check_mark:";
  return ":information_source:";
}

function shouldNotify(level = "info") {
  const allowed = (process.env.SLACK_NOTIFY_LEVELS || "urgent,warning,success,daily")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(String(level).toLowerCase());
}

export function isSlackConfigured() {
  return slackEnabled();
}

export async function notifySlack({ title, message = "", level = "info", fields = [], url = "" } = {}) {
  if (!slackEnabled() || !shouldNotify(level)) {
    return { status: "skipped", reason: "slack-not-enabled-or-level-filtered" };
  }

  const cleanTitle = trim(title || "Empire OS update", 140);
  const cleanMessage = trim(message, 1800);
  const fieldLines = fields
    .filter((field) => field?.label && field?.value !== undefined && field?.value !== null && field?.value !== "")
    .map((field) => `*${trim(field.label, 60)}:* ${trim(field.value, 220)}`);
  const lines = [
    `${severityEmoji(level)} *${appName()}: ${cleanTitle}*`,
    cleanMessage,
    ...fieldLines,
    /^https?:\/\//i.test(url) ? `<${url}|Open dashboard>` : "",
  ].filter(Boolean);

  const res = await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: lines.join("\n") }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Slack webhook failed: ${res.status} ${text.slice(0, 240)}`);
  }

  return { status: "sent" };
}

export async function notifyOpsReport(report) {
  const status = String(report?.status || "unknown").toLowerCase();
  if (status === "ok" && process.env.SLACK_NOTIFY_OK_WATCHERS !== "true") {
    return { status: "skipped", reason: "ok-watchers-muted" };
  }

  const incidents = (report?.checks || []).filter((check) => check.status === "incident");
  const notices = (report?.checks || []).filter((check) => check.status === "notice");
  const level = status === "p0" ? "urgent" : status === "attention" ? "warning" : status === "notice" ? "warning" : "success";

  return notifySlack({
    title: `Ops watcher ${status}`,
    level,
    message: incidents.length
      ? `Empire OS found ${incidents.length} incident(s). Top issue: ${trim(incidents[0]?.incident?.problem || incidents[0]?.agent, 220)}`
      : notices.length
        ? `Empire OS has ${notices.length} notice(s), but no critical incident.`
        : "All configured watchers passed.",
    fields: [
      { label: "Incidents", value: incidents.length },
      { label: "Notices", value: notices.length },
      { label: "Finished", value: report?.finishedAt || new Date().toISOString() },
    ],
    url: `${process.env.PUBLIC_WORKER_URL || ""}/ops/dashboard`,
  });
}
