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
    const message = "fix: corrige acentuación en español (áéíóú, ñ) 🐛 y comillas \"dobles\" y 'simples'\n";
    const stdout = buildStdout(SHA, "María José Ñañez", "2026-08-14T22:35:00Z", message);

    const result = parseCommitMetadata(stdout);

    expect(result.author).toBe("María José Ñañez");
    expect(result.message).toBe(
      "fix: corrige acentuación en español (áéíóú, ñ) 🐛 y comillas \"dobles\" y 'simples'",
    );
  });

  it("recorta TODOS los saltos de línea finales, no solo uno", () => {
    // Verificado contra Git real (xxd): %B contribuye su propio "\n" final
    // (Git normaliza el mensaje guardado a exactamente uno, incluso si se
    // intenta commitear varias líneas en blanco al final) y
    // "git show -s --format=..." agrega OTRO "\n" como separador del
    // bloque formateado — dos saltos de línea sin contenido real, no uno.
    const message = "mensaje sin línea en blanco real al final\n\n";
    const stdout = buildStdout(SHA, "Santiago", "2026-08-14T22:35:00Z", message);

    const result = parseCommitMetadata(stdout);

    expect(result.message).toBe("mensaje sin línea en blanco real al final");
  });

  it("normaliza \\r\\n a \\n en el mensaje (Git for Windows emite CRLF en el salto que agrega al final)", () => {
    // Bug real encontrado corriendo la integration test contra Git en
    // Windows (no se reproduce en Linux): el salto de línea final que
    // Git agrega después de %B llega como "\r\n" en ese entorno, dejando
    // un "\r" colgante si solo se recorta "\n". Regresión, ver JSDoc de
    // parseCommitMetadata.
    const stdout = buildStdout(SHA, "Santiago", "2026-08-14T22:35:00Z", "feat: mensaje con CRLF\r\n");

    const result = parseCommitMetadata(stdout);

    expect(result.message).toBe("feat: mensaje con CRLF");
    expect(result.message.endsWith("\r")).toBe(false);
  });

  it("normaliza \\r\\n internos de un mensaje multi-línea, no solo el final", () => {
    const message = "feat: título\r\n\r\nCuerpo con CRLF interno.\r\nSegunda línea.\r\n";
    const stdout = buildStdout(SHA, "Santiago", "2026-08-14T22:35:00Z", message);

    const result = parseCommitMetadata(stdout);

    expect(result.message).toBe("feat: título\n\nCuerpo con CRLF interno.\nSegunda línea.");
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
