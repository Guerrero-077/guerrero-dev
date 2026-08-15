import { mkdirSync, writeFileSync } from "node:fs";
import { loadConfig, OllamaEmbeddingProvider, pingOllama } from "@guerrero-dev/infrastructure";
import type { Embedding } from "@guerrero-dev/domain";

/**
 * Benchmark reproducible del embedding provider (Fase 4.4 —
 * docs/fase-4-memory-engine.md).
 *
 * `pnpm benchmark:embeddings` corre contra `OLLAMA_EMBEDDING_MODEL` /
 * `EMBEDDING_DIMENSIONS` de la config actual. `BENCHMARK_MODELS` (opcional,
 * separado por comas) sobreescribe esto y corre el mismo benchmark una vez
 * por modelo — por ejemplo:
 *
 *   BENCHMARK_MODELS=qwen3-embedding:4b,qwen3-embedding:8b pnpm benchmark:embeddings
 *
 * No forma parte del suite de tests: requiere Ollama corriendo y el/los
 * modelo(s) ya pulled. El resultado se imprime en consola y se escribe
 * como JSON en benchmark-results/ para dejar evidencia de la decisión.
 */

interface CorpusItem {
  readonly id: string;
  readonly category:
    | "arquitectura"
    | "codigo"
    | "errores"
    | "preferencias"
    | "espanol_tecnico"
    | "ingles_tecnico"
    | "codigo_espanol";
  readonly text: string;
}

interface QueryCase {
  readonly query: string;
  readonly expectedId: string;
}

// Casos reales de Guerrero Dev (Fase 4.4), no frases artificiales. Cada
// categoría del checklist tiene al menos un ítem en el corpus.
const CORPUS: readonly CorpusItem[] = [
  {
    id: "arch-1",
    category: "arquitectura",
    text: "El proyecto utiliza Clean Architecture y separa Domain, Application, Infrastructure y Web.",
  },
  {
    id: "arch-2",
    category: "arquitectura",
    text: "Miller usa arquitectura modular con Repository y Service en 7 de 8 proyectos.",
  },
  {
    id: "code-1",
    category: "codigo",
    text: "RefreshTokenRepository revoca todos los tokens activos del usuario.",
  },
  {
    id: "code-2",
    category: "codigo",
    text: "ProjectRepository.findById devuelve null cuando el proyecto no existe.",
  },
  {
    id: "err-1",
    category: "errores",
    text: "Se produjo una excepción por iniciar una segunda operación sobre el mismo DbContext.",
  },
  {
    id: "err-2",
    category: "errores",
    text: "Timeout de conexión a PostgreSQL cuando el pool alcanza el máximo de conexiones concurrentes.",
  },
  {
    id: "pref-1",
    category: "preferencias",
    text: "Prefiere interfaces para desacoplar infraestructura de los casos de uso.",
  },
  {
    id: "pref-2",
    category: "preferencias",
    text: "Prefiere soluciones desacopladas y evita dependencias directas a frameworks en el dominio.",
  },
  {
    id: "es-1",
    category: "espanol_tecnico",
    text: "El proyecto utiliza PostgreSQL como persistencia principal y EF Core como ORM.",
  },
  {
    id: "es-2",
    category: "espanol_tecnico",
    text: "La migración agrega un índice compuesto sobre project_id y status para acelerar el filtro más frecuente.",
  },
  {
    id: "en-1",
    category: "ingles_tecnico",
    text: "The refresh token is revoked after rotation.",
  },
  {
    id: "en-2",
    category: "ingles_tecnico",
    text: "The connection pool exhausts when concurrent requests exceed the configured maximum.",
  },
  {
    id: "code-es-1",
    category: "codigo_espanol",
    text: "El método RevokeAllForUserAsync actualiza todos los refresh tokens activos.",
  },
  {
    id: "code-es-2",
    category: "codigo_espanol",
    text: "La clase MemoryMapper convierte entre la fila de PostgreSQL y la entidad Memory del dominio.",
  },
];

// Query -> id esperado en el corpus (ground truth manual, no artificial).
const QUERIES: readonly QueryCase[] = [
  { query: "¿Cómo manejamos la revocación de refresh tokens?", expectedId: "code-es-1" },
  { query: "¿Qué pasa si se abren dos operaciones sobre el mismo DbContext?", expectedId: "err-1" },
  { query: "¿Qué ORM usa el proyecto para PostgreSQL?", expectedId: "es-1" },
  { query: "How does the system revoke a refresh token?", expectedId: "en-1" },
  { query: "¿Qué arquitectura separa Domain, Application e Infrastructure?", expectedId: "arch-1" },
  { query: "¿Guerrero prefiere acoplar infraestructura a los casos de uso?", expectedId: "pref-1" },
  { query: "connection pool timeout under concurrent load", expectedId: "err-2" },
  { query: "¿Qué convierte filas de PostgreSQL en entidades de dominio?", expectedId: "code-es-2" },
];

interface BenchmarkResult {
  readonly model: string;
  readonly dimensions: number;
  readonly dimensionCheck: { expected: number; actual: number; pass: boolean };
  readonly latencyMs: { coldStart: number; warmP50: number; warmP95: number };
  readonly throughputEmbeddingsPerSecond: number;
  readonly determinism: { minCosineSimilarity: number; pass: boolean };
  readonly retrieval: {
    recallAt5: number;
    mrr: number;
    perQuery: Array<{ query: string; rank: number | null }>;
  };
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot; // ya normalizados L2 por el provider
}

