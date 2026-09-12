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
      // lib/platform/audit/retention.ts (Phase 5) is the one sanctioned
      // caller of PlatformAuditLog.deleteMany — via the allowRetentionDelete
      // escape hatch, checked separately below.
      return (
        rel !== "models/platform/PlatformAuditLog.ts" &&
        rel !== "lib/platform/audit/emit.ts" &&
        rel !== "lib/platform/audit/retention.ts"
      );
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

  it("allowRetentionDelete (the one sanctioned deletion escape hatch) appears only in lib/platform/audit/retention.ts and its own test", () => {
    const allSourceFiles = [
      ...walk(path.join(ROOT, "app"), [".ts", ".tsx"]),
      ...walk(path.join(ROOT, "lib"), [".ts", ".tsx"]),
    ].filter((f) => {
      const rel = relative(f);
      return rel !== "lib/platform/audit/retention.ts";
    });

    const violations = allSourceFiles.filter((file) => readFileSync(file, "utf8").includes("allowRetentionDelete"));
    expect(violations.map(relative)).toEqual([]);
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

describe("source-grep: Hard Rule 14 — no sensitive field name is passed into an audit write's structured payload", () => {
  // lib/platform/audit/emit.ts's own doc comment states the rule ("never pass
  // prompt/response bodies, credentials, or full financial records") but does
  // not enforce it — "callers are responsible." This test is the enforcement:
  // every real call site's argument object, scanned for a literal object key
  // whose name matches a known-sensitive field. A false positive (a
  // legitimately-named, non-sensitive field that happens to match) is fixed
  // by narrowing the pattern, not by weakening what it checks — narrowing
  // must stay specific to the offending key, not to the call site.
  const SENSITIVE_KEY_PATTERN =
    /\b(password|passwordHash|secret|mfaSecret|totpSecret|otpCode|apiKey|token|prompt|response|creditCard|cardNumber|cvv|bankAccount|accountNumber|ssn|aadhaar|panNumber)\s*:/i;

  function extractBalancedCall(source: string, callAnchor: string): string[] {
    const calls: string[] = [];
    let searchFrom = 0;
    while (true) {
      const idx = source.indexOf(callAnchor, searchFrom);
      if (idx === -1) break;
      const openParenIdx = idx + callAnchor.length - 1;
      let depth = 0;
      let i = openParenIdx;
      for (; i < source.length; i++) {
        if (source[i] === "(") depth++;
        else if (source[i] === ")") {
          depth--;
          if (depth === 0) break;
        }
      }
      calls.push(source.slice(openParenIdx, i + 1));
      searchFrom = i + 1;
    }
    return calls;
  }

  it("no emitPlatformAuditEvent(...) call site's argument object contains a sensitive key", () => {
    const allSourceFiles = [
      ...walk(path.join(ROOT, "app"), [".ts", ".tsx"]),
      ...walk(path.join(ROOT, "lib"), [".ts", ".tsx"]),
    ];

    const violations: string[] = [];
    for (const file of allSourceFiles) {
      const content = readFileSync(file, "utf8");
      if (!content.includes("emitPlatformAuditEvent(")) continue;
      for (const call of extractBalancedCall(content, "emitPlatformAuditEvent(")) {
        const match = SENSITIVE_KEY_PATTERN.exec(call);
        if (match) violations.push(`${relative(file)}: key "${match[1]}"`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("no AiUsageRecord.create(...) call site's argument object contains a sensitive key (Hard Rule 14, source doc §17)", () => {
    const allSourceFiles = [...walk(path.join(ROOT, "lib"), [".ts", ".tsx"])];

    const violations: string[] = [];
    for (const file of allSourceFiles) {
      const content = readFileSync(file, "utf8");
      if (!content.includes("AiUsageRecord.create(")) continue;
      for (const call of extractBalancedCall(content, "AiUsageRecord.create(")) {
        const match = SENSITIVE_KEY_PATTERN.exec(call);
        if (match) violations.push(`${relative(file)}: key "${match[1]}"`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("this test itself would catch a real violation — proven with a synthetic positive case", () => {
    const synthetic = 'emitPlatformAuditEvent({ actor, metadata: { password: userPassword } })';
    const calls = extractBalancedCall(synthetic, "emitPlatformAuditEvent(");
    expect(calls).toHaveLength(1);
    expect(SENSITIVE_KEY_PATTERN.test(calls[0])).toBe(true);
  });
});

describe("source-grep: Hard Rule 6 — a plan change never reaches a delete-family call", () => {
  // lib/platform/entitlements/assignPlan.ts's own doc comment states this by
  // construction ("only ever writes to Organization, OrganizationEntitlement,
  // SubscriptionEvent"), but nothing previously guarded against a future edit
  // reintroducing a delete call into this directory. This is that guard.
  const DELETE_CALL_PATTERN = /\.(deleteOne|deleteMany|remove|findOneAndDelete)\s*\(/;

  it("lib/platform/entitlements/** contains no delete-family call", () => {
    const files = walk(path.join(ROOT, "lib/platform/entitlements"), [".ts"]);
    expect(files.length).toBeGreaterThan(0);
    const violations = files.filter((f) => DELETE_CALL_PATTERN.test(readFileSync(f, "utf8")));
    expect(violations.map(relative)).toEqual([]);
  });

  it("lib/billing/** contains no delete-family call", () => {
    const files = walk(path.join(ROOT, "lib/billing"), [".ts"]);
    expect(files.length).toBeGreaterThan(0);
    const violations = files.filter((f) => DELETE_CALL_PATTERN.test(readFileSync(f, "utf8")));
    expect(violations.map(relative)).toEqual([]);
  });
});
