import { describe, it, expect, vi } from "vitest";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/aupulens_test_api";
import { NextRequest } from "next/server";
import { isValidObjectId, validateObjectId, handleRouteError } from "@/lib/api/validateId";
import { GET as getEmployee } from "@/app/api/hr/employees/[id]/route";
import { GET as getCustomer } from "@/app/api/sales/customers/[id]/route";
import { GET as getProduct } from "@/app/api/sales/products/[id]/route";
import { GET as getLead } from "@/app/api/crm/leads/[id]/route";
import { GET as getBill } from "@/app/api/finance/bills/[id]/route";
import { GET as getJournalEntry } from "@/app/api/finance/journal-entries/[id]/route";

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue({}) }));
vi.mock("@/models/finance/JournalEntry", () => ({
  default: {
    findOne: () => ({
      populate: () => ({
        populate: () => ({
          lean: async () => { throw new Error("synthetic-internal-collection-details"); },
        }),
      }),
    }),
  },
}));
vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: "60d5ec49f1b2c8b1f8e4e1a1", tenantId: "test-tenant", role: "admin" },
  }),
}));

describe("AUP-008: Malformed ID Validation and CastError Handling", () => {
  it("accurately classifies valid and invalid ObjectIds", () => {
    expect(isValidObjectId("60d5ec49f1b2c8b1f8e4e1a1")).toBe(true);
    expect(isValidObjectId("507f1f77bcf86cd799439011")).toBe(true);

    expect(isValidObjectId("invalid-id")).toBe(false);
    expect(isValidObjectId("12345")).toBe(false);
    expect(isValidObjectId("")).toBe(false);
    expect(isValidObjectId(null)).toBe(false);
    expect(isValidObjectId(undefined)).toBe(false);
    expect(isValidObjectId("60d5ec49f1b2c8b1f8e4e1ag")).toBe(false); // non-hex
  });

  it("keeps unexpected dynamic-route exceptions out of client responses", async () => {
    const response = handleRouteError(new Error("synthetic-internal-collection-details"));
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain("synthetic-internal-collection-details");
    expect(body).toContain("INTERNAL_ERROR");
  });

  it("validateObjectId returns HTTP 400 response for invalid IDs", async () => {
    const res = validateObjectId("invalid-id");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);

    const body = await res!.json();
    expect(body.error).toBe("Invalid identifier format");
  });

  it("handleRouteError returns HTTP 400 for CastError and does not expose schema details", async () => {
    const castError = {
      name: "CastError",
      message: 'Cast to ObjectId failed for value "bad-id" at path "_id" for model "Employee"',
    };
    const res = handleRouteError(castError);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid identifier format");
    expect(JSON.stringify(body)).not.toContain("Employee");
    expect(JSON.stringify(body)).not.toContain("Cast to ObjectId");
  });

  it("returns HTTP 400 on dynamic GET endpoints when given a malformed ID", async () => {
    const dummyReq = new NextRequest("http://localhost/api/test");
    const badParams = Promise.resolve({ id: "not-a-valid-id" });

    const empRes = await getEmployee(dummyReq, { params: badParams });
    expect(empRes.status).toBe(400);
    expect((await empRes.json()).error).toBe("Invalid identifier format");

    const custRes = await getCustomer(dummyReq, { params: badParams });
    expect(custRes.status).toBe(400);
    expect((await custRes.json()).error).toBe("Invalid identifier format");

    const prodRes = await getProduct(dummyReq, { params: badParams });
    expect(prodRes.status).toBe(400);
    expect((await prodRes.json()).error).toBe("Invalid identifier format");

    const leadRes = await getLead(dummyReq, { params: badParams });
    expect(leadRes.status).toBe(400);
    expect((await leadRes.json()).error).toBe("Invalid identifier format");

    const billRes = await getBill(dummyReq, { params: badParams });
    expect(billRes.status).toBe(400);
    expect((await billRes.json()).error).toBe("Invalid identifier format");
  });

  it("returns a safe generic error for an unexpected journal database failure", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await getJournalEntry(
        new NextRequest("http://localhost/api/finance/journal-entries/507f1f77bcf86cd799439011"),
        { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) },
      );
      expect(response.status).toBe(500);
      const body = await response.text();
      expect(body).not.toContain("synthetic-internal-collection-details");
      expect(body).toContain("JOURNAL_ENTRY_FETCH_FAILED");
    } finally {
      logError.mockRestore();
    }
  });
});
