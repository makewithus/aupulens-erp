/**
 * Pure-logic tests for the Universal ERP Migration Platform pipeline:
 * source adapters (CSV/JSON/XML), file-type gating, deterministic field
 * mapping, and the validation engine (required/format/GSTIN/state-code/dedupe).
 *
 * The AI mapping layer and DB-touching importer are covered separately (the AI
 * layer degrades to deterministicMapping, tested here; the importer needs a DB).
 */

import { describe, it, expect } from "vitest";
import AdmZip from "adm-zip";
import { parseSourceFile, validateSourceFile } from "@/lib/migration/sourceAdapters";
import { deterministicMapping } from "@/lib/migration/deterministicMapping";
import { getEntitySchema } from "@/lib/migration/entitySchemas";
import { validateRows, toCanonicalRecord, dedupeSignature } from "@/lib/migration/validation";
import {
  expandMigrationPackage,
  inferEntityType,
  normalizeSourceSystem,
  prepareMigrationFiles,
  validateZipEntryPath,
} from "@/lib/migration/package";
import { MIGRATION_MAX_ROWS } from "@/lib/migration/constants";

const buf = (s: string) => Buffer.from(s, "utf-8");

describe("sourceAdapters.validateSourceFile", () => {
  it("accepts supported formats", () => {
    for (const f of ["a.csv", "a.tsv", "a.xls", "a.xlsx", "a.json", "a.xml"]) {
      expect(validateSourceFile(f)).toBeNull();
    }
  });
  it("rejects unsupported formats", () => {
    expect(validateSourceFile("a.pdf")).toMatch(/Unsupported/);
    expect(validateSourceFile("noext")).toMatch(/Unsupported/);
  });
});

describe("sourceAdapters.parseSourceFile", () => {
  it("parses CSV into columns + rows", () => {
    const { columns, rows } = parseSourceFile("c.csv", buf("Name,Email\nAcme,acme@x.com\nBeta,beta@x.com"));
    expect(columns).toEqual(["Name", "Email"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ Name: "Acme", Email: "acme@x.com" });
  });

  it("parses a top-level JSON array", () => {
    const { rows } = parseSourceFile("c.json", buf(JSON.stringify([{ Name: "Acme" }, { Name: "Beta" }])));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ Name: "Beta" });
  });

  it("parses a JSON envelope with a nested array", () => {
    const { rows } = parseSourceFile("c.json", buf(JSON.stringify({ data: [{ Name: "Acme" }] })));
    expect(rows).toHaveLength(1);
  });

  it("parses XML by detecting the repeating record element", () => {
    const xml = `<ROOT>
      <LEDGER><NAME>Acme</NAME><GSTIN>27ABCDE1234F1Z5</GSTIN></LEDGER>
      <LEDGER><NAME>Beta</NAME><GSTIN>29ABCDE1234F1Z5</GSTIN></LEDGER>
    </ROOT>`;
    const { columns, rows } = parseSourceFile("c.xml", buf(xml));
    expect(rows).toHaveLength(2);
    expect(columns).toContain("NAME");
    expect(rows[0]).toMatchObject({ NAME: "Acme" });
  });

  it("throws a clear error on invalid JSON", () => {
    expect(() => parseSourceFile("c.json", buf("{not json"))).toThrow(/valid JSON/);
  });
});

describe("migration package preparation", () => {
  it("rejects zip-slip paths before extraction", () => {
    expect(validateZipEntryPath("../customers.csv")).toMatch(/Unsafe/);
    expect(validateZipEntryPath("/tmp/customers.csv")).toMatch(/Unsafe/);
    expect(validateZipEntryPath("nested/customers.csv")).toBeNull();
  });

  it("expands valid ZIP packages and rejects unsupported files inside ZIPs", () => {
    const zip = new AdmZip();
    zip.addFile("customers.csv", buf("Customer Name,Email ID\nAcme,acme@example.com"));
    const files = expandMigrationPackage([{ name: "package.zip", buffer: zip.toBuffer() }]);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("customers.csv");

    const badZip = new AdmZip();
    badZip.addFile("customers.pdf", buf("%PDF"));
    expect(() => expandMigrationPackage([{ name: "bad.zip", buffer: badZip.toBuffer() }])).toThrow(/Unsupported file format/);
  });

  it("infers canonical entities from filenames and headers", () => {
    expect(inferEntityType("ledger-export.csv", ["Ledger Name", "Under"])).toBe("account");
    expect(inferEntityType("mystery.csv", ["Customer Name", "GST No", "Email ID"])).toBe("customer");
    expect(inferEntityType("invoice-lines.csv", ["Invoice Number", "Item Name", "Qty", "Rate"])).toBe("invoiceItem");
  });

  it("prepares files atomically and fails unsupported entity data", () => {
    const prepared = prepareMigrationFiles(
      [{ name: "customers.csv", buffer: buf("Customer Name,Email ID\nAcme,acme@example.com") }],
      "other",
    );
    expect(prepared[0]).toMatchObject({ entityType: "customer", columns: ["Customer Name", "Email ID"] });

    expect(() =>
      prepareMigrationFiles([{ name: "unknown.csv", buffer: buf("Foo,Bar\n1,2") }], "other"),
    ).toThrow(/Could not infer/);
  });

  it("normalizes unknown source systems instead of persisting invalid enum values", () => {
    expect(normalizeSourceSystem("tally")).toBe("tally");
    expect(normalizeSourceSystem("definitely-not-real")).toBe("other");
  });

  it("rejects batch files over the per-file row safety limit before workspace creation", () => {
    const rows = ["Customer Name,Email ID"];
    for (let i = 0; i < MIGRATION_MAX_ROWS + 1; i++) {
      rows.push(`Customer ${i},customer${i}@example.com`);
    }

    expect(() =>
      prepareMigrationFiles([{ name: "customers.csv", buffer: buf(rows.join("\n")) }], "other"),
    ).toThrow(/per-file limit/);
  });
});

