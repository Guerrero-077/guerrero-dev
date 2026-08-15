import pino, { type Logger as Pino } from "pino";
import type { ILogger, LogFields } from "@guerrero-dev/shared";

/**
 * Implementación concreta de `ILogger` (Fase 3.12) usando pino: logging
 * estructurado JSON en producción, legible con pino-pretty en desarrollo.
 * Domain/Application solo conocen `ILogger`; esta clase vive en
 * infrastructure porque envuelve una librería externa concreta.
 */
class PinoLogger implements ILogger {
  constructor(private readonly pino: Pino) {}

  fatal(fields: LogFields, message: string): void {
    this.pino.fatal(fields, message);
  }

  error(fields: LogFields, message: string): void {
    this.pino.error(fields, message);
  }

  warn(fields: LogFields, message: string): void {
    this.pino.warn(fields, message);
  }

  info(fields: LogFields, message: string): void {
    this.pino.info(fields, message);
  }

  debug(fields: LogFields, message: string): void {
    this.pino.debug(fields, message);
  }

  child(fields: LogFields): ILogger {
    return new PinoLogger(this.pino.child(fields));
  }
}

export interface CreateLoggerOptions {
  name: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger(options: CreateLoggerOptions): ILogger {
  const { name, level = process.env["LOG_LEVEL"] ?? "info" } = options;
  const pretty = options.pretty ?? process.env["NODE_ENV"] !== "production";

  const instance = pino({
    name,
    level,
    ...(pretty
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss.l",
              ignore: "pid,hostname",
            },
          },
        }
      : {}),
  });

  return new PinoLogger(instance);
}
