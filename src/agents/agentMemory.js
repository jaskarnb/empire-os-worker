import fs from "fs";
import path from "path";

const memoryDir = () => path.resolve(process.env.AGENT_MEMORY_DIR || "./output/agent-memory");
const sharedPath = () => path.join(memoryDir(), "shared-memory.json");
const agentPath = (agentId) => path.join(memoryDir(), `${agentId}.json`);
const obsidianVaultDir = () => process.env.OBSIDIAN_VAULT_PATH ? path.resolve(process.env.OBSIDIAN_VAULT_PATH) : null;
const obsidianAgentDir = () => {
  const vault = obsidianVaultDir();
  return vault ? path.join(vault, process.env.OBSIDIAN_AGENT_MEMORY_DIR || "Empire OS/Agent Memory") : null;
};

function ensureDir() {
  fs.mkdirSync(memoryDir(), { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  return value;
}

function clean(value, max = 1200) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function safeFilePart(value) {
  return clean(value || "unknown", 120)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";
}

function appendObsidianMemory(item) {
  const dir = obsidianAgentDir();
  if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const filePath = path.join(dir, `${day}-${safeFilePart(item.agentId)}.md`);
  const block = [
    `## ${item.ts} - ${item.type}`,
    "",
    `- Agent: ${item.agentId}`,
    item.taskId ? `- Task: ${item.taskId}` : null,
    item.content ? `- Note: ${item.content}` : null,
    item.data && Object.keys(item.data).length ? `- Data: \`${JSON.stringify(item.data).replace(/`/g, "'")}\`` : null,
    "",
  ].filter(Boolean).join("\n");
  fs.appendFileSync(filePath, `${block}\n`);
  return filePath;
}

function entry({ type = "note", agentId = "system", taskId = null, content = "", data = {} } = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    type,
    agentId,
    taskId,
    content: clean(content),
    data,
  };
}

export function rememberForAgent(agentId, memory) {
  const filePath = agentPath(agentId);
  const existing = readJson(filePath, []);
  const item = entry({ ...memory, agentId });
  appendObsidianMemory(item);
  return writeJson(filePath, [item, ...existing].slice(0, 250));
}

export function rememberShared(memory) {
  const existing = readJson(sharedPath(), []);
  const item = entry(memory);
  appendObsidianMemory(item);
  return writeJson(sharedPath(), [item, ...existing].slice(0, 500));
}

export function getAgentMemory(agentId, limit = 25) {
  return readJson(agentPath(agentId), []).slice(0, limit);
}

export function getSharedMemory(limit = 50) {
  return readJson(sharedPath(), []).slice(0, limit);
}

export function getTeamMemory(agentIds = [], limit = 80) {
  const memories = [
    ...getSharedMemory(limit),
    ...agentIds.flatMap((agentId) => getAgentMemory(agentId, limit)),
  ];
  return memories
    .sort((a, b) => Date.parse(b.ts || 0) - Date.parse(a.ts || 0))
    .slice(0, limit);
}

export function getMemoryStatus() {
  const obsidianDir = obsidianAgentDir();
  return {
    localMemoryDir: memoryDir(),
    obsidianEnabled: Boolean(obsidianDir),
    obsidianAgentDir: obsidianDir,
  };
}
