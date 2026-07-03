import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import CustomField from "@/models/CustomField";
import { CUSTOM_FIELD_APPLIES_TO } from "@/lib/constants/statuses";

describe("CustomField model", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_custom_field");
    await CustomField.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await CustomField.deleteMany({});
  });

  const base = () => ({
    appliesTo: CUSTOM_FIELD_APPLIES_TO.ACCOUNT,
    label: "Cost Center",
    createdBy: new mongoose.Types.ObjectId(),
  });

  it("defaults fieldType to text, required to false, and status to active", async () => {
    const doc = await CustomField.create({ tenantId: "t1", ...base() });
    expect(doc.fieldType).toBe("text");
    expect(doc.required).toBe(false);
    expect(doc.status).toBe("active");
    expect(doc.options).toEqual([]);
  });

  it("enforces tenant-scoped uniqueness on appliesTo + label", async () => {
    await CustomField.create({ tenantId: "t1", ...base() });
    await expect(CustomField.create({ tenantId: "t1", ...base() })).rejects.toThrow(/E11000/);

    const otherAppliesTo = await CustomField.create({
      tenantId: "t1",
      ...base(),
      appliesTo: CUSTOM_FIELD_APPLIES_TO.JOURNAL,
    });
    expect(otherAppliesTo.appliesTo).toBe("journal");

    const t2 = await CustomField.create({ tenantId: "t2", ...base() });
    expect(t2.label).toBe("Cost Center");
  });

  it("persists dropdown options", async () => {
    const doc = await CustomField.create({
      tenantId: "t1",
      ...base(),
      fieldType: "dropdown",
      options: ["North", "South"],
    });
    expect(doc.options).toEqual(["North", "South"]);
  });

  it("rejects an invalid appliesTo enum value", async () => {
    await expect(
      CustomField.create({ tenantId: "t1", label: "Bad", appliesTo: "not_real", createdBy: new mongoose.Types.ObjectId() }),
    ).rejects.toThrow();
  });
});
