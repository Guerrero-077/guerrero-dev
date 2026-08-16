import { describe, expect, it } from "vitest";
import {
  isKnownSchemaVersion,
  isRelativePath,
  isValidComponent,
  isValidTechnology,
} from "./ProjectProfileInvariants.js";
import type { ProjectComponent } from "./ProjectComponent.js";
import type { Technology, TechnologyCategory } from "./Technology.js";

describe("isKnownSchemaVersion", () => {
  it("acepta la única versión congelada en v1", () => {
    expect(isKnownSchemaVersion(1)).toBe(true);
  });

  it.each([0, 2, -1, Number.NaN])("rechaza versiones no registradas (%s)", (value) => {
    expect(isKnownSchemaVersion(value)).toBe(false);
  });
});

describe("isRelativePath", () => {
  it("acepta una ruta relativa canónica", () => {
    expect(isRelativePath("apps/api/package.json")).toBe(true);
  });

  it("acepta un prefijo './' — no viola ninguna regla del contrato congelado", () => {
    expect(isRelativePath("./x")).toBe(true);
  });

  it.each([
    "",
    "/apps/api",
    "C:\\Dev\\guerrero-dev",
    "C:/Dev/guerrero-dev",
    "\\apps\\api",
    "../apps",
    "apps/../secret",
  ])("rechaza rutas no relativas o que escapan del root (%s)", (value) => {
    expect(isRelativePath(value)).toBe(false);
  });
});

describe("isValidTechnology", () => {
  const valid: Technology = {
    name: "Fastify",
    category: "framework",
    sourceFile: "apps/api/package.json",
    evidence: "dependencies.fastify",
  };

  it("acepta una tecnología con evidencia trazable", () => {
    expect(isValidTechnology(valid)).toBe(true);
  });

  it("rechaza name vacío", () => {
    expect(isValidTechnology({ ...valid, name: "" })).toBe(false);
  });

  it("rechaza category desconocida", () => {
    expect(isValidTechnology({ ...valid, category: "database" as TechnologyCategory })).toBe(
      false,
    );
  });

  it("rechaza evidence vacío", () => {
    expect(isValidTechnology({ ...valid, evidence: "" })).toBe(false);
  });

  it("rechaza sourceFile absoluto", () => {
    expect(isValidTechnology({ ...valid, sourceFile: "/etc/passwd" })).toBe(false);
  });
});

describe("isValidComponent", () => {
  const valid: ProjectComponent = { name: "api", path: "apps/api", type: "app" };

  it("acepta un componente con path relativo", () => {
    expect(isValidComponent(valid)).toBe(true);
  });

  it("rechaza name vacío", () => {
    expect(isValidComponent({ ...valid, name: "" })).toBe(false);
  });

  it("rechaza path absoluto", () => {
    expect(isValidComponent({ ...valid, path: "/apps/api" })).toBe(false);
  });

  it("rechaza path con segmento '..'", () => {
    expect(isValidComponent({ ...valid, path: "apps/../secret" })).toBe(false);
  });

  it("rechaza separador de Windows", () => {
    expect(isValidComponent({ ...valid, path: "apps\\api" })).toBe(false);
  });
});
