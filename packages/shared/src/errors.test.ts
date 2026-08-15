import { describe, expect, it } from "vitest";
import { ConfigurationError, GuerreroError, NotFoundError, PermissionDeniedError } from "./errors.js";

describe("GuerreroError", () => {
  it("expone message, name y code", () => {
    const err = new ConfigurationError("falta DATABASE_URL");

    expect(err).toBeInstanceOf(GuerreroError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ConfigurationError");
    expect(err.code).toBe("CONFIGURATION_ERROR");
    expect(err.message).toBe("falta DATABASE_URL");
  });

  it("preserva la causa original", () => {
    const cause = new Error("conexión rechazada");
    const err = new NotFoundError("proyecto no encontrado", { cause });

    expect(err.cause_).toBe(cause);
  });

  it("distingue subtipos por code", () => {
    expect(new NotFoundError("x").code).toBe("NOT_FOUND");
    expect(new PermissionDeniedError("x").code).toBe("PERMISSION_DENIED");
  });
});
