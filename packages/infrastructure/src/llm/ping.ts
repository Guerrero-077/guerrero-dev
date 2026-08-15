/** Chequeo simple de disponibilidad, usado por `guerrero doctor` (Fase 3.16). */
export async function pingOllama(baseUrl: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(new URL("/api/tags", baseUrl), { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}
