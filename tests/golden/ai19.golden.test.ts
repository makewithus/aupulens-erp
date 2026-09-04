import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai19golden";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import Employee from "@/models/hr/Employee";
import InventoryItem from "@/models/inventory/InventoryItem";
import BankAccount from "@/models/finance/BankAccount";
import AiHold from "@/models/ai/AiHold";
import AiMasterDataProfile from "@/models/ai/AiMasterDataProfile";
import AiMasterDataSnapshot from "@/models/ai/AiMasterDataSnapshot";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { AI19_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, type Ai19GoldenCase } from "@/tests/golden/ai19/goldenCases";

/**
 * The golden-dataset CI check for AI-19 (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3). Unlike a
 * normal test (proves the code does what it did yesterday), this reports a PASS RATE across a
 * named case set and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a
 * behaviour change altered outcomes, which a per-assertion test can miss if it only checks the
 * cases it happens to include.
 */

// All five of AI-19's checks are deterministic string/set comparisons — no LLM call anywhere in
// this workflow (proven by the source-grep test in the unit suite). 100% is therefore the only
// honest bar, same reasoning as AI-27/AI-14/AI-16's golden datasets.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai19MasterData: typeof import("@/lib/aiRuntime/workflows/ai-19-master-data").ai19MasterData;

async function makeVendorWithBill(tenantId: string, name: string, opts: { gstin?: string; email?: string; hasAddress?: boolean; hasDefaultAccount?: boolean } = {}) {
  const vendor = await Customer.create({
    tenantId,
    header: { name, is_company: true },
    gstin: opts.gstin,
    contact_details: opts.email ? { email: opts.email } : undefined,
    address_tab: opts.hasAddress ? { type: "contact", street: "1 Golden Street", city: "Goldentown" } : undefined,
    accounting_tab: opts.hasDefaultAccount ? { property_account_payable_id: new mongoose.Types.ObjectId() } : undefined,
    createdBy: GOLDEN_CREATOR,
  });
  await Invoice.create({
    tenantId,
    name: `GOLDEN-BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId: vendor._id,
    moveType: "in_invoice",
    state: "posted",
    invoiceDate: new Date("2026-01-05"),
    dueDate: new Date("2026-01-05"),
    invoiceLines: [{ name: "Goods", priceSubtotal: 1000, quantity: 1, priceUnit: 1000 }],
    amountUntaxed: 1000,
    amountTax: 0,
    amountTotal: 1000,
    amountResidual: 1000,
    paymentState: "not_paid",
  });
  return vendor._id as mongoose.Types.ObjectId;
}

async function makeEmployee(tenantId: string, firstName: string, lastName: string, email: string, bankName?: string, accountNumber?: string) {
  const emp = await Employee.create({
    tenantId,
    firstName,
    lastName,
    email,
    employeeCode: `GOLDEN-EMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    phone: "9999999999",
    dateOfJoining: new Date("2020-01-01"),
    status: "active",
    bankDetails: bankName ? { bankName, accountNumber, ifscCode: "HDFC0000001" } : undefined,
  });
  return emp._id as mongoose.Types.ObjectId;
}

async function makeItem(tenantId: string, name: string, itemCode: string) {
  return InventoryItem.create({
    tenantId,
    itemCode,
    name,
    category: "Golden Category",
    unit: "pcs",
    quantity: 10,
    reorderLevel: 1,
    reorderQuantity: 1,
    unitCost: 100,
    totalValue: 1000,
    warehouse: "Golden Warehouse",
    createdBy: GOLDEN_CREATOR,
  });
}

