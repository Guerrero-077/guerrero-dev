#!/usr/bin/env node
import { Command } from "commander";
import { runDoctor } from "./commands/doctor.js";

const program = new Command();

program.name("guerrero").description("Guerrero Dev CLI").version("0.1.0");

program
  .command("doctor")
  .description("Verifica que el entorno tenga todo lo necesario para correr Guerrero Dev")
  .action(runDoctor);

// Placeholders (Fase 7 en adelante — ver docs/fase-3-foundation.md):
//   guerrero project add
//   guerrero project analyze
//   guerrero memory search
//   guerrero agent run

program.parse();
