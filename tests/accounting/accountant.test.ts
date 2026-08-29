import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import Accountant from "@/models/finance/Accountant";

describe("Accountant model (global, non-tenant-scoped directory)", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_accountant");
    await Accountant.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Accountant.deleteMany({});
  });

  const base = () => ({
    name: "Vinod Kumar",
    firmName: "SNV & Associates",
    country: "India",
    state: "Kerala",
    phone: "8589955544",
    email: "vinod@example.com",
  });

  it("does not require tenantId — a shared directory visible to every tenant", async () => {
    const doc = await Accountant.create(base());
    expect(doc.tenantId).toBeUndefined();
  });

  it("requires name, firmName, country, state, phone, and email", async () => {
    await expect(Accountant.create({ name: "Missing Fields" })).rejects.toThrow();
  });

  it("filters by country and state without tenant scoping", async () => {
    await Accountant.create(base());
    await Accountant.create({ ...base(), name: "Other Accountant", state: "Tamil Nadu" });

    const keralaOnly = await Accountant.find({ country: "India", state: "Kerala" });
    expect(keralaOnly).toHaveLength(1);
    expect(keralaOnly[0].name).toBe("Vinod Kumar");
  });

  it("is visible across tenants when a tenantId happens to be set", async () => {
    await Accountant.create({ ...base(), tenantId: "t1" });
    const all = await Accountant.find({});
    expect(all).toHaveLength(1);
    // Reading without a tenantId filter (as the route does) still returns it.
    const unscoped = await Accountant.find({ country: "India" });
    expect(unscoped).toHaveLength(1);
  });
});
