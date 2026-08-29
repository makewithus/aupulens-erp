import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import TaxRate from "@/models/finance/TaxRate";
import { TAX_RATE_TYPE } from "@/lib/constants/statuses";

describe("TaxRate model", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_tax_rate");
    await TaxRate.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await TaxRate.deleteMany({});
  });

  const base = () => ({
    name: "GST 18%",
    type: TAX_RATE_TYPE.GST,
    ratePercent: 18,
    appliesTo: "both" as const,
    createdBy: new mongoose.Types.ObjectId(),
  });

  it("defaults type to gst, appliesTo to both, and status to active", async () => {
    const doc = await TaxRate.create({
      tenantId: "t1",
      name: "Default Rate",
      ratePercent: 5,
      createdBy: new mongoose.Types.ObjectId(),
    });
    expect(doc.type).toBe("gst");
    expect(doc.appliesTo).toBe("both");
    expect(doc.status).toBe("active");
  });

  it("enforces tenant-scoped uniqueness on type + name", async () => {
    await TaxRate.create({ tenantId: "t1", ...base() });
    await expect(TaxRate.create({ tenantId: "t1", ...base() })).rejects.toThrow(/E11000/);

    const otherType = await TaxRate.create({ tenantId: "t1", ...base(), type: TAX_RATE_TYPE.CESS });
    expect(otherType.type).toBe("cess");

    const t2 = await TaxRate.create({ tenantId: "t2", ...base() });
    expect(t2.name).toBe("GST 18%");
  });

  it("rejects an invalid type enum value", async () => {
    await expect(
      TaxRate.create({ tenantId: "t1", ...base(), type: "not_real" }),
    ).rejects.toThrow();
  });

  it("requires createdBy", async () => {
    await expect(
      TaxRate.create({ tenantId: "t1", name: "No Creator", ratePercent: 10 }),
    ).rejects.toThrow();
  });
});
