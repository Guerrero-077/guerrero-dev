import { describe, expect, it } from "vitest";
import type { Project } from "@guerrero-dev/domain";
import type { CreateProjectInput, IProjectRepository } from "../common/ports/IProjectRepository.js";
import { ProjectService } from "./ProjectService.js";

/** Fake en memoria — así el test unitario no toca PostgreSQL. */
class InMemoryProjectRepository implements IProjectRepository {
  private readonly projects: Project[] = [];

  async findAll(): Promise<Project[]> {
    return [...this.projects];
  }

  async findById(id: string): Promise<Project | null> {
    return this.projects.find((p) => p.id === id) ?? null;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const project: Project = {
      id: String(this.projects.length + 1),
      name: input.name,
      rootPath: input.rootPath,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.projects.push(project);
    return project;
  }
}

describe("ProjectService", () => {
  it("crea y lista proyectos", async () => {
    const service = new ProjectService(new InMemoryProjectRepository());

    await service.createProject({ name: "guerrero-dev", rootPath: "/repos/guerrero-dev" });
    const all = await service.listProjects();

    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe("guerrero-dev");
  });

  it("getProject devuelve null si no existe", async () => {
    const service = new ProjectService(new InMemoryProjectRepository());

    await expect(service.getProject("no-existe")).resolves.toBeNull();
  });
});
