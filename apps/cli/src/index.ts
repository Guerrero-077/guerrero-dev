#!/usr/bin/env node
import { Command } from "commander";
import { registerAgentCommands } from "./commands/agent.js";
import { runDoctor } from "./commands/doctor.js";
import { registerProjectCommands } from "./commands/project.js";

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
