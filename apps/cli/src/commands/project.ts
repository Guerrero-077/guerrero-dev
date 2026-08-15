import { Command } from "commander";
import { createCliContext } from "../context.js";

export function registerProjectCommands(program: Command): void {
  const project = program.command("project").description("Gestiona proyectos de Guerrero Dev");

  project
    .command("add <name> <path>")
    .description("Registra un proyecto nuevo")
    .action(async (name: string, path: string) => {
      const ctx = createCliContext();
      try {
        const result = await ctx.addProject.execute({ name, path });
        if (!result.ok) {
          console.error(`✗ ${result.error.message}`);
          process.exitCode = 1;
          return;
        }
        console.log(`✓ Proyecto creado: ${result.value.name} (${result.value.id})`);
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      } finally {
        await ctx.dispose();
      }
    });

  project
    .command("list")
    .description("Lista los proyectos registrados")
    .action(async () => {
      const ctx = createCliContext();
      try {
        const projects = await ctx.listProjects.execute();
        if (projects.length === 0) {
          console.log("Sin proyectos registrados todavía. Usa `guerrero project add <name> <path>`.");
          return;
        }
        for (const p of projects) {
          console.log(`${p.id}  ${p.name}  ${p.path}`);
        }
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      } finally {
        await ctx.dispose();
      }
    });
}
