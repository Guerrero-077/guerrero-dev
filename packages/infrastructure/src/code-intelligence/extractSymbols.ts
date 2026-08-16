import { Node, SyntaxKind } from "ts-morph";
import type { ClassDeclaration, ObjectLiteralExpression, SourceFile } from "ts-morph";
import type { CodeSymbol, CodeSymbolKind } from "@guerrero-dev/domain";

interface NamedExportableDeclaration {
  getName(): string | undefined;
  getStartLineNumber(): number;
  getEndLineNumber(): number;
  isExported(): boolean;
}

/**
 * Extrae `CodeSymbol[]` de un `SourceFile` ya parseado (Fase 6, mapa
 * §6). Recibe únicamente `SourceFile` — nunca `Project` — para no
 * depender de resolución/diagnóstico, responsabilidad exclusiva de
 * `TsMorphCodeAnalyzer`. Un solo pase sobre las statements de nivel
 * superior, en orden de archivo (determinismo, mapa §7).
 */
export function extractSymbols(sourceFile: SourceFile, filePath: string): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];

  for (const statement of sourceFile.getStatements()) {
    if (Node.isFunctionDeclaration(statement)) {
      pushNamedDeclaration(symbols, statement, filePath, "function", null);
    } else if (Node.isClassDeclaration(statement)) {
      pushNamedDeclaration(symbols, statement, filePath, "class", null);
      extractClassMethods(symbols, statement, filePath);
    } else if (Node.isInterfaceDeclaration(statement)) {
      pushNamedDeclaration(symbols, statement, filePath, "interface", null);
    } else if (Node.isTypeAliasDeclaration(statement)) {
      pushNamedDeclaration(symbols, statement, filePath, "type", null);
    } else if (Node.isVariableStatement(statement)) {
      for (const declaration of statement.getDeclarations()) {
        const name = declaration.getName();
        symbols.push({
          name,
          kind: "const",
          filePath,
          line: declaration.getStartLineNumber(),
          endLine: declaration.getEndLineNumber(),
          exported: declaration.isExported(),
          containerName: null,
        });

        const objectLiteral = declaration.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
        if (objectLiteral) {
          extractObjectLiteralMethods(symbols, objectLiteral, filePath, name);
        }
      }
    }
  }

  return symbols;
}

function pushNamedDeclaration(
  symbols: CodeSymbol[],
  declaration: NamedExportableDeclaration,
  filePath: string,
  kind: CodeSymbolKind,
  containerName: string | null,
): void {
  const name = declaration.getName();
  if (name === undefined) {
    // export default de una declaración anónima — sin nombre estable que indexar (mapa §6b).
    return;
  }
  symbols.push({
    name,
    kind,
    filePath,
    line: declaration.getStartLineNumber(),
    endLine: declaration.getEndLineNumber(),
    exported: declaration.isExported(),
    containerName,
  });
}

function extractClassMethods(
  symbols: CodeSymbol[],
  classDeclaration: ClassDeclaration,
  filePath: string,
): void {
  const containerName = classDeclaration.getName();
  if (containerName === undefined) {
    return;
  }
  for (const method of classDeclaration.getMethods()) {
    symbols.push({
      name: method.getName(),
      kind: "method",
      filePath,
      line: method.getStartLineNumber(),
      endLine: method.getEndLineNumber(),
      exported: false,
      containerName,
    });
  }
}

function extractObjectLiteralMethods(
  symbols: CodeSymbol[],
  objectLiteral: ObjectLiteralExpression,
  filePath: string,
  containerName: string,
): void {
  for (const property of objectLiteral.getProperties()) {
    const method = property.asKind(SyntaxKind.MethodDeclaration);
    if (method) {
      symbols.push({
        name: method.getName(),
        kind: "method",
        filePath,
        line: method.getStartLineNumber(),
        endLine: method.getEndLineNumber(),
        exported: false,
        containerName,
      });
      continue;
    }

    const propertyAssignment = property.asKind(SyntaxKind.PropertyAssignment);
    if (!propertyAssignment) {
      continue;
    }
    const functionValue =
      propertyAssignment.getInitializerIfKind(SyntaxKind.ArrowFunction) ??
      propertyAssignment.getInitializerIfKind(SyntaxKind.FunctionExpression);
    if (!functionValue) {
      continue;
    }
    symbols.push({
      name: propertyAssignment.getName(),
      kind: "method",
      filePath,
      line: propertyAssignment.getStartLineNumber(),
      endLine: propertyAssignment.getEndLineNumber(),
      exported: false,
      containerName,
    });
  }
}
