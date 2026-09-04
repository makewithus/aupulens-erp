import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai19";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import Employee from "@/models/hr/Employee";
import BankAccount from "@/models/finance/BankAccount";
import AiHold from "@/models/ai/AiHold";
import AiMasterDataProfile from "@/models/ai/AiMasterDataProfile";
import AiMasterDataSnapshot from "@/models/ai/AiMasterDataSnapshot";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai19MasterData: typeof import("@/lib/aiRuntime/workflows/ai-19-master-data").ai19MasterData;
let findDuplicateEntities: typeof import("@/lib/aiRuntime/masterData/duplicates").findDuplicateEntities;
let getTool: typeof import("@/lib/aiRuntime/tools/registry").getTool;

const TENANT = "ai19-tenant";

async function makeVendorWithBill(name: string, gstin?: string) {
  const vendor = await Customer.create({ tenantId: TENANT, header: { name, is_company: true }, gstin, createdBy: new mongoose.Types.ObjectId() });
  await Invoice.create({
    tenantId: TENANT, name: `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, partnerId: vendor._id, moveType: "in_invoice", state: "posted",
    invoiceDate: new Date("2026-01-05"), dueDate: new Date("2026-01-05"),
    invoiceLines: [{ name: "Goods", priceSubtotal: 1000, quantity: 1, priceUnit: 1000 }],
    amountUntaxed: 1000, amountTax: 0, amountTotal: 1000, amountResidual: 1000, paymentState: "not_paid",
  });
  return vendor._id as mongoose.Types.ObjectId;
}

async function makeEmployee(firstName: string, lastName: string, email: string, bankName?: string, accountNumber?: string) {
  const emp = await Employee.create({
    tenantId: TENANT, firstName, lastName, email, employeeCode: `EMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    phone: "9999999999", dateOfJoining: new Date("2020-01-01"), status: "active",
    bankDetails: bankName ? { bankName, accountNumber, ifscCode: "HDFC0000001" } : undefined,
  });
  return emp._id as mongoose.Types.ObjectId;
}

describe("AI-19 — Master-data intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), Employee.init(), BankAccount.init(), AiHold.init(), AiMasterDataProfile.init(), AiMasterDataSnapshot.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai19MasterData } = await import("@/lib/aiRuntime/workflows/ai-19-master-data"));
    ({ findDuplicateEntities } = await import("@/lib/aiRuntime/masterData/duplicates"));
    ({ getTool } = await import("@/lib/aiRuntime/tools/registry"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Customer.deleteMany({}), Invoice.deleteMany({}), Employee.deleteMany({}), BankAccount.deleteMany({}), AiHold.deleteMany({}),
      AiMasterDataProfile.deleteMany({}), AiMasterDataSnapshot.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  it("two vendors differing by Ltd/Limited with the same tax ID → duplicate raised, no merge performed", async () => {
    await makeVendorWithBill("Acme Trading Pvt Ltd", "29ABCDE1234F1Z5");
    await makeVendorWithBill("Acme Trading Pvt Limited", "29ABCDE1234F1Z5");

    const pairs = await findDuplicateEntities(TENANT, "vendor");
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0].classification).toBe("certain");
    const customersBefore = await Customer.countDocuments({ tenantId: TENANT });
    expect(customersBefore).toBe(2); // still two separate records — never merged
  });

  it("a bank-detail change on an Employee raises CRITICAL and places a hold; the AI cannot lift it at any autonomy level", async () => {
    const empId = await makeEmployee("Jane", "Doe", `jane-${Date.now()}@x.com`, "HDFC Bank", "111122223333");
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-19", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    // First snapshot — establishes the baseline, no alert yet (nothing to compare against).
    await runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "master_data.changed", payload: { model: "Employee", id: String(empId) } });

    // Change the bank account number — this is the real change event.
    await Employee.updateOne({ _id: empId }, { $set: { "bankDetails.accountNumber": "999988887777" } });
    const envelope = await runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "master_data.changed", payload: { model: "Employee", id: String(empId) } });

    const finding = envelope.findings.find((f) => f.title.includes("Bank detail changed"));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("critical");

    const hold = await AiHold.findOne({ tenantId: TENANT, "subjectRef.model": "Employee", "subjectRef.id": String(empId) }).lean();
    expect(hold).toBeDefined();
    expect(hold!.status).toBe("open");

    expect(getTool("release_hold")).toBeUndefined();
  });

  it("bank details are masked everywhere including the decision trace", async () => {
    const empId = await makeEmployee("Mask", "Test", `mask-${Date.now()}@x.com`, "ICICI Bank", "555566667777");
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-19", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    await runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "master_data.changed", payload: { model: "Employee", id: String(empId) } });

    const snapshot = await AiMasterDataSnapshot.findOne({ tenantId: TENANT, entityModel: "Employee", recordId: String(empId) }).lean();
    expect(snapshot).toBeDefined();
    expect(snapshot!.fields.accountNumber).not.toContain("555566667777");
    expect(snapshot!.fields.accountNumber).toMatch(/^\*+7777$/);

    await Employee.updateOne({ _id: empId }, { $set: { "bankDetails.accountNumber": "444433332222" } });
    const envelope = await runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "master_data.changed", payload: { model: "Employee", id: String(empId) } });
    const finding = envelope.findings.find((f) => f.title.includes("Bank detail changed"))!;
    expect(finding.detail).not.toContain("555566667777");
    expect(finding.detail).not.toContain("444433332222");

    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const traceJson = JSON.stringify(trace);
    expect(traceJson).not.toContain("555566667777");
    expect(traceJson).not.toContain("444433332222");
  });

  it("a vendor record matching an employee's name/email raises an employee collision", async () => {
    const email = `shared-${Date.now()}@x.com`;
    await makeEmployee("Conflict", "Person", email);
    const vendorId = await makeVendorWithBill("Conflict Person Trading Co");
    await Customer.updateOne({ _id: vendorId }, { $set: { "contact_details.email": email } });

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-19", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    const envelope = await runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: {} });
    const finding = envelope.findings.find((f) => f.title.includes("matches an employee"));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("high");
  });

  it("expiring-document detection is honestly declared not_implemented, not guessed", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-19", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    const envelope = await runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { checksNotImplemented: { what: string; reason: string }[] };
    expect(proposal.checksNotImplemented.some((c) => c.what === "expiring_documents")).toBe(true);
  });

  it("a clean, complete, stable vendor master produces zero findings (false positive check)", async () => {
    await makeVendorWithBill("Solo Vendor Co", "29ZZZZZ9999Z1Z1");
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-19", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runWorkflow(ai19MasterData, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: {} });
    expect(envelope.findings).toEqual([]);
  });

  it("no path in AI-19's own code ever writes to Vendor/Customer/Employee/Product/InventoryItem (source-grep)", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-19-master-data lib/aiRuntime/masterData lib/aiRuntime/tools/masterDataTools.ts || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    const forbiddenWrites = output
      .split("\n")
      .filter((line) => line.trim())
      .filter((line) => !/AiHold|AiMasterDataProfile|AiMasterDataSnapshot/.test(line));
    expect(forbiddenWrites).toEqual([]);
  });
});
