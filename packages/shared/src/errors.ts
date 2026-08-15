/**
 * Error base del sistema. Todos los errores de dominio/aplicación deberían
 * extender de esta clase para que el manejo de errores en las apps
 * (api/cli) pueda distinguir errores esperados de bugs no controlados.
 */
export class GuerreroError extends Error {
  public readonly code: string;
  public readonly cause_?: unknown;

  constructor(message: string, code: string, options?: { cause?: unknown }) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.cause_ = options?.cause;
  }
}

export class ConfigurationError extends GuerreroError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, "CONFIGURATION_ERROR", options);
  }
}

export class NotFoundError extends GuerreroError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, "NOT_FOUND", options);
  }
}

export class PermissionDeniedError extends GuerreroError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, "PERMISSION_DENIED", options);
  }
}
