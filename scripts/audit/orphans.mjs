#!/usr/bin/env node
/**
 * Reachability analysis over tracked TS/TSX/JS/MJS files. Roots = Next.js convention files, middleware/auth/config,
 * tests, scripts, electron, CI. Edges = import / export-from / require / dynamic import() (string or template prefix) /
 * vi.mock("...") / any string literal that resolves to a project file ("@/x", "./x"). Template dynamic imports mark the
 * whole directory prefix as referenced. Output: JSON {orphans:[...], dynamicPrefixes:[...]}.
 * Static analysis: a file reported here is only a CANDIDATE; it still needs manual verification.
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const files = execSync("git ls-files", { encoding: "utf8", maxBuffer: 1 << 26 }).split("\n").filter(Boolean);
const code = files.filter((f) => /\.(tsx?|jsx?|mjs|cjs)$/.test(f) && !f.endsWith(".d.ts"));
const set = new Set(files);
const EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", "/index.ts", "/index.tsx", "/index.js"];
function resolve(spec, from) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else return null;
  for (const e of EXT) if (set.has(base + e)) return base + e;
  return null;
}
const edges = new Map(); const dynPrefixes = new Set();
for (const f of code) {
  const src = fs.readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true);
  const out = new Set();
  const add = (s) => { const r = resolve(s, f); if (r) out.add(r); };
  const visit = (n) => {
    if (ts.isStringLiteralLike(n)) add(n.text);
    if (ts.isTemplateExpression(n) && n.head.text) {
      const p = n.head.text;
      if (p.startsWith("@/") || p.startsWith(".")) dynPrefixes.add(p.startsWith("@/") ? p.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(f), p)));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  edges.set(f, out);
}
const dyn = [...dynPrefixes];
const isRoot = (f) =>
  /(^|\/)(page|layout|route|loading|error|global-error|not-found|template|default|middleware|instrumentation|proxy|sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon)\.(tsx?|jsx?)$/.test(f) && (f.startsWith("app/") || !f.includes("/")) ||
  /^(auth|auth\.config|middleware|instrumentation|next\.config|vitest\.config|eslint\.config|postcss\.config|tailwind\.config)\.(ts|mjs|js)$/.test(f) ||
  f.startsWith("tests/") || f.startsWith("scripts/") || f.startsWith("electron/") || f.startsWith(".github/") || f.startsWith("types/");
const seen = new Set(); const stack = code.filter(isRoot);
while (stack.length) { const f = stack.pop(); if (seen.has(f)) continue; seen.add(f); for (const t of edges.get(f) ?? []) if (!seen.has(t) && edges.has(t)) stack.push(t); }
// directory-prefix dynamic references keep everything beneath them
for (const f of code) if (!seen.has(f) && dyn.some((p) => f.startsWith(p) || f.startsWith(p.replace(/\/[^/]*$/, "/")) && p.endsWith("/"))) seen.add(f);
// anything referenced by a kept file (second pass for files pulled in by prefix)
let grew = true; while (grew) { grew = false; for (const f of [...seen]) for (const t of edges.get(f) ?? []) if (!seen.has(t) && edges.has(t)) { seen.add(t); grew = true; } }
const orphans = code.filter((f) => !seen.has(f) && !isRoot(f));
console.log(JSON.stringify({ total: code.length, reachable: seen.size, orphans, dynamicPrefixes: dyn }, null, 1));
