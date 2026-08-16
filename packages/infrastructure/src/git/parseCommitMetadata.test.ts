import { describe, expect, it } from "vitest";
import { GitCommitCollectorError } from "./GitCommitCollectorError.js";
import { parseCommitMetadata } from "./parseCommitMetadata.js";

const SHA = "a".repeat(40);
const SEP = "\x1f";

function buildStdout(sha: string, author: string, timestamp: string, message: string): string {
  return `${sha}${SEP}${author}${SEP}${timestamp}${SEP}${message}`;
}

describe("parseCommitMetadata", () => {
  it("parsea sha, author, timestamp y message de un commit simple", () => {
    const stdout = buildStdout(SHA, "Santiago", "2026-08-14T22:35:00-05:00", "feat: mensaje simple\n");

    const result = parseCommitMetadata(stdout);

    expect(result.sha).toBe(SHA);
    expect(result.author).toBe("Santiago");
    expect(result.timestamp.toISOString()).toBe(new Date("2026-08-14T22:35:00-05:00").toISOString());
    expect(result.message).toBe("feat: mensaje simple");
  });

  it("preserva mensajes multi-línea completos, sin truncar el body", () => {
    const message = "feat: título\n\nCuerpo del mensaje con varias líneas.\nSegunda línea del cuerpo.\n";
    const stdout = buildStdout(SHA, "Santiago", "2026-08-14T22:35:00Z", message);

    const result = parseCommitMetadata(stdout);

    expect(result.message).toBe(
      "feat: título\n\nCuerpo del mensaje con varias líneas.\nSegunda línea del cuerpo.",
    );
  });

  it("preserva caracteres especiales (unicode, emoji, comillas) en el mensaje", () => {
    const message = 'fix: corrige acentuación en español (áéíóú, ñ) 🐛 y comillas "dobles" y \'simples\'\n';
    const stdout = buildStdout(SHA, "María José Ñañez", "2026-08-14T22:35:00Z", message);

    const result = parseCommitMetadata(stdout);

    expect(result.author).toBe("María José Ñañez");
    expect(result.message).toBe(
      'fix: corrige acentuación en español (áéíóú, ñ) 🐛 y comillas "dobles" y \'simples\'',
    );
  });

  it("recorta exactamente un salto de línea final, no todos", () => {
    const message = "mensaje con línea en blanco final\n\n";
    const stdout = buildStdout(SHA, "Santiago", "2026-08-14T22:35:00Z", message);

    const result = parseCommitMetadata(stdout);

    expect(result.message).toBe("mensaje con línea en blanco final\n");
  });

  it("lanza invalid_output si faltan separadores de campo", () => {
    expect(() => parseCommitMetadata(`${SHA}${SEP}Santiago`)).toThrow(GitCommitCollectorError);
    expect(() => parseCommitMetadata(`${SHA}${SEP}Santiago`)).toThrow(/3 separadores/);
  });

  it("lanza invalid_output si la sha no es un hex de 40 caracteres", () => {
    const stdout = buildStdout("no-es-una-sha", "Santiago", "2026-08-14T22:35:00Z", "mensaje\n");

    expect(() => parseCommitMetadata(stdout)).toThrow(/no es una SHA de 40 hex válida/);
  });

  it("lanza invalid_output si el timestamp no es una fecha ISO 8601 válida", () => {
    const stdout = buildStdout(SHA, "Santiago", "no-es-una-fecha", "mensaje\n");

    expect(() => parseCommitMetadata(stdout)).toThrow(/no es una fecha ISO 8601 válida/);
  });

  it("el reason del error conserva el motivo exacto (reason property)", () => {
    let caught: unknown;
    try {
      parseCommitMetadata(`${SHA}${SEP}Santiago`);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GitCommitCollectorError);
    expect((caught as GitCommitCollectorError).reason).toBe("invalid_output");
  });
});
