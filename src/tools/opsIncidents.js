import fs from "fs";
import path from "path";

const INCIDENT_DIR = process.env.INCIDENT_DIR || "./output/incidents";
const INCIDENT_FILE = path.resolve(INCIDENT_DIR, "ops-incidents.jsonl");

function ensureDir() {
  fs.mkdirSync(INCIDENT_DIR, { recursive: true });
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
  fs.appendFileSync(INCIDENT_FILE, `${JSON.stringify(incident)}\n`);
  console.error(`[Ops:${incident.severity}] ${incident.agent} - ${incident.problem}`);
  return incident;
}

export function readRecentIncidents(limit = 50) {
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