describe("fieldMapping.deterministicMapping", () => {
  it("maps common customer headers to canonical fields", () => {
    const schema = getEntitySchema("customer")!;
    const mapping = deterministicMapping(schema, ["Customer Name", "Email ID", "GST No", "City"]);
    expect(mapping.name).toBe("Customer Name");
    expect(mapping.email).toBe("Email ID");
    expect(mapping.gstin).toBe("GST No");
    expect(mapping.city).toBe("City");
  });

  it("never assigns one source column to two fields", () => {
    const schema = getEntitySchema("vendor")!;
    const mapping = deterministicMapping(schema, ["Name"]);
    const cols = Object.values(mapping);
    expect(new Set(cols).size).toBe(cols.length);
  });
});

describe("validation.toCanonicalRecord + dedupeSignature", () => {
  it("pulls mapped values by field key", () => {
    const schema = getEntitySchema("customer")!;
    const rec = toCanonicalRecord(schema, { CN: "Acme", GST: "27ABCDE1234F1Z5" }, { name: "CN", gstin: "GST" });
    expect(rec.name).toBe("Acme");
    expect(rec.gstin).toBe("27ABCDE1234F1Z5");
  });

  it("builds a case-insensitive dedupe signature from dedupeKeys", () => {
    const schema = getEntitySchema("customer")!;
    const a = dedupeSignature(schema, toCanonicalRecord(schema, { N: "Acme" }, { name: "N" }));
    const b = dedupeSignature(schema, toCanonicalRecord(schema, { N: "ACME" }, { name: "N" }));
    expect(a).toBe(b);
  });
});

describe("validation.validateRows", () => {
  const custMapping = { name: "Name", email: "Email", gstin: "GST" };

  it("flags a structural error when a required field is unmapped", () => {
    const res = validateRows("customer", [{ Email: "x@y.com" }], { email: "Email" });
    expect(res.errorCount).toBeGreaterThan(0);
    expect(res.issues.some((i) => i.rowIndex === -1 && /not mapped/.test(i.message))).toBe(true);
  });

  it("flags a per-row error when a required value is empty", () => {
    const res = validateRows("customer", [{ Name: "", Email: "x@y.com" }], custMapping);
    expect(res.issues.some((i) => i.rowIndex === 0 && i.severity === "error")).toBe(true);
  });

  it("warns (not errors) on a malformed GSTIN", () => {
    const res = validateRows("customer", [{ Name: "Acme", GST: "BADGSTIN" }], custMapping);
    expect(res.errorCount).toBe(0);
    expect(res.issues.some((i) => i.field === "gstin" && i.severity === "warning")).toBe(true);
  });

  it("accepts a well-formed GSTIN with a valid state code", () => {
    const res = validateRows("customer", [{ Name: "Acme", GST: "27ABCDE1234F1Z5" }], custMapping);
    expect(res.issues.some((i) => i.field === "gstin")).toBe(false);
  });

  it("warns on an invalid GST state code (00)", () => {
    const res = validateRows("customer", [{ Name: "Acme", GST: "00ABCDE1234F1Z5" }], custMapping);
    expect(res.issues.some((i) => i.field === "gstin" && /state code/.test(i.message))).toBe(true);
  });

  it("detects in-file duplicates", () => {
    const res = validateRows(
      "customer",
      [{ Name: "Acme", Email: "a@x.com" }, { Name: "Acme", Email: "a@x.com" }],
      custMapping,
    );
    expect(res.duplicateCount).toBe(1);
  });
});
