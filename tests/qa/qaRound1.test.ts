import { describe, expect, it } from "vitest";
import { friendlyError } from "@/lib/errors/friendlyError";
import { sanitizeEmployeePayload, validateEmployee } from "@/lib/hr/employeeValidation";
import { validateGstin, lookupGstin } from "@/lib/sales/gstinLookup";
import { gridToStyledXlsx, inferColumns } from "@/lib/export/styledWorkbook";

describe("friendlyError", () => {
  it("translates mongoose required/cast/enum errors", () => {
    expect(friendlyError("Path `itemCode` is required. Path `itemName` is required.")).toBe("Item is required. Item name is required.");
    const msg = friendlyError(
      'Employee validation failed: departmentId: Cast to ObjectId failed for value "" (type string) at path "departmentId" because of "BSONError", gender: `` is not a valid enum value for path `gender`.',
    );
    expect(msg).toContain("Please select a valid gender");
    expect(msg).toContain("department");
    expect(msg).not.toMatch(/BSON|ObjectId|path/i);
  });
  it("hides driver/internal text and passes plain messages through", () => {
    expect(friendlyError("Internal server error", "fallback")).toBe("fallback");
    expect(friendlyError("Failed to fetch")).toMatch(/internet connection/);
    expect(friendlyError("Customer is required")).toBe("Customer is required");
  });
});

describe("employee validation", () => {
  const good = { employeeCode: "E-001", firstName: "Asha", lastName: "Nair", email: "asha@x.com", phone: "9876543210", dateOfJoining: "2026-01-01" };
  it("accepts a valid employee", () => expect(validateEmployee(good)).toEqual({}));
  it("flags bad fields individually", () => {
    const e = validateEmployee({ ...good, email: "nope", phone: "12345", firstName: "A1", employeeCode: "a b" });
    expect(Object.keys(e).sort()).toEqual(["email", "employeeCode", "firstName", "phone"]);
  });
  it("rejects deductions above gross and negatives", () => {
    expect(validateEmployee({ ...good, salary: { basic: 1000, deductions: { pf: 2000 } } })["salary.deductions"]).toBeTruthy();
    expect(validateEmployee({ ...good, salary: { basic: -1 } })["salary.basic"]).toBeTruthy();
  });
  it("sanitize drops empty ObjectId/enum values that caused BSON errors", () => {
    const out = sanitizeEmployeePayload({ ...good, departmentId: "", gender: "" });
    expect("departmentId" in out).toBe(false);
    expect("gender" in out).toBe(false);
  });
});

describe("GSTIN", () => {
  it("validates the QA test GSTIN and decodes state/PAN offline", async () => {
    expect(validateGstin("32AAVCM0878J1ZX").ok).toBe(true);
    const r = await lookupGstin("32aavcm0878j1zx");
    expect(r.ok).toBe(true);
    expect(r.data?.pan).toBe("AAVCM0878J");
    expect(r.data?.address.state).toBe("Kerala");
    expect(r.data?.isCompany).toBe(true);
  });
  it("rejects malformed or mistyped GSTINs", () => {
    expect(validateGstin("123").ok).toBe(false);
    expect(validateGstin("32AAVCM0878J1ZY").ok).toBe(false);
  });
});

describe("styled workbook", () => {
  it("infers typed columns and produces an xlsx", async () => {
    const cols = inferColumns(["Name", "Employee Code", "Date of Joining", "Gross Salary", "Count"], [["A", "E001", "2026-01-05", 5000.5, 3]]);
    expect(cols.map((c) => c.type)).toEqual(["text", "text", "date", "currency", "integer"]);
    const buf = await gridToStyledXlsx({ title: "T", data: [["Name", "Amount"], ["x", 10]] });
    expect(buf.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(buf[0], buf[1])).toBe("PK");
  });
});
