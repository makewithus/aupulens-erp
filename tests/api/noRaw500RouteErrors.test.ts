import { describe, expect, it } from "vitest";
import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(fullPath);
    return entry.name === "route.ts" ? [fullPath] : [];
  });
}

function hasExceptionMessage(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node) => {
    if (ts.isPropertyAccessExpression(child) && child.name.text === "message") found = true;
    if (!found) ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

describe("AUP-008: API 500 responses do not serialize exception messages", () => {
  it("keeps every NextResponse.json 500 payload free of exception .message fields", () => {
    const root = path.resolve(process.cwd(), "app/api");
    const leaks: string[] = [];

    for (const file of routeFiles(root)) {
      const source = readFileSync(file, "utf8");
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const statusIs500 = (node: ts.Expression) => ts.isObjectLiteralExpression(node) &&
        node.properties.some((property) => ts.isPropertyAssignment(property) &&
          property.name.getText(sourceFile).replace(/["']/g, "") === "status" &&
          property.initializer.getText(sourceFile) === "500");

      const visit = (node: ts.Node) => {
        let payload: ts.Expression | undefined;
        let options: ts.Expression | undefined;
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          ["NextResponse", "Response"].includes(node.expression.expression.getText(sourceFile)) &&
          node.expression.name.text === "json") {
          payload = node.arguments[0];
          options = node.arguments[1];
        } else if (ts.isNewExpression(node) && node.expression.getText(sourceFile) === "NextResponse") {
          payload = node.arguments?.[0];
          options = node.arguments?.[1];
          if (payload && ts.isCallExpression(payload) && payload.expression.getText(sourceFile) === "JSON.stringify") {
            payload = payload.arguments[0];
          }
        }
        if (payload && options && statusIs500(options)) {
          if (hasExceptionMessage(payload)) {
            leaks.push(`${path.relative(process.cwd(), file)}:${sourceFile.getLineAndCharacterOfPosition(payload.getStart(sourceFile)).line + 1}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    expect(leaks).toEqual([]);
  });

  it("uses a fixed public failure message", () => {
    expect(safeInternalErrorMessage()).toBe("We couldn't complete this request. Please try again.");
  });
});
