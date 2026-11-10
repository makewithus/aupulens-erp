#!/usr/bin/env node
/**
 * Removes import bindings that `tsc --noUnusedLocals` reports as unused (TS6133/TS6192/TS6196/TS6198 whose position
 * is inside an import declaration). Behaviour-neutral: with isolatedModules and no verbatimModuleSyntax, TypeScript and
 * SWC already elide unused imports, so no side-effect import is lost. Never touches non-import locals. Usage:
 *   tsc --noEmit --noUnusedLocals > diag.txt; node scripts/audit/remove-unused-imports.mjs diag.txt [--apply]
 */
import ts from "typescript";
import fs from "node:fs";

const [diagFile, flag] = process.argv.slice(2);
const apply = flag === "--apply";
const re = /^(.+?)\((\d+),(\d+)\): error (TS6133|TS6192|TS6196|TS6198):/;
const byFile = new Map();
for (const l of fs.readFileSync(diagFile, "utf8").split("\n")) {
  const m = re.exec(l); if (!m) continue;
  const [, f, line, col] = m;
  if (f.startsWith("tests/") || f.startsWith("scripts/")) continue;
  (byFile.get(f) ?? byFile.set(f, []).get(f)).push({ line: +line, col: +col });
}
let removedSpecs = 0, removedDecls = 0, files = 0;
for (const [f, diags] of byFile) {
  const src = fs.readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true);
  const edits = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    const ic = st.importClause;
    const pos = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf));
    const hit = (n) => { const p = pos(n); return diags.some((d) => d.line === p.line + 1 && d.col === p.character + 1); };
    const declStart = pos(st);
    const wholeFlag = diags.some((d) => d.line === declStart.line + 1 && d.col === declStart.character + 1);
    const named = ic.namedBindings;
    const items = [];
    if (ic.name) items.push({ n: ic.name, kind: "default" });
    if (named && ts.isNamespaceImport(named)) items.push({ n: named.name, kind: "ns" });
    if (named && ts.isNamedImports(named)) for (const e of named.elements) items.push({ n: e.name, kind: "named", e });
    const unused = items.filter((i) => wholeFlag || hit(i.n));
    if (!unused.length) continue;
    removedSpecs += unused.length;
    if (unused.length === items.length) { edits.push({ s: st.getFullStart() === 0 ? 0 : st.getStart(sf), e: st.getEnd(), text: "", whole: true }); removedDecls++; continue; }
    // rebuild the import with remaining bindings
    const keepDefault = ic.name && !unused.some((u) => u.kind === "default") ? ic.name.text : null;
    const keepNamed = named && ts.isNamedImports(named) ? named.elements.filter((e) => !unused.some((u) => u.e === e)).map((e) => e.getText(sf)) : [];
    const typeOnly = ic.isTypeOnly ? "type " : "";
    const parts = [keepDefault, keepNamed.length ? `{ ${keepNamed.join(", ")} }` : null].filter(Boolean).join(", ");
    edits.push({ s: st.getStart(sf), e: st.getEnd(), text: `import ${typeOnly}${parts} from ${st.moduleSpecifier.getText(sf)};` });
  }
  if (!edits.length) continue;
  files++;
  if (apply) {
    let out = src;
    for (const ed of edits.sort((a, b) => b.s - a.s)) {
      let end = ed.e; if (ed.whole && out[end] === "\n") end++; // drop the trailing newline of a removed statement
      out = out.slice(0, ed.s) + ed.text + out.slice(end);
    }
    fs.writeFileSync(f, out);
  }
}
console.log(JSON.stringify({ apply, files, removedSpecs, removedDecls }));
