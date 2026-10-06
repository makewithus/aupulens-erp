import { describe, expect, it } from "vitest";
import { friendlyMigrationRecordError, summarizeMigrationRow } from "@/lib/migration/friendlyRecordError";

describe("friendlyMigrationRecordError", () => {
  it("turns duplicate database errors into user-readable migration guidance", () => {
    const record = {
      entityType: "employee",
      sourceData: {
        "Employee Code": "ZETA-EMP-4701",
        "Full Name": "Aarush Bedi",
        "Work Email": "aarushbedi.z4701@aurora-workforce.co.in",
      },
      errors: [{
        message: 'E11000 duplicate key error collection: test.employees index: tenantId_1_employeeCode_1 dup key: { tenantId: "default-tenant", employeeCode: "ZETA-EMP-4701" }',
      }],
    };

    const friendly = friendlyMigrationRecordError(record);

    expect(friendly.title).toBe("This record already exists");
    expect(friendly.message).toBe('Employee code "ZETA-EMP-4701" is already used by another employee in this workspace.');
    expect(friendly.action).toContain("Merge / Update");
    expect(`${friendly.title} ${friendly.message} ${friendly.action}`).not.toMatch(/E11000|duplicate key|tenantId|collection|index/i);
  });

  it("summarizes important uploaded row fields instead of requiring raw JSON", () => {
    const summary = summarizeMigrationRow({
      entityType: "employee",
      sourceData: {
        "Employee Code": "EMP001",
        "Full Name": "Arjun Menon",
        "Work Email": "arjun@example.com",
        Department: "Engineering",
      },
    });

    expect(summary).toEqual([
      { label: "Employee Code", value: "EMP001" },
      { label: "Full Name", value: "Arjun Menon" },
      { label: "Work Email", value: "arjun@example.com" },
      { label: "Department", value: "Engineering" },
    ]);
  });
});