function percentile(sorted: readonly number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? 0;
}

async function benchmarkModel(baseUrl: string, model: string, dimensions: number): Promise<BenchmarkResult> {
  const provider = new OllamaEmbeddingProvider(baseUrl, model, dimensions);

  console.log(`\n=== ${model} (dims=${dimensions}) ===`);

  // 1. Dimensión
  const coldStartBegin = performance.now();
  const first = await provider.embed(CORPUS[0]!.text);
  const coldStart = performance.now() - coldStartBegin;
  const dimensionCheck = {
    expected: dimensions,
    actual: first.values.length,
    pass: first.values.length === dimensions,
  };
  console.log(
    `Dimensión: ${dimensionCheck.actual} (esperado ${dimensionCheck.expected}) — ${dimensionCheck.pass ? "OK" : "FALLA"}`,
  );

  // 2. Latencia (warm): un embed() individual por texto restante del corpus
  const warmSamples: number[] = [];
  for (const item of CORPUS.slice(1)) {
    const start = performance.now();
    await provider.embed(item.text);
    warmSamples.push(performance.now() - start);
  }
  const sortedWarm = [...warmSamples].sort((a, b) => a - b);
  const warmP50 = percentile(sortedWarm, 50);
  const warmP95 = percentile(sortedWarm, 95);
  console.log(
    `Latencia — cold start: ${coldStart.toFixed(0)}ms | warm p50: ${warmP50.toFixed(0)}ms | warm p95: ${warmP95.toFixed(0)}ms`,
  );

  // 3. Throughput: todo el corpus en un solo batch
  const batchStart = performance.now();
  const corpusEmbeddings = await provider.embedBatch(CORPUS.map((c) => c.text));
  const batchElapsedSec = (performance.now() - batchStart) / 1000;
  const throughput = CORPUS.length / batchElapsedSec;
  console.log(
    `Throughput (batch): ${throughput.toFixed(2)} embeddings/seg (${CORPUS.length} textos en ${batchElapsedSec.toFixed(2)}s)`,
  );

  // 4. Determinismo: mismo texto, 5 llamadas, similitud mínima entre pares
  const determinismText = CORPUS[0]!.text;
  const repeats = await Promise.all(Array.from({ length: 5 }, () => provider.embed(determinismText)));
  let minSim = 1;
  for (let i = 0; i < repeats.length; i++) {
    for (let j = i + 1; j < repeats.length; j++) {
      minSim = Math.min(minSim, cosineSimilarity(repeats[i]!.values, repeats[j]!.values));
    }
  }
  const determinism = { minCosineSimilarity: minSim, pass: minSim > 0.999 };
  console.log(
    `Determinismo — similitud mínima entre repeticiones: ${minSim.toFixed(6)} — ${determinism.pass ? "OK" : "FALLA"}`,
  );

  // 5. Retrieval quality: Recall@5 y MRR
  const corpusById = new Map<string, Embedding>(CORPUS.map((c, i) => [c.id, corpusEmbeddings[i]!]));
  const perQuery: Array<{ query: string; rank: number | null }> = [];
  let hitsAt5 = 0;
  let reciprocalRankSum = 0;

  for (const { query, expectedId } of QUERIES) {
    const queryEmbedding = await provider.embed(query);
    const ranked = CORPUS.map((item) => ({
      id: item.id,
      score: cosineSimilarity(queryEmbedding.values, corpusById.get(item.id)!.values),
    })).sort((a, b) => b.score - a.score);

    const rank = ranked.findIndex((r) => r.id === expectedId) + 1; // 1-based, 0 si no está
    perQuery.push({ query, rank: rank > 0 ? rank : null });
    if (rank > 0 && rank <= 5) hitsAt5++;
    if (rank > 0) reciprocalRankSum += 1 / rank;
  }

  const recallAt5 = hitsAt5 / QUERIES.length;
  const mrr = reciprocalRankSum / QUERIES.length;
  console.log(`Retrieval — Recall@5: ${(recallAt5 * 100).toFixed(1)}% | MRR: ${mrr.toFixed(3)}`);
  for (const { query, rank } of perQuery) {
    console.log(`  rank ${rank ?? "∉corpus"} — "${query}"`);
  }

  return {
    model,
    dimensions,
    dimensionCheck,
    latencyMs: { coldStart, warmP50, warmP95 },
    throughputEmbeddingsPerSecond: throughput,
    determinism,
    retrieval: { recallAt5, mrr, perQuery },
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const available = await pingOllama(config.OLLAMA_BASE_URL, 3000);
  if (!available) {
    console.error(`Ollama no responde en ${config.OLLAMA_BASE_URL}. Arrancalo antes de correr el benchmark.`);
    process.exit(1);
  }

  const modelsToRun = process.env["BENCHMARK_MODELS"]
    ?.split(",")
    .map((m) => m.trim())
    .filter(Boolean) ?? [config.OLLAMA_EMBEDDING_MODEL];

  const results: BenchmarkResult[] = [];
  for (const model of modelsToRun) {
    results.push(await benchmarkModel(config.OLLAMA_BASE_URL, model, config.EMBEDDING_DIMENSIONS));
  }

  mkdirSync("benchmark-results", { recursive: true });
  const outPath = `benchmark-results/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nResultados guardados en ${outPath}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
