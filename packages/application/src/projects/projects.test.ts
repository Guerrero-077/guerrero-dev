import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Project } from "@guerrero-dev/domain";
import type { IProjectRepository } from "../common/ports/IProjectRepository.js";
import { AddProject } from "./AddProject.js";
import { GetProject } from "./GetProject.js";
import { ListProjects } from "./ListProjects.js";
import { ResolveProjectFromCwd } from "./ResolveProjectFromCwd.js";

/** Fake en memoria — los tests unitarios no tocan PostgreSQL. */
class InMemoryProjectRepository implements IProjectRepository {
  private readonly projects: Project[] = [];

  async create(project: Project): Promise<Project> {
    this.projects.push(project);
    return project;
  }

  async findById(id: string): Promise<Project | null> {
    return this.projects.find((p) => p.id === id) ?? null;
  }

  async findByPath(path: string): Promise<Project | null> {
    return this.projects.find((p) => p.path === path) ?? null;
  }

  async findAll(): Promise<Project[]> {
    return [...this.projects];
  }
}

describe("AddProject", () => {
  it("crea un proyecto con id y timestamps generados", async () => {
    const repository = new InMemoryProjectRepository();
    const useCase = new AddProject(repository);

    const result = await useCase.execute({ name: "guerrero-dev", path: "/repos/guerrero-dev" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBeTruthy();
      expect(result.value.name).toBe("guerrero-dev");
      expect(result.value.path).toBe("/repos/guerrero-dev");
    }
  });

  it("devuelve Failure si falta name o path", async () => {
    const repository = new InMemoryProjectRepository();
    const useCase = new AddProject(repository);

    const result = await useCase.execute({ name: "", path: "/repos/x" });

    expect(result.ok).toBe(false);
  });
});

describe("ListProjects / GetProject", () => {
  it("lista los proyectos creados y permite buscarlos por id", async () => {
    const repository = new InMemoryProjectRepository();
    const add = new AddProject(repository);
    const list = new ListProjects(repository);
    const get = new GetProject(repository);

    const created = await add.execute({ name: "guerrero-dev", path: "/repos/guerrero-dev" });
    expect(created.ok).toBe(true);

    const all = await list.execute();
    expect(all).toHaveLength(1);

    if (created.ok) {
      const found = await get.execute(created.value.id);
      expect(found?.name).toBe("guerrero-dev");
    }
  });

  it("GetProject devuelve null si no existe", async () => {
    const repository = new InMemoryProjectRepository();
    const get = new GetProject(repository);

    await expect(get.execute("no-existe")).resolves.toBeNull();
  });
});

describe("ResolveProjectFromCwd", () => {
  it("resuelve el proyecto cuando startPath coincide exactamente con Project.path", async () => {
    const repository = new InMemoryProjectRepository();
    const root = join("/repos", "guerrero-dev");
    await new AddProject(repository).execute({ name: "guerrero-dev", path: root });
    const resolve = new ResolveProjectFromCwd(repository);

    const found = await resolve.execute(root);

    expect(found?.name).toBe("guerrero-dev");
  });

  it("recorre ancestros hasta encontrar el proyecto registrado", async () => {
    const repository = new InMemoryProjectRepository();
    const root = join("/repos", "guerrero-dev");
    await new AddProject(repository).execute({ name: "guerrero-dev", path: root });
    const resolve = new ResolveProjectFromCwd(repository);

    const found = await resolve.execute(join(root, "packages", "agent-core", "src"));

    expect(found?.name).toBe("guerrero-dev");
  });

  it("devuelve null si ningún ancestro está registrado", async () => {
    const repository = new InMemoryProjectRepository();
    const resolve = new ResolveProjectFromCwd(repository);

    const found = await resolve.execute(join("/repos", "otro-proyecto", "src"));

    expect(found).toBeNull();
  });

  it("no confunde un proyecto registrado en un directorio hermano", async () => {
    const repository = new InMemoryProjectRepository();
    await new AddProject(repository).execute({
      name: "hermano",
      path: join("/repos", "hermano"),
    });
    const resolve = new ResolveProjectFromCwd(repository);

    const found = await resolve.execute(join("/repos", "guerrero-dev", "src"));

    expect(found).toBeNull();
  });
});
