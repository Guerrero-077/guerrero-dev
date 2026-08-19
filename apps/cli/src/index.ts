#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { registerAgentCommands } from "./commands/agent.js";
import { runDoctor } from "./commands/doctor.js";
import { registerProjectCommands } from "./commands/project.js";

// Carga el `.env` de este repo si existe (API nativa de Node, sin
// dependencias nuevas) — `loadConfig()` (`packages/infrastructure`) lee
// directo de `process.env` y no tiene ningún mecanismo propio de carga de
// `.env`. Resuelto relativo a este archivo (no a `process.cwd()`): `guerrero`
// es un CLI pensado para invocarse desde cualquier directorio contra
// proyectos externos (`guerrero project add`), así que su propio `.env`
// (DATABASE_URL/OLLAMA_* de ESTE repo, no del proyecto target) tiene que
// resolverse contra su propia instalación, no contra el cwd de quien lo
// invoca. Tres niveles arriba desde `src/index.ts` (o el `dist/index.js`
// compilado, misma profundidad) llega a la raíz del repo. Silenciado a
// propósito: el archivo es opcional (CI y `pnpm test` no lo necesitan, todo
// tiene default en el schema de `loadConfig`).
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // sin .env — se sigue con los defaults de loadConfig()
}

const program = new Command();

program.name("guerrero").description("Guerrero Dev CLI").version("0.1.0");

program
  .command("doctor")
  .description("Verifica que el entorno tenga todo lo necesario para correr Guerrero Dev")
  .action(runDoctor);

registerProjectCommands(program);
registerAgentCommands(program);

// Placeholders (Fase 6 en adelante — ver docs/roadmap-maestro.md §7):
//   guerrero project analyze
//   guerrero memory search

program.parse();
