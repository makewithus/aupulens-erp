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
import * as xlsx from "xlsx";
import fs from "fs";
import { parseSourceFile, validateSourceFile } from "@/lib/migration/sourceAdapters";
import { deterministicMapping } from "@/lib/migration/deterministicMapping";
import { getEntitySchema } from "@/lib/migration/entitySchemas";
import { validateRows, toCanonicalRecord, dedupeSignature, normalizePhoneLikeValue } from "@/lib/migration/validation";
import {
  expandMigrationPackage,
  inferEntityType,
  normalizeSourceSystem,
  prepareMigrationFiles,
  validateZipEntryPath,
} from "@/lib/migration/package";
import { MIGRATION_MAX_ROWS } from "@/lib/migration/constants";

const buf = (s: string) => Buffer.from(s, "utf-8");
const itIfFile = (fileName: string) => fs.existsSync(fileName) ? it : it.skip;

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
    expect(inferEntityType("Sales Orders", ["Sales Order No", "Customer Code", "Order Date", "Order Total"])).toBe("salesOrder");
    expect(inferEntityType("Sales Order Lines", ["Sales Order No", "Item Code", "Quantity", "Unit Price"])).toBe("salesOrderLine");
    expect(inferEntityType("README", ["Notes"])).toBeNull();
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

  it("prepares each non-empty Excel sheet as a separate migration file", () => {
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.json_to_sheet([
        { "Employee ID": "EMP001", "Employee Name": "Arjun Menon", Email: "arjun@example.com" },
      ]),
      "Employees",
    );
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.json_to_sheet([
        { "Product ID": "PROD001", "Product Name": "Lens", "Unit Price": 1200 },
      ]),
      "Products",
    );

    const prepared = prepareMigrationFiles(
      [{ name: "Aupulens_Employee_Product_Migration_Test_Data.xlsx", buffer: xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }) }],
      "tally",
    );

    expect(prepared.map((file) => file.entityType)).toEqual(["employee", "product"]);
    expect(prepared.map((file) => file.rows.length)).toEqual([1, 1]);
    expect(prepared.map((file) => file.name)).toEqual([
      "Aupulens_Employee_Product_Migration_Test_Data.xlsx - Employees",
      "Aupulens_Employee_Product_Migration_Test_Data.xlsx - Products",
    ]);
  });

  itIfFile("Aupulens_Employee_Product_Migration_Test_Data.xlsx")("maps the root employee/product workbook without dropping simple fields", () => {
    const prepared = prepareMigrationFiles(
      [{ name: "Aupulens_Employee_Product_Migration_Test_Data.xlsx", buffer: fs.readFileSync("Aupulens_Employee_Product_Migration_Test_Data.xlsx") }],
      "excel",
    );

    expect(prepared.map((file) => [file.entityType, file.rows.length])).toEqual([
      ["employee", 15],
      ["product", 15],
    ]);

    const product = prepared.find((file) => file.entityType === "product")!;
    const productMapping = deterministicMapping(getEntitySchema("product")!, product.columns);
    expect(productMapping).toMatchObject({
      sourceId: "Product ID",
      name: "Product Name",
      category: "Category",
      subcategory: "Subcategory",
      brand: "Brand",
      salesPrice: "Unit Price",
      stockQuantity: "Stock Quantity",
      status: "Status",
    });

    const employee = prepared.find((file) => file.entityType === "employee")!;
    const employeeMapping = deterministicMapping(getEntitySchema("employee")!, employee.columns);
    expect(employeeMapping).toMatchObject({
      employeeId: "Employee ID",
      firstName: "Employee Name",
      email: "Email",
      phone: "Phone",
      department: "Department",
      designation: "Designation",
      joiningDate: "Joining Date",
      status: "Status",
    });
  });

  itIfFile("MD_V2.xlsx")("maps the MD_V2 workbook identifiers and fields for employee/product preview", () => {
    const prepared = prepareMigrationFiles(
      [{ name: "MD_V2.xlsx", buffer: fs.readFileSync("MD_V2.xlsx") }],
      "excel",
    );

    expect(prepared.map((file) => [file.entityType, file.rows.length])).toEqual([
      ["employee", 20],
      ["product", 20],
    ]);

    const employee = prepared.find((file) => file.entityType === "employee")!;
    const employeeMapping = deterministicMapping(getEntitySchema("employee")!, employee.columns);
    expect(employeeMapping).toMatchObject({
      employeeId: "Employee Code",
      firstName: "Full Name",
      email: "Work Email",
      phone: "Mobile Number",
      department: "Department",
      designation: "Job Title",
      joiningDate: "Date Joined",
      status: "Employment Status",
    });

    const product = prepared.find((file) => file.entityType === "product")!;
    const productMapping = deterministicMapping(getEntitySchema("product")!, product.columns);
    expect(productMapping).toMatchObject({
      sourceId: "Product Code",
      name: "Product Name",
      category: "Product Category",
      type: "Product Type",
      brand: "Brand",
      salesPrice: "Selling Price",
      stockQuantity: "Available Quantity",
      status: "Product Status",
    });
  });

  itIfFile("MD_V3.xlsx")("maps MD_V3 payments through invoice references without needing AI", () => {
    const prepared = prepareMigrationFiles(
      [{ name: "MD_V3.xlsx", buffer: fs.readFileSync("MD_V3.xlsx") }],
      "excel",
    );

    const payments = prepared.find((file) => file.entityType === "payment")!;
    expect(payments.rows.length).toBe(55);

    const mapping = deterministicMapping(getEntitySchema("payment")!, payments.columns);
    expect(mapping).toMatchObject({
      sourceId: "Payment Ref",
      invoiceSourceId: "Invoice No",
      date: "Payment Date",
      type: "Payment Mode",
      reference: "Reference No",
      amount: "Amount",
    });
    expect(mapping.partyName).toBeUndefined();
  });

  itIfFile("MD_V3.xlsx")("detects all MD_V3 workbook entities and ignores README", () => {
    const prepared = prepareMigrationFiles(
      [{ name: "MD_V3.xlsx", buffer: fs.readFileSync("MD_V3.xlsx") }],
      "excel",
    );

    expect(prepared.map((file) => file.entityType)).toEqual([
      "customer",
      "vendor",
      "product",
      "salesOrder",
      "salesOrderLine",
      "salesInvoice",
      "payment",
    ]);
    expect(prepared.map((file) => file.name)).not.toContain("MD_V3.xlsx - README");
  });

  itIfFile("Odoo_Legacy_ERP_Migration_Extensive_Test_Dataset_Random_IDs.xlsx")("uploads the root Odoo legacy workbook without failing on unsupported sheets", () => {
    const prepared = prepareMigrationFiles(
      [{ name: "Odoo_Legacy_ERP_Migration_Extensive_Test_Dataset_Random_IDs.xlsx", buffer: fs.readFileSync("Odoo_Legacy_ERP_Migration_Extensive_Test_Dataset_Random_IDs.xlsx") }],
      "odoo",
    );

    expect(prepared.map((file) => [file.entityType, file.rows.length])).toEqual([
      ["customer", 6],
      ["vendor", 4],
      ["employee", 8],
      ["product", 10],
      ["salesInvoice", 4],
      ["invoiceItem", 7],
      ["payment", 2],
    ]);
    expect(prepared.map((file) => file.name)).not.toContain(
      "Odoo_Legacy_ERP_Migration_Extensive_Test_Dataset_Random_IDs.xlsx - Departments",
    );
    expect(prepared.map((file) => file.name)).not.toContain(
      "Odoo_Legacy_ERP_Migration_Extensive_Test_Dataset_Random_IDs.xlsx - Product Categories",
    );

    const customer = prepared.find((file) => file.entityType === "customer")!;
    expect(customer.rows[0].Phone).toBe(919810000001);
    expect(deterministicMapping(getEntitySchema("customer")!, customer.columns)).toMatchObject({
      sourceId: "Legacy Customer ID",
      name: "Customer Name",
      email: "Email",
      phone: "Phone",
      gstin: "GSTIN",
      city: "City",
      stateName: "State",
    });

    const invoiceItem = prepared.find((file) => file.entityType === "invoiceItem")!;
    expect(deterministicMapping(getEntitySchema("invoiceItem")!, invoiceItem.columns)).toMatchObject({
      invoiceSourceId: "Invoice Legacy ID",
      productSourceId: "Product Legacy ID",
      qty: "Quantity",
      unitPrice: "Unit Price",
      taxRate: "Tax Rate %",
    });
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
  it("expands spreadsheet scientific notation for phone-like fields", () => {
    expect(normalizePhoneLikeValue("9.1981E+11")).toBe("919810000000");

    const schema = getEntitySchema("customer")!;
    const rec = toCanonicalRecord(
      schema,
      { Name: "Acme", Phone: "9.1981E+11", Mobile: "9.1982E+11" },
      { name: "Name", phone: "Phone", mobile: "Mobile" },
    );

    expect(rec.phone).toBe("919810000000");
    expect(rec.mobile).toBe("919820000000");
  });

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

  it("warns for blank optional mapped fields without blocking migration", () => {
    const res = validateRows(
      "product",
      [{ Name: "Speaker", SKU: "SPK-1", Brand: "", Category: "" }],
      { name: "Name", sku: "SKU", brand: "Brand", category: "Category" },
    );
    expect(res.errorCount).toBe(0);
    expect(res.issues.filter((i) => i.severity === "warning").map((i) => i.field).sort()).toEqual(["brand", "category"]);
  });

  it("flags negative stock as invalid product data", () => {
    const res = validateRows(
      "product",
      [{ Name: "Speaker", SKU: "SPK-1", Stock: "-5" }],
      { name: "Name", sku: "SKU", stockQuantity: "Stock" },
    );
    expect(res.errorCount).toBeGreaterThan(0);
    expect(res.issues.some((i) => /stock quantity cannot be negative/.test(i.message))).toBe(true);
  });

  it("accepts legacy product type taxonomy without blocking migration", () => {
    for (const productType of ["Hardware", "Accessory", "Consumable", "Goods", "Item", "Equipment", "Printing"]) {
      const res = validateRows(
        "product",
        [{ Name: "Speaker", SKU: "SPK-1", Type: productType }],
        { name: "Name", sku: "SKU", type: "Type" },
      );
      expect(res.errorCount, productType).toBe(0);
    }
  });

  it("flags impossible calendar dates before write checks", () => {
    const res = validateRows(
      "salesInvoice",
      [{ "Invoice No": "INV-V3-91019", "Customer Code": "CUSV3-41019", "Invoice Date": "31/02/2026" }],
      { number: "Invoice No", customerName: "Customer Code", invoiceDate: "Invoice Date" },
    );
    expect(res.errorCount).toBeGreaterThan(0);
    expect(res.issues.some((i) => i.field === "invoiceDate" && /valid calendar date/.test(i.message))).toBe(true);
  });

  it("detects in-file duplicates", () => {
    const res = validateRows(
      "customer",
      [{ Name: "Acme", Email: "a@x.com" }, { Name: "Acme", Email: "a@x.com" }],
      custMapping,
    );
    expect(res.duplicateCount).toBe(1);
  });

  it("detects duplicate payment references independent of source id", () => {
    const schema = getEntitySchema("payment")!;
    const a = dedupeSignature(schema, toCanonicalRecord(schema, { Ref: "PAY-REF-1", Source: "PAY-A", Amount: "10", Date: "2026-01-01" }, { reference: "Ref", sourceId: "Source", amount: "Amount", date: "Date" }));
    const b = dedupeSignature(schema, toCanonicalRecord(schema, { Ref: "PAY-REF-1", Source: "PAY-B", Amount: "20", Date: "2026-01-02" }, { reference: "Ref", sourceId: "Source", amount: "Amount", date: "Date" }));
    expect(a).toBe(b);
  });
});
