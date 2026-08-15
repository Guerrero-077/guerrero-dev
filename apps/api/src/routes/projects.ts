import type { FastifyInstance } from "fastify";
import type { AddProject, GetProject, ListProjects } from "@guerrero-dev/application";

interface CreateProjectBody {
  name?: string;
  path?: string;
}

export interface ProjectUseCases {
  addProject: AddProject;
  getProject: GetProject;
  listProjects: ListProjects;
}

export function registerProjectRoutes(app: FastifyInstance, useCases: ProjectUseCases): void {
  app.get("/api/v1/projects", async () => {
    const projects = await useCases.listProjects.execute();
    return { projects };
  });

  app.get<{ Params: { id: string } }>("/api/v1/projects/:id", async (request, reply) => {
    const project = await useCases.getProject.execute(request.params.id);
    if (!project) {
      reply.code(404);
      return { error: "Proyecto no encontrado" };
    }
    return { project };
  });

  app.post<{ Body: CreateProjectBody }>("/api/v1/projects", async (request, reply) => {
    const { name, path } = request.body ?? {};
    if (!name || !path) {
      reply.code(400);
      return { error: "name y path son requeridos" };
    }

    const result = await useCases.addProject.execute({ name, path });
    if (!result.ok) {
      reply.code(400);
      return { error: result.error.message };
    }

    reply.code(201);
    return { project: result.value };
  });
}
