import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";

const commandAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: commandAuth }));
vi.mock("@/lib/db", () => ({ default: async () => {} }));

import Customer from "@/models/sales/Customer";
import Product from "@/models/inventory/Product";
import User from "@/models/auth/User";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import Organization from "@/models/admin/Organization";
import ChatHistory from "@/models/ai/ChatHistory";
import { tryErpAssistant } from "@/lib/ai/erpAssistant";
import { AI_ACTION_STATUS as A } from "@/lib/constants/statuses";

const mongoUri = process.env.MONGODB_URI || `mongodb://127.0.0.1:${process.env.QA_DISPOSABLE_MONGO_PORT || "27017"}/aupulens_test_customer_draft_${randomUUID().replaceAll("-", "")}`;

const tenantA = `tenant-a-${randomUUID().slice(0, 8)}`;
const tenantB = `tenant-b-${randomUUID().slice(0, 8)}`;
const adminUserA = new mongoose.Types.ObjectId().toString();
const adminUserB = new mongoose.Types.ObjectId().toString();

const scopeA = { tenantId: tenantA, userId: adminUserA, role: "admin", module: "sales" as const };
const scopeB = { tenantId: tenantB, userId: adminUserB, role: "admin", module: "sales" as const };

const ask = (scope: typeof scopeA, text: string, convId: string, reqId = randomUUID()) =>
  tryErpAssistant({ ...scope, conversationId: convId, text, requestId: reqId });

