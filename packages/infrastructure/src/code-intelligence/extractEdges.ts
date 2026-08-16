import type { ImportDeclaration, SourceFile } from "ts-morph";
import type { DependencyEdge } from "@guerrero-dev/domain";

/**
 * Extrae `DependencyEdge[]` de un `SourceFile` ya parseado (Fase 6,
 * mapa §6e). Recibe únicamente `SourceFile` — nunca `Project`.
 */
export function extractEdges(sourceFile: SourceFile, filePath: string): DependencyEdge[] {
  const edges: DependencyEdge[] = [];

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    edges.push({
      fromFile: filePath,
      target: importDeclaration.getModuleSpecifierValue(),
      kind: "import",
      importedNames: extractImportedNames(importDeclaration),
    });
  }

  for (const exportDeclaration of sourceFile.getExportDeclarations()) {
    const target = exportDeclaration.getModuleSpecifierValue();
    if (target === undefined) {
      // `export { x };` local, sin `from` — no es una relación entre archivos (mapa §6c/§6e).
      continue;
    }
    edges.push({
      fromFile: filePath,
      target,
      kind: "re-export",
      importedNames: exportDeclaration.isNamespaceExport()
        ? ["*"]
        : exportDeclaration.getNamedExports().map((named) => named.getName()),
    });
  }

  return edges;
}

function extractImportedNames(importDeclaration: ImportDeclaration): string[] {
  if (importDeclaration.getNamespaceImport() !== undefined) {
    return ["*"];
  }

  const names: string[] = [];
  if (importDeclaration.getDefaultImport() !== undefined) {
    names.push("default");
  }
  names.push(...importDeclaration.getNamedImports().map((named) => named.getName()));
  return names;
}
