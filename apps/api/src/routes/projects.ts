import type { FastifyInstance } from "fastify";
import type { ProjectService } from "@guerrero-dev/application";

interface CreateProjectBody {
  name?: string;
  rootPath?: string;
}

export function registerProjectRoutes(app: FastifyInstance, projectService: ProjectService): void {
  app.get("/api/v1/projects", async () => {
    const projects = await projectService.listProjects();
    return { projects };
  });

  app.get<{ Params: { id: string } }>("/api/v1/projects/:id", async (request, reply) => {
    const project = await projectService.getProject(request.params.id);
    if (!project) {
      reply.code(404);
      return { error: "Proyecto no encontrado" };
    }
    return { project };
  });

  app.post<{ Body: CreateProjectBody }>("/api/v1/projects", async (request, reply) => {
    const { name, rootPath } = request.body ?? {};
    if (!name || !rootPath) {
      reply.code(400);
      return { error: "name y rootPath son requeridos" };
    }

    const project = await projectService.createProject({ name, rootPath });
    reply.code(201);
    return { project };
  });
}
