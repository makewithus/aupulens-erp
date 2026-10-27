import { describe, it, expect } from "vitest";
import {
  stripProtectedFields,
  validateObjectId,
  isValidObjectId,
  handleRouteError,
  PROTECTED_SYSTEM_FIELDS,
} from "@/lib/api/validateId";

describe("AUP-003: Mass Assignment & Mutation Security Inventory", () => {
  it("strips protected system fields from update payloads", () => {
    const maliciousPayload = {
      name: "Valid Updated Name",
      description: "Valid Description",
      _id: "650000000000000000000099",
      id: "injected-id",
      tenantId: "foreign-tenant",
      organizationId: "foreign-org",
      createdBy: "attacker-user-id",
      createdAt: new Date(),
      updatedAt: new Date(),
      isOwner: true,
      approvalDetails: { status: "APPROVED", approvedBy: "attacker" },
    };

    const sanitized = stripProtectedFields(maliciousPayload);

    expect(sanitized.name).toBe("Valid Updated Name");
    expect(sanitized.description).toBe("Valid Description");
    expect(sanitized._id).toBeUndefined();
    expect(sanitized.id).toBeUndefined();
    expect(sanitized.tenantId).toBeUndefined();
    expect(sanitized.organizationId).toBeUndefined();
    expect(sanitized.createdBy).toBeUndefined();
    expect(sanitized.isOwner).toBeUndefined();
    expect(sanitized.approvalDetails).toBeUndefined();
  });

  it("strips MongoDB operator injection keys ($set, $unset, $where, etc.)", () => {
    const injectionPayload = {
      status: "ACTIVE",
      $set: { role: "admin", tenantId: "foreign-tenant" },
      $unset: { passwordHash: 1 },
      $where: "function() { return true; }",
    };

    const sanitized = stripProtectedFields(injectionPayload);

    expect(sanitized.status).toBe("ACTIVE");
    expect(sanitized.$set).toBeUndefined();
    expect(sanitized.$unset).toBeUndefined();
    expect(sanitized.$where).toBeUndefined();
  });

  it("strips dotted path injection targeting protected attributes", () => {
    const dottedPayload = {
      title: "Clean Title",
      "tenantId.subdomain": "injected-tenant",
      "createdBy.email": "hacked@example.com",
      "approvalDetails.approved": true,
    };

    const sanitized = stripProtectedFields(dottedPayload);

    expect(sanitized.title).toBe("Clean Title");
    expect(sanitized["tenantId.subdomain"]).toBeUndefined();
    expect(sanitized["createdBy.email"]).toBeUndefined();
    expect(sanitized["approvalDetails.approved"]).toBeUndefined();
  });

  it("allows specifying additional route-specific protected fields", () => {
    const payload = {
      amount: 500,
      notes: "Invoice notes",
      postedStatus: "POSTED",
      glCode: "1000",
    };

    const sanitized = stripProtectedFields(payload, ["postedStatus", "glCode"]);

    expect(sanitized.amount).toBe(500);
    expect(sanitized.notes).toBe("Invoice notes");
    expect(sanitized.postedStatus).toBeUndefined();
    expect(sanitized.glCode).toBeUndefined();
  });

  it("validates MongoDB ObjectIds and rejects malformed strings or operators", () => {
    expect(isValidObjectId("650000000000000000000001")).toBe(true);
    expect(isValidObjectId("12345")).toBe(false);
    expect(isValidObjectId("invalid-object-id")).toBe(false);
    expect(isValidObjectId({ $gt: "" })).toBe(false);
    expect(isValidObjectId(null)).toBe(false);
    expect(isValidObjectId(undefined)).toBe(false);

    const validRes = validateObjectId("650000000000000000000001");
    expect(validRes).toBeNull();

    const invalidRes = validateObjectId("bad-id-123");
    expect(invalidRes?.status).toBe(400);
  });

  it("handles CastError gracefully with HTTP 400 instead of 500 crash", async () => {
    const castError = { name: "CastError", message: "Cast to ObjectId failed for value 'abc'" };
    const res = handleRouteError(castError);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid identifier format");
  });
});
