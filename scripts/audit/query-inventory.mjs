#!/usr/bin/env node
/**
 * AST-based inventory of Mongoose collection reads (find / aggregate / cursor) in app/api and lib.
 * Replaces the earlier regex heuristic. Resolves model identifiers through their imports from `models/`
 * (so aliases work), follows the method chain across lines, and inspects the enclosing function.
 *
 * Usage: node scripts/audit/query-inventory.mjs [rootDir] > inventory.json
 * Limits (static analysis): tenant scoping is a SIGNAL (argument/variable/function text), not a proof;
 * dataset size, UI consumers and business purpose still need human review.
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? ".");
const SCAN = ["app/api", "lib"];
const HTTP = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const out = [];

function walkDir(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

function analyse(file) {
  const rel = path.relative(root, file);
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const models = new Map(); // local identifier -> model module
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && /(^|\/)models\//.test(st.moduleSpecifier.text) && st.importClause) {
      if (st.importClause.name) models.set(st.importClause.name.text, st.moduleSpecifier.text);
      const nb = st.importClause.namedBindings;
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) models.set(el.name.text, st.moduleSpecifier.text);
    }
  }
  // dynamic: const X = (await import("@/models/..")).default
  const dyn = /(\w+)\s*=\s*\(?\s*await\s+import\(\s*["'`][^"'`]*models\/[^"'`]*["'`]\s*\)\s*\)?\.default/g;
  for (const m of src.matchAll(dyn)) models.set(m[1], "dynamic-import");
  if (!models.size) return;

  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  function enclosingFn(n) {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isMethodDeclaration(p)) {
        let name = p.name?.text;
        if (!name && ts.isVariableDeclaration(p.parent) && ts.isIdentifier(p.parent.name)) name = p.parent.name.text;
        return { node: p, name: name ?? "<anonymous>" };
      }
    }
    return { node: sf, name: "<module>" };
  }

  function visit(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const method = n.expression.name.text;
      const recv = n.expression.expression;
      if (["find", "aggregate"].includes(method) && ts.isIdentifier(recv) && models.has(recv.text)) {
        // follow the chain upward
        const chain = [];
        let top = n;
        while (top.parent && ts.isPropertyAccessExpression(top.parent) && top.parent.expression === top && top.parent.parent && ts.isCallExpression(top.parent.parent)) {
          chain.push(top.parent.name.text);
          top = top.parent.parent;
        }
        const fn = enclosingFn(n);
        const fnText = fn.node.getText ? fn.node.getText(sf) : "";
        const arg0 = n.arguments[0];
        let argText = arg0 ? arg0.getText(sf) : "";
        // resolve `find(query)` -> look for the variable in the enclosing function
        let resolved = argText;
        if (arg0 && ts.isIdentifier(arg0)) resolved = fnText;
        const scoped = /tenantId|applyDemoScope|tenant|scopeFilter|withTenant/i.test(argText) ? "argument"
          : (arg0 && ts.isIdentifier(arg0) && /tenantId|applyDemoScope|tenant/i.test(resolved)) ? "variable/function" : (/tenantId/.test(fnText) ? "function-level only" : "NONE FOUND");
        // result variable usage: sums/loops in memory
        let resultVar = null;
        let w = top.parent;
        if (w && ts.isAwaitExpression(w)) w = w.parent;
        if (w && ts.isVariableDeclaration(w) && ts.isIdentifier(w.name)) resultVar = w.name.text;
        const inMemoryAgg = resultVar ? new RegExp(`\\b${resultVar}\\.(reduce|forEach|map|filter)\\(|of\\s+${resultVar}\\b`).test(fnText) && /(\+=|\.reduce\(|sum|total|count)/i.test(fnText) : false;
        const readsPaging = /searchParams\.get\(\s*["'`](limit|page|pageSize|cursor|skip|offset|perPage)["'`]\)|\.limit\(|\.skip\(/.test(fnText);
        out.push({
          file: rel, line: line(n), model: recv.text, method,
          chain, hasLimit: chain.includes("limit") || (method === "aggregate" && /\$limit/.test(top.getText(sf))),
          hasSkip: chain.includes("skip") || /\$skip/.test(top.getText(sf)), lean: chain.includes("lean"), cursor: chain.includes("cursor"),
          fn: fn.name, isHttpHandler: HTTP.has(fn.name), httpMethod: HTTP.has(fn.name) ? fn.name : null,
          route: rel.startsWith("app/api") ? "/" + path.dirname(rel).replace(/^app\//, "").replace(/\\/g, "/") : null,
          tenantScoping: scoped, pagingParamsInFunction: readsPaging, resultVar, inMemoryAggregationPattern: inMemoryAgg,
          isExport: /export/i.test(rel), isCronOrBackground: /cron|scheduler|worker|migration|sweep/i.test(rel),
          arg: argText.replace(/\s+/g, " ").slice(0, 110),
        });
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
}

for (const d of SCAN) for (const f of walkDir(path.join(root, d))) analyse(f);
process.stdout.write(JSON.stringify(out, null, 1));