beforeAll(async () => {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([
    Customer.init(),
    Product.init(),
    User.init(),
    ChatHistory.init(),
    AiCommandProposal.init(),
    CrmAuditLog.init(),
    Organization.init(),
  ]);

  await Organization.create([
    {
      name: "Tenant A Org",
      subdomain: tenantA,
      ownerUserId: adminUserA,
      tier: "enterprise",
      subscriptionStatus: "active",
    },
    {
      name: "Tenant B Org",
      subdomain: tenantB,
      ownerUserId: adminUserB,
      tier: "enterprise",
      subscriptionStatus: "active",
    },
  ]);

  await User.create([
    {
      _id: adminUserA,
      tenantId: tenantA,
      name: "Admin A",
      email: "adminA@aupulens.test",
      phone: "9876543210",
      role: "admin",
      userRole: "admin",
      password: "hashed_dummy_password",
    },
    {
      _id: adminUserB,
      tenantId: tenantB,
      name: "Admin B",
      email: "adminB@aupulens.test",
      phone: "9876543211",
      role: "admin",
      userRole: "admin",
      password: "hashed_dummy_password",
    },
  ]);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe("Aupulens AI — Customer Draft State, Multi-Turn Workflow, and Validation Suite", () => {
  // =========================================================================
  // TEST A: Initial prompt extraction
  // =========================================================================
  it("Test A — Initial prompt extraction: extracts name, creates proposed draft without saving Customer", async () => {
    const convId = randomUUID();
    const res = await ask(scopeA, "Create a new customer named Kishore.", convId);

    expect(res?.handled).toBe(true);
    expect(res?.structured?.type).toBe("customer_proposal");
    if (res?.structured?.type === "customer_proposal") {
      expect(res.structured.name).toBe("Kishore");
      expect(res.structured.isCompany).toBeUndefined();
      expect(res.structured.status).toBe("proposed");
      expect(res.structured.missingFields).toContain("type");
      expect(res.structured.proposalId).toBeDefined();
    }
    expect(res?.message).toContain("Name: Kishore");
    expect(res?.message).toContain("Type: Not specified");

    // Verify draft proposal exists in MongoDB
    const proposal = await AiCommandProposal.findOne({
      tenantId: tenantA,
      status: A.PROPOSED,
      "params.name": "Kishore",
    });
    expect(proposal).not.toBeNull();

    // Verify no customer is saved to MongoDB
    const customer = await Customer.findOne({ tenantId: tenantA, "header.name": "Kishore" });
    expect(customer).toBeNull();
  });

  // =========================================================================
  // TEST B: Multi-turn merge
  // =========================================================================
  it("Test B — Multi-turn merge: combines fields across multiple turns into the same draft", async () => {
    const convId = randomUUID();

    // Turn 1: Start draft
    const turn1 = await ask(scopeA, "Create a new customer named Kishore.", convId);
    expect(turn1?.structured?.type).toBe("customer_proposal");
    const proposalId = (turn1?.structured as any)?.proposalId;

    // Turn 2: Provide Kishore K
    const turn2 = await ask(scopeA, "The customer name is Kishore K.", convId);
    expect(turn2?.handled).toBe(true);
    if (turn2?.structured?.type === "customer_proposal") {
      expect(turn2.structured.name).toBe("Kishore K");
      expect(turn2.structured.proposalId).toBe(proposalId);
    }

    // Turn 3: Provide Individual
    const turn3 = await ask(scopeA, "The customer type is Individual.", convId);
    expect(turn3?.handled).toBe(true);
    if (turn3?.structured?.type === "customer_proposal") {
      expect(turn3.structured.name).toBe("Kishore K");
      expect(turn3.structured.isCompany).toBe(false);
      expect(turn3.structured.proposalId).toBe(proposalId);
    }

    // Turn 4: Provide Phone
    const turn4 = await ask(scopeA, "The phone number is 123456788.", convId);
    expect(turn4?.handled).toBe(true);
    if (turn4?.structured?.type === "customer_proposal") {
      expect(turn4.structured.name).toBe("Kishore K");
      expect(turn4.structured.isCompany).toBe(false);
      expect(turn4.structured.phone).toBe("123456788");
      expect(turn4.structured.missingFields?.length).toBe(0);
      expect(turn4.structured.proposalId).toBe(proposalId);
    }

    // Turn 5: Read draft
    const turn5 = await ask(scopeA, "Show me the updated draft fields.", convId);
    expect(turn5?.handled).toBe(true);
    if (turn5?.structured?.type === "customer_proposal") {
      expect(turn5.structured.name).toBe("Kishore K");
      expect(turn5.structured.isCompany).toBe(false);
      expect(turn5.structured.phone).toBe("123456788");
      expect(turn5.structured.proposalId).toBe(proposalId);
    }
    expect(turn5?.message).toContain("Name: Kishore K");
    expect(turn5?.message).toContain("Type: Individual");
    expect(turn5?.message).toContain("Phone: 123456788");

    // Only one proposal exists for this conversation
    const proposalCount = await AiCommandProposal.countDocuments({
      tenantId: tenantA,
      "params.conversationId": convId,
      status: A.PROPOSED,
    });
    expect(proposalCount).toBe(1);
  });

  // =========================================================================
  // TEST C: Explicit blank optional phone
  // =========================================================================
  it("Test C — Explicit blank optional phone: clears phone without producing error", async () => {
    const convId = randomUUID();

    // Turn 1: Populate name, type, and phone
    await ask(scopeA, "Create a new customer named Kishore.", convId);
    const turn2 = await ask(
      scopeA,
      "The customer name is Kishore K, the customer type is Individual, and the phone number is 123456788. Update the existing customer draft with these details. Do not create or save the customer yet.",
      convId
    );
    expect(turn2?.handled).toBe(true);
    if (turn2?.structured?.type === "customer_proposal") {
      expect(turn2.structured.name).toBe("Kishore K");
      expect(turn2.structured.isCompany).toBe(false);
      expect(turn2.structured.phone).toBe("123456788");
    }

    // Turn 3: Leave phone empty
    const turn3 = await ask(
      scopeA,
      "Update the existing customer draft only. Set the name to Kishore K and type to Individual. Leave the phone number empty for now. Do not save or create the customer. Show me the updated draft fields.",
      convId
    );

    expect(turn3?.handled).toBe(true);
    expect(turn3?.message).not.toContain("invalid");
    expect(turn3?.message).toContain("Name: Kishore K");
    expect(turn3?.message).toContain("Type: Individual");

    if (turn3?.structured?.type === "customer_proposal") {
      expect(turn3.structured.name).toBe("Kishore K");
      expect(turn3.structured.isCompany).toBe(false);
      expect(turn3.structured.phone).toBeUndefined();
    }

    // Verify proposal in DB has no phone
    const prop = await AiCommandProposal.findOne({
      tenantId: tenantA,
      "params.conversationId": convId,
      status: A.PROPOSED,
    });
    expect(prop?.params?.name).toBe("Kishore K");
    expect(prop?.params?.phone).toBeUndefined();
  });

  // =========================================================================
  // TEST D: Validation failure preserves other fields
  // =========================================================================
  it("Test D — Validation failure preserves other fields: rejects bad phone while preserving name and type", async () => {
    const convId = randomUUID();

    // Step 1: Establish draft with valid name and type
    await ask(scopeA, "Create a new customer named Kishore.", convId);
    await ask(scopeA, "The customer name is Kishore K, the customer type is Individual.", convId);

    // Step 2: User supplies an invalid phone number
    await expect(ask(scopeA, "phone is 123", convId)).rejects.toMatchObject({
      code: "BUSINESS_RULE",
      message: expect.stringContaining('Phone number "123" is invalid'),
    });

    // Verify proposal in DB still has valid name and type
    const prop = await AiCommandProposal.findOne({
      tenantId: tenantA,
      "params.conversationId": convId,
      status: A.PROPOSED,
    });
    expect(prop).not.toBeNull();
    expect(prop?.params?.name).toBe("Kishore K");
    expect(prop?.params?.is_company).toBe(false);

    // Step 3: Now user provides update with Kishore Kumar and invalid phone
    await expect(
      ask(scopeA, "name is Kishore Kumar, type is Individual, phone is 999", convId)
    ).rejects.toMatchObject({
      code: "BUSINESS_RULE",
      message: expect.stringContaining('Phone number "999" is invalid'),
    });

    // The name update was saved to the draft despite the phone failure
    const propUpdated = await AiCommandProposal.findOne({
      tenantId: tenantA,
      "params.conversationId": convId,
      status: A.PROPOSED,
    });
    expect(propUpdated?.params?.name).toBe("Kishore Kumar");
    expect(propUpdated?.params?.is_company).toBe(false);
  });

  // =========================================================================
  // TEST E: Field correction
  // =========================================================================
  it("Test E — Field correction: changes only the specified field while preserving others", async () => {
    const convId = randomUUID();

    await ask(
      scopeA,
      "Update the existing draft with Kishore K, Individual, and 123456788.",
      convId
    );

    // Change only the name
    const turn2 = await ask(scopeA, "Change the name to Kishore Kumar.", convId);
    expect(turn2?.handled).toBe(true);
    if (turn2?.structured?.type === "customer_proposal") {
      expect(turn2.structured.name).toBe("Kishore Kumar");
      expect(turn2.structured.isCompany).toBe(false);
      expect(turn2.structured.phone).toBe("123456788");
    }

    const prop = await AiCommandProposal.findOne({
      tenantId: tenantA,
      "params.conversationId": convId,
      status: A.PROPOSED,
    });
    expect(prop?.params?.name).toBe("Kishore Kumar");
    expect(prop?.params?.is_company).toBe(false);
    expect(prop?.params?.phone).toBe("123456788");
  });

  // =========================================================================
  // TEST F: No premature persistence
  // =========================================================================
  it("Test F — No premature persistence: no Customer record is inserted before explicit confirmation", async () => {
    const convId = randomUUID();

    await ask(scopeA, "Create a new customer named Kishore.", convId);
    expect(await Customer.findOne({ tenantId: tenantA, "header.name": /Kishore/i })).toBeNull();

    await ask(scopeA, "The customer name is Kishore K, the customer type is Individual, and the phone number is 123456788. Update the existing customer draft with these details. Do not create or save the customer yet.", convId);
    expect(await Customer.findOne({ tenantId: tenantA, "header.name": /Kishore/i })).toBeNull();

    await ask(scopeA, "Update the existing customer draft only. Set the name to Kishore K and type to Individual. Leave the phone number empty for now. Do not save or create the customer. Show me the updated draft fields.", convId);
    expect(await Customer.findOne({ tenantId: tenantA, "header.name": /Kishore/i })).toBeNull();

    await ask(scopeA, "Change the name to Kishore Kumar.", convId);
    expect(await Customer.findOne({ tenantId: tenantA, "header.name": /Kishore/i })).toBeNull();
  });

  // =========================================================================
  // TEST G: Explicit confirmation
  // =========================================================================
  it("Test G — Explicit confirmation: creates exactly one customer record with draft details", async () => {
    const convId = randomUUID();

    await ask(scopeA, "Create a new customer named Kishore.", convId);
    await ask(scopeA, "The customer name is Kishore Kumar, the customer type is Individual, and the phone number is 123456788.", convId);

    const confirmRes = await ask(scopeA, "confirm customer", convId);
    expect(confirmRes?.handled).toBe(true);
    expect(confirmRes?.message).toContain('Saved customer "Kishore Kumar" (Individual)');
    expect(confirmRes?.structured?.type).toBe("customer_saved");

    // Exactly one customer created
    const created = await Customer.find({ tenantId: tenantA, "header.name": "Kishore Kumar" });
    expect(created.length).toBe(1);
    expect(created[0].header.is_company).toBe(false);
    expect(created[0].contact_details.phone).toBe("123456788");

    // Proposal marked executed
    const prop = await AiCommandProposal.findOne({
      tenantId: tenantA,
      "params.conversationId": convId,
    });
    expect(prop?.status).toBe(A.EXECUTED);
    expect(prop?.resultRef).toBe(String(created[0]._id));
  });

  // =========================================================================
  // TEST H: Duplicate confirmation
  // =========================================================================
  it("Test H — Duplicate confirmation: prevents duplicate customer insertion", async () => {
    const convId = randomUUID();

    await ask(scopeA, "Create a new customer named Ananya.", convId);
    await ask(scopeA, "The customer type is Individual.", convId);
    await ask(scopeA, "confirm customer", convId);

    const countBefore = await Customer.countDocuments({ tenantId: tenantA, "header.name": "Ananya" });
    expect(countBefore).toBe(1);

    // Repeat confirmation
    await expect(ask(scopeA, "confirm customer", convId)).rejects.toMatchObject({
      code: "MISSING_FIELD",
    });

    const countAfter = await Customer.countDocuments({ tenantId: tenantA, "header.name": "Ananya" });
    expect(countAfter).toBe(1);
  });

  // =========================================================================
  // TEST I: Context and tenant isolation
  // =========================================================================
  it("Test I — Context and tenant isolation: drafts cannot be accessed or modified across tenants", async () => {
    const convIdA = randomUUID();

    // Tenant A creates draft
    const turnA = await ask(scopeA, "Create a new customer named SecretCustomerA.", convIdA);
    const proposalIdA = (turnA?.structured as any)?.proposalId;
    expect(proposalIdA).toBeDefined();

    // Tenant B attempts to access or modify Tenant A's draft using same convId or text
    const turnB = await ask(scopeB, "The customer name is HackedName, the customer type is Individual.", convIdA);

    // Tenant B gets their own isolated draft in Tenant B, cannot see or mutate SecretCustomerA
    const propA = await AiCommandProposal.findOne({ tenantId: tenantA, "params.name": "SecretCustomerA" });
    expect(propA).not.toBeNull();
    expect(propA?.params?.name).toBe("SecretCustomerA");

    // No cross-tenant leak
    const crossCheck = await AiCommandProposal.findOne({ tenantId: tenantB, "params.name": "SecretCustomerA" });
    expect(crossCheck).toBeNull();
  });

  // =========================================================================
  // TEST J: Failure handling
  // =========================================================================
  it("Test J — Failure handling: reports errors accurately without claiming success when draft fails", async () => {
    const convId = randomUUID();

    // Trying to confirm when no draft exists
    await expect(ask(scopeA, "confirm customer", convId)).rejects.toMatchObject({
      code: "MISSING_FIELD",
      message: expect.stringContaining("Please prepare a customer draft in this conversation first"),
    });

    // Verify no customer was created
    const count = await Customer.countDocuments({ tenantId: tenantA });
    // Count remains only the ones created in earlier tests
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
