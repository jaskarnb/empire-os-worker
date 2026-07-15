import fs from "fs";
import path from "path";

const INCIDENT_DIR = process.env.INCIDENT_DIR || "./output/incidents";
const INCIDENT_FILE = path.resolve(INCIDENT_DIR, "ops-incidents.jsonl");
const REPORT_FILE = path.resolve(INCIDENT_DIR, "ops-last-report.json");
const DEFAULT_ACTIVE_INCIDENT_HOURS = 24;

function ensureDir() {
  fs.mkdirSync(INCIDENT_DIR, { recursive: true });
}

function activeIncidentWindowMs() {
  const hours = Number(process.env.ACTIVE_INCIDENT_HOURS || DEFAULT_ACTIVE_INCIDENT_HOURS);
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_ACTIVE_INCIDENT_HOURS;
  return safeHours * 60 * 60 * 1000;
}

function isActiveIncident(incident, now = Date.now()) {
  const ts = Date.parse(incident?.ts || "");
  if (!Number.isFinite(ts)) return true;
  return now - ts <= activeIncidentWindowMs();
}

export function makeIncident({ agent, severity = "P3", service = "worker", problem, evidence = [], recommendedOwner = "Codex", recommendedAction = "Inspect logs and patch the failing component" }) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    agent,
    severity,
    service,
    problem,
    evidence,
    recommended_owner: recommendedOwner,
    recommended_action: recommendedAction,
  };
}

export function recordIncident(incident) {
  ensureDir();
  const duplicate = findActiveDuplicate(incident);
  if (duplicate) {
    const merged = {
      ...duplicate,
      duplicate_count: Number(duplicate.duplicate_count || 1) + 1,
      last_seen_at: incident.ts,
      evidence: [...new Set([...(duplicate.evidence || []), ...(incident.evidence || [])])].slice(0, 8),
    };
    rewriteIncident(duplicate.id, merged);
    console.error(`[Ops:${incident.severity}] ${incident.agent} - ${incident.problem} (deduped)`);
    return merged;
  }
  fs.appendFileSync(INCIDENT_FILE, `${JSON.stringify(incident)}\n`);
  console.error(`[Ops:${incident.severity}] ${incident.agent} - ${incident.problem}`);
  return incident;
}

function incidentFingerprint(incident) {
  return [
    incident?.agent || "",
    incident?.service || "",
    incident?.severity || "",
    incident?.problem || "",
  ].join("|").toLowerCase();
}

function findActiveDuplicate(incident) {
  const fingerprint = incidentFingerprint(incident);
  return readIncidentHistory(200)
    .filter((item) => isActiveIncident(item))
    .reverse()
    .find((item) => incidentFingerprint(item) === fingerprint);
}

function rewriteIncident(id, replacement) {
  if (!fs.existsSync(INCIDENT_FILE)) return;
  const lines = fs.readFileSync(INCIDENT_FILE, "utf8").split("\n").filter(Boolean);
  const updated = lines.map((line) => {
    try {
      const parsed = JSON.parse(line);
      return parsed.id === id ? JSON.stringify(replacement) : line;
    } catch {
      return line;
    }
  });
  fs.writeFileSync(INCIDENT_FILE, `${updated.join("\n")}\n`);
}

export function saveLastOpsReport(report) {
  ensureDir();
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  return report;
}

export function readLastOpsReport() {
  try {
    if (!fs.existsSync(REPORT_FILE)) return null;
    return JSON.parse(fs.readFileSync(REPORT_FILE, "utf8"));
  } catch (error) {
    return {
      status: "error",
      error: `Could not read last Ops report: ${error.message}`,
      ts: new Date().toISOString(),
    };
  }
}

export function readIncidentHistory(limit = 50) {
  try {
    if (!fs.existsSync(INCIDENT_FILE)) return [];
    return fs.readFileSync(INCIDENT_FILE, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line));
  } catch (error) {
    return [makeIncident({
      agent: "Ops Incident Store",
      severity: "P2",
      service: "incident-store",
      problem: "Could not read recent incidents",
      evidence: [error.message],
    })];
  }
}

export function readRecentIncidents(limit = 50) {
  const now = Date.now();
  return readIncidentHistory(limit * 3)
    .filter((incident) => isActiveIncident(incident, now))
    .slice(-limit);
}
