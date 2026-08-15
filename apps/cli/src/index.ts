#!/usr/bin/env node
import { Command } from "commander";
import { runDoctor } from "./commands/doctor.js";
import { registerProjectCommands } from "./commands/project.js";

const program = new Command();

program.name("guerrero").description("Guerrero Dev CLI").version("0.1.0");

program
  .command("doctor")
  .description("Verifica que el entorno tenga todo lo necesario para correr Guerrero Dev")
  .action(runDoctor);

registerProjectCommands(program);

// Placeholders (Fase 5 en adelante — ver docs/fase-3-implementacion.md):
//   guerrero project analyze
//   guerrero memory search
//   guerrero agent run

program.parse();
