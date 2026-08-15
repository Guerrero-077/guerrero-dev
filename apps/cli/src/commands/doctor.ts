import { exec, execFile } from "node:child_process";
import * as net from "node:net";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import pg from "pg";
import { loadConfig, pingOllama } from "@guerrero-dev/infrastructure";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const require = createRequire(import.meta.url);

type CheckStatus = "ok" | "warn" | "fail" | "info";

interface CheckResult {
  label: string;
  status: CheckStatus;
  detail?: string;
}

interface Section {
  title: string;
  checks: CheckResult[];
}

const REQUIRED_NODE_MAJOR = 24;
const SYMBOLS: Record<CheckStatus, string> = { ok: "✓", warn: "⚠", fail: "✗", info: "○" };

// ---------- Environment ----------

function checkNode(): CheckResult {
  const major = Number(process.versions.node.split(".")[0]);
  return major >= REQUIRED_NODE_MAJOR
    ? { label: `Node.js ${major}`, status: "ok" }
    : {
        label: `Node.js ${major}`,
        status: "fail",
        detail: `se requiere Node.js ${REQUIRED_NODE_MAJOR} LTS o superior`,
      };
}

async function checkCommand(label: string, command: string, args: string[]): Promise<CheckResult> {
  try {
    // `exec` (vía shell) es necesario en Windows para resolver shims
    // .cmd/.ps1 (p. ej. pnpm instalado vía corepack) — `execFile` sin
    // shell solo encuentra ejecutables .exe reales en PATH. `command` y
    // `args` son siempre literales fijos del propio código, nunca input
    // externo, así que concatenarlos en un solo string es seguro aquí.
    await execAsync([command, ...args].join(" "));
    return { label, status: "ok" };
  } catch {
    return { label, status: "fail", detail: `no se encontró \`${command}\` en PATH` };
  }
}

function checkTypescript(): CheckResult {
  try {
    const pkg = require("typescript/package.json") as { version: string };
    return { label: `TypeScript ${pkg.version}`, status: "ok" };
  } catch {
    return { label: "TypeScript", status: "fail", detail: "no se encontró el paquete typescript" };
  }
}

// ---------- Infrastructure ----------

function checkTcpReachable(
  label: string,
  host: string,
  port: number,
  timeoutMs = 1200,
): Promise<CheckResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (status: CheckStatus, detail?: string): void => {
      socket.destroy();
      resolve(detail === undefined ? { label, status } : { label, status, detail });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish("ok"));
    socket.once("timeout", () => finish("fail", "timeout"));
    socket.once("error", (err) => finish("fail", err.message));
    socket.connect(port, host);
  });
}

async function checkPgvector(): Promise<CheckResult> {
  const config = loadConfig();
  const client = new pg.Client({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    const res = await client.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'",
    );
    return res.rowCount && res.rowCount > 0
      ? { label: "pgvector", status: "ok" }
      : { label: "pgvector", status: "fail", detail: "extensión no instalada (CREATE EXTENSION vector)" };
  } catch (err) {
    return {
      label: "pgvector",
      status: "fail",
      detail: err instanceof Error ? err.message : "no se pudo verificar",
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

// ---------- Application ----------

async function checkDatabaseConnection(): Promise<CheckResult> {
  const config = loadConfig();
  const client = new pg.Client({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return { label: "Database", status: "ok" };
  } catch (err) {
    return {
      label: "Database",
      status: "fail",
      detail: err instanceof Error ? err.message : "no se pudo conectar",
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function checkConfiguration(): CheckResult {
  try {
    loadConfig();
    return { label: "Configuration", status: "ok" };
  } catch (err) {
    return {
      label: "Configuration",
      status: "fail",
      detail: err instanceof Error ? err.message : "configuración inválida",
    };
  }
}

function checkApiPortFree(port: number): Promise<CheckResult> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve({ label: "API", status: "warn", detail: `puerto ${port} ya en uso — ¿ya está corriendo?` });
      } else {
        resolve({ label: "API", status: "fail", detail: err.message });
      }
    });
    server.once("listening", () => {
      server.close(() => resolve({ label: "API", status: "ok" }));
    });
    server.listen(port, "0.0.0.0");
  });
}

// ---------- AI ----------

async function checkOllama(): Promise<CheckResult> {
  const config = loadConfig();
  const reachable = await pingOllama(config.OLLAMA_BASE_URL);
  return reachable
    ? { label: "Ollama", status: "ok" }
    : { label: "Ollama", status: "warn", detail: `no responde en ${config.OLLAMA_BASE_URL}` };
}

async function checkGpu(): Promise<CheckResult> {
  try {
    const { stdout } = await execFileAsync("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"]);
    const name = stdout.trim().split("\n")[0];
    return name
      ? { label: `GPU: ${name}`, status: "ok" }
      : { label: "GPU", status: "warn", detail: "no detectada" };
  } catch {
    return { label: "GPU", status: "warn", detail: "no detectada" };
  }
}

// ---------- Render ----------

function renderBox(title: string): string {
  const innerWidth = title.length + 8;
  const top = `╭${"─".repeat(innerWidth)}╮`;
  const bottom = `╰${"─".repeat(innerWidth)}╯`;
  const pad = innerWidth - title.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  const middle = `│${" ".repeat(left)}${title}${" ".repeat(right)}│`;
  return [top, middle, bottom].join("\n");
}

function renderSection(section: Section): string {
  const lines = section.checks.map(
    (c) => `  ${SYMBOLS[c.status]} ${c.label}${c.detail ? ` — ${c.detail}` : ""}`,
  );
  return [section.title, ...lines].join("\n");
}

export async function runDoctor(): Promise<void> {
  const config = loadConfig();
  const dbUrl = new URL(config.DATABASE_URL);
  const dbPort = dbUrl.port ? Number(dbUrl.port) : 5432;

  const environment: CheckResult[] = [
    checkNode(),
    await checkCommand("pnpm", "pnpm", ["-v"]),
    checkTypescript(),
    await checkCommand("Git", "git", ["--version"]),
  ];

  const infrastructure: CheckResult[] = [
    await checkCommand("Docker", "docker", ["-v"]),
    await checkTcpReachable("PostgreSQL", dbUrl.hostname, dbPort),
    await checkPgvector(),
  ];

  const application: CheckResult[] = [
    await checkApiPortFree(config.API_PORT),
    await checkDatabaseConnection(),
    checkConfiguration(),
  ];

  const ai: CheckResult[] = [
    await checkOllama(),
    await checkGpu(),
    { label: "Local model", status: "info", detail: "sin seleccionar — ModelRegistry llega en Fase 4+" },
    { label: "Embeddings", status: "info", detail: "dimensión no congelada — ver Fase 3.8" },
  ];

  const sections: Section[] = [
    { title: "Environment", checks: environment },
    { title: "Infrastructure", checks: infrastructure },
    { title: "Application", checks: application },
    { title: "AI", checks: ai },
  ];

  console.log(`\n${renderBox("GUERRERO DEV DOCTOR")}\n`);
  for (const section of sections) {
    console.log(renderSection(section));
    console.log("");
  }

  const allChecks = sections.flatMap((s) => s.checks);
  const ready = !allChecks.some((c) => c.status === "fail");
  console.log(`Status: ${ready ? "READY" : "NOT READY"}\n`);

  if (!ready) {
    process.exitCode = 1;
  }
}
