/**
 * Result<T, E> — para casos de uso con un modo de fallo esperado y
 * modelable (p. ej. validación), en vez de excepciones. No se usa en
 * todos lados: solo donde el fallo es parte normal del flujo.
 */
export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Failure<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E = Error> = Success<T> | Failure<E>;

export function success<T>(value: T): Success<T> {
  return { ok: true, value };
}

export function failure<E>(error: E): Failure<E> {
  return { ok: false, error };
}
