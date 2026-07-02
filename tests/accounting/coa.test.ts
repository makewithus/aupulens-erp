import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import AccountType from "@/models/AccountType";
import Account from "@/models/Account";

describe("Chart of Accounts Models", () => {
  beforeAll(async () => {
    const uri = "mongodb://localhost:27017/aupulens_test_coa";
    await mongoose.connect(uri);
    await AccountType.init();
    await Account.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AccountType.deleteMany({});
    await Account.deleteMany({});
  });

  it("enforces tenant isolation and compound uniqueness on AccountType", async () => {
    const userId = new mongoose.Types.ObjectId();
    await AccountType.create({
      tenantId: "t1",
      name: "Cash",
      segment: "Asset",
      createdBy: userId,
    });

    // Should fail with same name and tenant
    await expect(AccountType.create({
      tenantId: "t1",
      name: "Cash",
      segment: "Asset",
      createdBy: userId,
    })).rejects.toThrow(/E11000/);

    // Should succeed with different tenant
    const t2 = await AccountType.create({
      tenantId: "t2",
      name: "Cash",
      segment: "Asset",
      createdBy: userId,
    });
    expect(t2.name).toBe("Cash");
  });

  it("enforces tenant isolation and compound uniqueness on Account", async () => {
    const userId = new mongoose.Types.ObjectId();
    const typeId = new mongoose.Types.ObjectId();
    
    await Account.create({
      tenantId: "t1",
      accountName: "Bank A",
      accountCode: "1001",
      accountType: typeId,
      createdBy: userId,
    });

    // Should fail with same name and tenant
    await expect(Account.create({
      tenantId: "t1",
      accountName: "Bank A",
      accountCode: "1002",
      accountType: typeId,
      createdBy: userId,
    })).rejects.toThrow(/E11000/);

    // Should fail with same code and tenant
    await expect(Account.create({
      tenantId: "t1",
      accountName: "Bank B",
      accountCode: "1001",
      accountType: typeId,
      createdBy: userId,
    })).rejects.toThrow(/E11000/);

    // Should succeed with different tenant
    const t2 = await Account.create({
      tenantId: "t2",
      accountName: "Bank A",
      accountCode: "1001",
      accountType: typeId,
      createdBy: userId,
    });
    expect(t2.accountName).toBe("Bank A");
  });
});
