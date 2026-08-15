import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import { loadConfig, pingOllama } from "@guerrero-dev/infrastructure";

const execFileAsync = promisify(execFile);

type CheckStatus = "ok" | "warn" | "fail";

interface CheckResult {
  label: string;
  status: CheckStatus;
  detail?: string;
}

const REQUIRED_NODE_MAJOR = 24;

async function checkNode(): Promise<CheckResult> {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= REQUIRED_NODE_MAJOR) {
    return { label: `Node.js ${major}`, status: "ok" };
  }
  return {
    label: `Node.js ${major}`,
    status: "fail",
    detail: `se requiere Node.js ${REQUIRED_NODE_MAJOR} LTS o superior`,
  };
}

async function checkCommand(label: string, command: string, args: string[]): Promise<CheckResult> {
  try {
    await execFileAsync(command, args);
    return { label, status: "ok" };
  } catch {
    return { label, status: "fail", detail: `no se encontró \`${command}\` en PATH` };
  }
}

async function checkPostgres(): Promise<CheckResult> {
  const config = loadConfig();
  const client = new pg.Client({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return { label: "PostgreSQL", status: "ok" };
  } catch (err) {
    return {
      label: "PostgreSQL",
      status: "fail",
      detail: err instanceof Error ? err.message : "no se pudo conectar",
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function checkOllama(): Promise<CheckResult> {
  const config = loadConfig();
  const reachable = await pingOllama(config.OLLAMA_BASE_URL);
  return reachable
    ? { label: "Ollama", status: "ok" }
    : { label: "Ollama", status: "fail", detail: `no responde en ${config.OLLAMA_BASE_URL}` };
}

async function checkGpu(): Promise<CheckResult> {
  try {
    const { stdout } = await execFileAsync("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"]);
    const name = stdout.trim().split("\n")[0];
    return name
      ? { label: `GPU: ${name}`, status: "ok" }
      : { label: "GPU model not configured", status: "warn" };
  } catch {
    return { label: "GPU model not configured", status: "warn" };
  }
}

const SYMBOLS: Record<CheckStatus, string> = { ok: "✓", warn: "⚠", fail: "✗" };

export async function runDoctor(): Promise<void> {
  console.log("\nGuerrero Dev Doctor\n");

  const checks = await Promise.all([
    checkNode(),
    checkCommand("pnpm", "pnpm", ["-v"]),
    checkPostgres(),
    checkCommand("Docker", "docker", ["-v"]),
    checkCommand("Git", "git", ["--version"]),
    checkOllama(),
    checkGpu(),
  ]);

  for (const check of checks) {
    const line = `${SYMBOLS[check.status]} ${check.label}${check.detail ? ` — ${check.detail}` : ""}`;
    console.log(line);
  }

  console.log("");

  const hasFailure = checks.some((c) => c.status === "fail");
  if (hasFailure) {
    process.exitCode = 1;
  }
}