async function seedAndRun(tenantId: string, goldenCase: Ai19GoldenCase) {
  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-19", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

  switch (goldenCase.checkType) {
    case "duplicate_vendor": {
      for (const v of goldenCase.vendors) await makeVendorWithBill(tenantId, v.name, { gstin: v.gstin });
      const envelope = await runWorkflow(ai19MasterData, { tenantId, eventKey: "period.horizon.reached", payload: {} });
      const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
      const proposal = trace!.rawProposal as unknown as { duplicates: { classification: string }[] };
      return { envelope, proposal };
    }
    case "duplicate_item": {
      for (const it of goldenCase.items) await makeItem(tenantId, it.name, it.itemCode);
      const envelope = await runWorkflow(ai19MasterData, { tenantId, eventKey: "period.horizon.reached", payload: {} });
      const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
      const proposal = trace!.rawProposal as unknown as { duplicates: { classification: string }[] };
      return { envelope, proposal };
    }
    case "missing_fields": {
      const vendorId = await makeVendorWithBill(tenantId, goldenCase.vendor.name, { hasAddress: goldenCase.vendor.hasAddress, hasDefaultAccount: goldenCase.vendor.hasDefaultAccount });
      const envelope = await runWorkflow(ai19MasterData, { tenantId, eventKey: "period.horizon.reached", payload: {} });
      const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
      const proposal = trace!.rawProposal as unknown as { missingFields: { recordId: string; missing: string[] }[] };
      return { envelope, proposal, vendorId: String(vendorId) };
    }
    case "employee_collision": {
      await makeEmployee(tenantId, goldenCase.employee.firstName, goldenCase.employee.lastName, goldenCase.employee.email);
      await makeVendorWithBill(tenantId, goldenCase.vendor.name, { email: goldenCase.vendor.sameEmailAsEmployee ? goldenCase.employee.email : undefined });
      const envelope = await runWorkflow(ai19MasterData, { tenantId, eventKey: "period.horizon.reached", payload: {} });
      const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
      const proposal = trace!.rawProposal as unknown as { employeeCollisions: unknown[] };
      return { envelope, proposal };
    }
    case "bank_change_hold": {
      const empId = await makeEmployee(tenantId, goldenCase.employee.firstName, goldenCase.employee.lastName, goldenCase.employee.email, goldenCase.employee.bankName, goldenCase.employee.accountNumber);
      // First run establishes the baseline snapshot — no alert yet (nothing to compare against).
      await runWorkflow(ai19MasterData, { tenantId, eventKey: "master_data.changed", payload: { model: "Employee", id: String(empId) } });
      if (goldenCase.changedAccountNumber) {
        await Employee.updateOne({ _id: empId }, { $set: { "bankDetails.accountNumber": goldenCase.changedAccountNumber } });
      }
      const envelope = await runWorkflow(ai19MasterData, { tenantId, eventKey: "master_data.changed", payload: { model: "Employee", id: String(empId) } });
      const hold = await AiHold.findOne({ tenantId, "subjectRef.model": "Employee", "subjectRef.id": String(empId) }).lean();
      return { envelope, hold };
    }
  }
}

describe("AI-19 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), Employee.init(), InventoryItem.init(), BankAccount.init(), AiHold.init(), AiMasterDataProfile.init(), AiMasterDataSnapshot.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai19MasterData } = await import("@/lib/aiRuntime/workflows/ai-19-master-data"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI19_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; detail: unknown }[] = [];

    for (const goldenCase of AI19_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      let passed = false;
      let detail: unknown;

      if (goldenCase.checkType === "duplicate_vendor") {
        const { proposal } = (await seedAndRun(tenantId, goldenCase)) as { proposal: { duplicates: { classification: string }[] } };
        passed = proposal.duplicates.length === goldenCase.expected.duplicateFindingCount;
        if (passed && goldenCase.expected.classification) passed = proposal.duplicates.some((d) => d.classification === goldenCase.expected.classification);
        detail = { duplicates: proposal.duplicates };
      } else if (goldenCase.checkType === "duplicate_item") {
        const { proposal } = (await seedAndRun(tenantId, goldenCase)) as { proposal: { duplicates: { classification: string }[] } };
        passed = proposal.duplicates.length === goldenCase.expected.duplicateCount;
        detail = { duplicates: proposal.duplicates };
      } else if (goldenCase.checkType === "missing_fields") {
        const { proposal, vendorId } = (await seedAndRun(tenantId, goldenCase)) as { proposal: { missingFields: { recordId: string; missing: string[] }[] }; vendorId: string };
        const row = proposal.missingFields.find((m) => m.recordId === vendorId);
        const rowCount = row ? 1 : 0;
        passed = rowCount === goldenCase.expected.missingFieldsCount;
        if (passed && goldenCase.expected.missingContains.length > 0) {
          passed = passed && JSON.stringify([...(row?.missing ?? [])].sort()) === JSON.stringify([...goldenCase.expected.missingContains].sort());
        }
        detail = { row };
      } else if (goldenCase.checkType === "employee_collision") {
        const { envelope } = (await seedAndRun(tenantId, goldenCase)) as { envelope: { findings: { title: string }[] } };
        const collisionFindings = envelope.findings.filter((f) => f.title.includes("matches an employee"));
        passed = collisionFindings.length === goldenCase.expected.collisionFindingCount;
        detail = { collisionFindings };
      } else {
        const { envelope, hold } = (await seedAndRun(tenantId, goldenCase)) as { envelope: { findings: { title: string }[] }; hold: unknown };
        const alertFindings = envelope.findings.filter((f) => f.title.includes("Bank detail changed"));
        passed = alertFindings.length === goldenCase.expected.alertFindingCount && Boolean(hold) === goldenCase.expected.holdPlaced;
        detail = { alertFindings, holdPlaced: Boolean(hold) };
      }

      results.push({ id: goldenCase.id, passed, detail });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-19 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});
