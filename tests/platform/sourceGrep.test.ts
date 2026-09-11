import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Static-analysis guardrails for the Global Admin control plane's two
 * hardest invariants (brief Part 2.3, Part 5.2). These use direct source
 * text search rather than runtime tests, following the same technique the
 * prior AI-workflows project used to enforce "no ORM writes in workflows"
 * (docs/ai/BRIEF-01-FOUNDATION.md) — a real, working precedent for this
 * exact kind of architectural rule in this repo.
 */

const ROOT = path.resolve(__dirname, "../..");

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function relative(p: string): string {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

describe("source-grep: crossTenant.ts is the only cross-tenant read path", () => {
  const allSourceFiles = [
    ...walk(path.join(ROOT, "app"), [".ts", ".tsx"]),
    ...walk(path.join(ROOT, "lib"), [".ts", ".tsx"]),
    ...walk(path.join(ROOT, "components"), [".ts", ".tsx"]),
  ];

  const importersOfCrossTenant = allSourceFiles.filter((file) => {
    if (relative(file) === "lib/platform/tenancy/crossTenant.ts") return false;
    const content = readFileSync(file, "utf8");
    return (
      content.includes("lib/platform/tenancy/crossTenant") ||
      content.includes("platform/tenancy/crossTenant")
    );
  });

  it("crossTenant.ts is never imported from a tenant-facing app/api/<module>/** route", () => {
    const violations = importersOfCrossTenant.filter((file) => {
      const rel = relative(file);
      return rel.startsWith("app/api/") && !rel.startsWith("app/api/platform/");
    });
    expect(violations.map(relative)).toEqual([]);
  });

  it("crossTenant.ts is never imported from any file outside app/platform/**, lib/platform/**, or app/api/platform/**", () => {
    const violations = importersOfCrossTenant.filter((file) => {
      const rel = relative(file);
      return !(
        rel.startsWith("app/platform/") ||
        rel.startsWith("lib/platform/") ||
        rel.startsWith("app/api/platform/") ||
        rel.startsWith("tests/")
      );
    });
    expect(violations.map(relative)).toEqual([]);
  });
});

describe("source-grep: PlatformAuditLog is never mutated outside its own model guard", () => {
  it("no application code calls a mutating method on PlatformAuditLog directly (writes must go through lib/platform/audit/emit.ts)", () => {
    const allSourceFiles = [
      ...walk(path.join(ROOT, "app"), [".ts", ".tsx"]),
      ...walk(path.join(ROOT, "lib"), [".ts", ".tsx"]),
    ].filter((f) => {
      const rel = relative(f);
      return rel !== "models/platform/PlatformAuditLog.ts" && rel !== "lib/platform/audit/emit.ts";
    });

    const mutatingCallPattern =
      /PlatformAuditLog\.(updateOne|updateMany|findOneAndUpdate|deleteOne|deleteMany|findOneAndDelete)\s*\(/;

    const violations = allSourceFiles.filter((file) => {
      const content = readFileSync(file, "utf8");
      return content.includes("PlatformAuditLog") && mutatingCallPattern.test(content);
    });
    expect(violations.map(relative)).toEqual([]);
  });

  it("models/platform/PlatformAuditLog.ts itself still declares all five immutability guards", () => {
    const content = readFileSync(path.join(ROOT, "models/platform/PlatformAuditLog.ts"), "utf8");
    for (const hook of ["updateOne", "findOneAndUpdate", "updateMany", "deleteOne", "findOneAndDelete", "deleteMany", "save"]) {
      expect(content).toContain(`pre("${hook}"`);
    }
  });
});

describe("source-grep: lib/platform/auth/adminSessionEdge.ts stays Mongoose-free (middleware.ts Edge-runtime safety)", () => {
  it("does not import mongoose or any @/models path", () => {
    const content = readFileSync(
      path.join(ROOT, "lib/platform/auth/adminSessionEdge.ts"),
      "utf8",
    );
    expect(content).not.toMatch(/from ["']mongoose["']/);
    expect(content).not.toMatch(/from ["']@\/models/);
    expect(content).not.toMatch(/from ["']@\/lib\/db["']/);
  });
});
