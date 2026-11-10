#!/usr/bin/env node
/** Lists named exports (lib/, components/, store/, config/, providers/) that no tracked file imports by name.
 *  Conservative: a file imported via `import *`, `export *`, `require`, or dynamic import() is treated as fully used.
 *  REPORT ONLY — exports can be consumed by name through registries/dynamic access this analysis cannot see. */
import ts from "typescript"; import fs from "node:fs"; import path from "node:path"; import { execSync } from "node:child_process";
const files = execSync("git ls-files", { encoding: "utf8", maxBuffer: 1 << 26 }).split("\n").filter((f) => /\.(tsx?|mjs|js)$/.test(f) && !f.endsWith(".d.ts"));
const set = new Set(files); const EXT = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];
const res = (s, from) => { let b; if (s.startsWith("@/")) b = s.slice(2); else if (s.startsWith(".")) b = path.posix.normalize(path.posix.join(path.posix.dirname(from), s)); else return null; for (const e of EXT) if (set.has(b + e)) return b + e; return null; };
const exportsOf = new Map(), usedNames = new Map(), wholeUsed = new Set();
const mark = (t, n) => (usedNames.get(t) ?? usedNames.set(t, new Set()).get(t)).add(n);
for (const f of files) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true); const ex = [];
  const isExp = (n) => n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword); const isDef = (n) => n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) { const t = res(st.moduleSpecifier.text, f); if (!t) continue; const ic = st.importClause; if (!ic) { wholeUsed.add(t); continue; } if (ic.name) mark(t, "default"); if (ic.namedBindings) { if (ts.isNamespaceImport(ic.namedBindings)) wholeUsed.add(t); else for (const e of ic.namedBindings.elements) mark(t, (e.propertyName ?? e.name).text); } }
    else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) { const t = res(st.moduleSpecifier.text, f); if (!t) continue; if (!st.exportClause || ts.isNamespaceExport(st.exportClause)) wholeUsed.add(t); else for (const e of st.exportClause.elements) mark(t, (e.propertyName ?? e.name).text); }
    if (isExp(st) && !isDef(st)) { if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) { if (ts.isIdentifier(d.name)) ex.push(d.name.text); } else if (st.name && ts.isIdentifier(st.name)) ex.push(st.name.text); }
  }
  const visit = (n) => { if (ts.isCallExpression(n)) { const c = n.expression; if ((c.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(c) && c.text === "require")) && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) { const t = res(n.arguments[0].text, f); if (t) wholeUsed.add(t); } } ts.forEachChild(n, visit); };
  visit(sf); exportsOf.set(f, ex);
}
const scope = /^(lib|components|store|config|providers)\//; const out = [];
for (const [f, ex] of exportsOf) { if (!scope.test(f) || wholeUsed.has(f)) continue; const used = usedNames.get(f) ?? new Set(); const un = ex.filter((n) => !used.has(n)); if (un.length) out.push({ file: f, unused: un }); }
console.log(JSON.stringify({ files: out.length, exports: out.reduce((a, o) => a + o.unused.length, 0), detail: out }, null, 1));
