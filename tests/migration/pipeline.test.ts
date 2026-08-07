/**
 * Pure-logic tests for the Universal ERP Migration Platform pipeline:
 * source adapters (CSV/JSON/XML), file-type gating, deterministic field
 * mapping, and the validation engine (required/format/GSTIN/state-code/dedupe).
 *
 * The AI mapping layer and DB-touching importer are covered separately (the AI
 * layer degrades to deterministicMapping, tested here; the importer needs a DB).
 */

import { describe, it, expect } from "vitest";
import { parseSourceFile, validateSourceFile } from "@/lib/migration/sourceAdapters";
import { deterministicMapping } from "@/lib/migration/deterministicMapping";
import { getEntitySchema } from "@/lib/migration/entitySchemas";
import { validateRows, toCanonicalRecord, dedupeSignature } from "@/lib/migration/validation";

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
