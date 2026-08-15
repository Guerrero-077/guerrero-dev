/**
 * Contrato de logging (Fase 3.12).
 *
 * `shared` solo define la interfaz — es un paquete "kernel" sin
 * dependencias externas, así que Domain y Application pueden loguear sin
 * conocer pino ni ninguna otra librería concreta. La implementación real
 * (structured JSON logging con pino) vive en
 * `@guerrero-dev/infrastructure` (`infrastructure/logging`).
 */
export type LogFields = Record<string, unknown>;

export interface ILogger {
  fatal(fields: LogFields, message: string): void;
  error(fields: LogFields, message: string): void;
  warn(fields: LogFields, message: string): void;
  info(fields: LogFields, message: string): void;
  debug(fields: LogFields, message: string): void;

  /** Devuelve un logger hijo con campos fijos (p. ej. `{ service: "agent-core" }`). */
  child(fields: LogFields): ILogger;
}

/**
 * Logger que no hace nada — útil como default en tests o en código que
 * todavía no tiene un logger real inyectado.
 */
export const noopLogger: ILogger = {
  fatal: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  child: () => noopLogger,
};
