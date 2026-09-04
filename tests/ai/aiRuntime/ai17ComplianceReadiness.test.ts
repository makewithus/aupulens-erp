import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai17";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import Account from "@/models/finance/Account";
import TaxRate from "@/models/finance/TaxRate";
import JournalEntry from "@/models/finance/JournalEntry";
import User from "@/models/auth/User";
import AiTaxTransaction from "@/models/ai/AiTaxTransaction";
import AiComplianceProfile from "@/models/ai/AiComplianceProfile";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiCloseState from "@/models/ai/AiCloseState";
import PeriodClosing from "@/models/finance/PeriodClosing";
import BankStatement from "@/models/finance/BankStatement";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai17ComplianceReadiness: typeof import("@/lib/aiRuntime/workflows/ai-17-compliance-readiness").ai17ComplianceReadiness;
let computeComplianceReadiness: typeof import("@/lib/aiRuntime/compliance/computeReadiness").computeComplianceReadiness;
let computeCloseReadiness: typeof import("@/lib/aiRuntime/closeReadiness/compute").computeCloseReadiness;
let rebuildTaxProjection: typeof import("@/lib/aiRuntime/tax/rebuildTaxProjection").rebuildTaxProjection;

const TENANT = "ai17-tenant";
const PERIOD = "2026-01";
const PERIOD_END = new Date("2026-01-31T23:59:59.999Z");

async function makeCustomer(gstin?: string) {
  const c = await Customer.create({ tenantId: TENANT, header: { name: "Acme Co", is_company: true }, gstin, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}

async function makeInvoice(opts: { moveType: "in_invoice" | "out_invoice"; partnerId: mongoose.Types.ObjectId; amountUntaxed: number; amountTax: number; invoiceDate: Date }) {
  return Invoice.create({
    tenantId: TENANT,
    name: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    partnerId: opts.partnerId,
    moveType: opts.moveType,
    state: "posted",
    invoiceDate: opts.invoiceDate,
    dueDate: opts.invoiceDate,
    invoiceLines: [{ name: "Goods", priceSubtotal: opts.amountUntaxed, quantity: 1, priceUnit: opts.amountUntaxed }],
    amountUntaxed: opts.amountUntaxed,
    amountTax: opts.amountTax,
    amountTotal: opts.amountUntaxed + opts.amountTax,
  });
}

async function makeAccount(account_type: string, name = `Account ${account_type}`) {
  const acc = await Account.create({ tenantId: TENANT, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return acc._id as mongoose.Types.ObjectId;
}

/** Configures a real TaxRate control account and posts a matching JournalEntry so AI-12's `tax`
 *  reconciliation definition genuinely ties out (input tax is debit-normal, +amount). Without
 *  this, a real invoice with no TaxRate configured is correctly a `blocked` reconciliation, not a
 *  clean one — docs/ai/BRIEF-07-BATCH-F.md 0.3. */
async function configureTaxLedger(amount: number, date: Date) {
  const user = await User.create({ tenantId: TENANT, name: "F", email: `f-${Date.now()}-${Math.random()}@x.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
  const taxControlAcc = await makeAccount("liability_current", `GST Payable ${Date.now()}`);
  const otherAcc = await makeAccount("expense", `Expense ${Date.now()}`);
  await TaxRate.create({ tenantId: TENANT, name: `GST 18% ${Date.now()}`, type: "gst", ratePercent: 18, appliesTo: "both", accountId: taxControlAcc, status: "active", createdBy: user._id });
  await JournalEntry.create({
    tenantId: TENANT,
    header: { name: `JE-tax-${Date.now()}`, date, journalType: "purchase" },
    status: "posted",
    voucherStatus: "posted",
    lineIds: [
      { accountId: taxControlAcc, label: "line", debit: amount, credit: 0 },
      { accountId: otherAcc, label: "line", debit: 0, credit: amount },
    ],
    totals: { amountUntaxed: amount, amountTax: 0, amountTotal: amount },
  });
}

async function makeProfile(opts: { registrations?: boolean; obligation?: Partial<{ warningWindowDays: number; dueDayOffset: number }> }) {
  return AiComplianceProfile.create({
    tenantId: TENANT,
    registrations: opts.registrations === false ? [] : [{ jurisdiction: "IN-KA", taxType: "gst", registrationNumber: "29ABCDE1234F1Z5", effectiveFrom: new Date("2020-01-01") }],
    obligations: [
      {
        jurisdiction: "IN-KA",
        taxType: "gst",
        returnType: "monthly_gst_return",
        frequency: "monthly",
        dueDayOffset: opts.obligation?.dueDayOffset ?? 20,
        firstPeriod: "2020-01",
        warningWindowDays: opts.obligation?.warningWindowDays ?? 21,
      },
    ],
  });
}

describe("AI-17 — Compliance readiness", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(),
      Invoice.init(),
      Account.init(),
      TaxRate.init(),
      JournalEntry.init(),
      User.init(),
      AiTaxTransaction.init(),
      AiComplianceProfile.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
      AiCloseState.init(),
      PeriodClosing.init(),
      BankStatement.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai17ComplianceReadiness } = await import("@/lib/aiRuntime/workflows/ai-17-compliance-readiness"));
    ({ computeComplianceReadiness } = await import("@/lib/aiRuntime/compliance/computeReadiness"));
    ({ computeCloseReadiness } = await import("@/lib/aiRuntime/closeReadiness/compute"));
    ({ rebuildTaxProjection } = await import("@/lib/aiRuntime/tax/rebuildTaxProjection"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Customer.deleteMany({}),
      Invoice.deleteMany({}),
      Account.deleteMany({}),
      TaxRate.deleteMany({}),
      JournalEntry.deleteMany({}),
      User.deleteMany({}),
      AiTaxTransaction.deleteMany({}),
      AiComplianceProfile.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
      AiCloseState.deleteMany({}),
      PeriodClosing.deleteMany({}),
      BankStatement.deleteMany({}),
    ]);
  });

  it("no compliance profile → not_configured, zero obligations, never an assumed default", async () => {
    const result = await computeComplianceReadiness(TENANT, PERIOD, new Date("2026-01-15"));
    expect(result.profileConfigured).toBe(false);
    expect(result.obligations).toEqual([]);
    expect(result.registrationGaps).toEqual([]);
    expect(result.submissionCapability).toBe("not_implemented");
  });

  it("a configured obligation with no tax data yet for the period → not_started", async () => {
    await makeProfile({});
    const result = await computeComplianceReadiness(TENANT, PERIOD, new Date("2026-01-15"));
    expect(result.obligations).toHaveLength(1);
    expect(result.obligations[0].readiness).toBe("not_started");
  });

  it("reconciled, fully-registered, well before the deadline → ready (false positive check)", async () => {
    await makeProfile({});
    const vendor = await makeCustomer("29ABCDE1234F1Z5");
    await makeInvoice({ moveType: "in_invoice", partnerId: vendor, amountUntaxed: 1000, amountTax: 180, invoiceDate: new Date("2026-01-10") });
    await configureTaxLedger(180, new Date("2026-01-10"));
    await rebuildTaxProjection(TENANT, PERIOD);

    // Deadline = periodEnd (Jan 31) + 20 days = Feb 20. asOfDate well before that.
    const result = await computeComplianceReadiness(TENANT, PERIOD, new Date("2026-01-15"));
    expect(result.obligations[0].readiness).toBe("ready");
    expect(result.obligations[0].blockers).toEqual([]);
  });

  it("a deadline inside the (generous, default) warning window → at_risk, never a surprise", async () => {
    await makeProfile({ obligation: { warningWindowDays: 21 } });
    const vendor = await makeCustomer("29ABCDE1234F1Z5");
    await makeInvoice({ moveType: "in_invoice", partnerId: vendor, amountUntaxed: 1000, amountTax: 180, invoiceDate: new Date("2026-01-10") });
    await configureTaxLedger(180, new Date("2026-01-10"));
    await rebuildTaxProjection(TENANT, PERIOD);

    // Deadline = periodEnd (Jan 31 23:59:59.999) + 20 days = Feb 20 23:59:59.999.
    // asOfDate = Feb 5 00:00:00 → 16 days remaining (rounded), inside the 21-day window.
    const result = await computeComplianceReadiness(TENANT, PERIOD, new Date("2026-02-05"));
    expect(result.obligations[0].readiness).toBe("at_risk");
    expect(result.obligations[0].daysRemaining).toBe(16);
  });

  it("an input credit missing its counterparty registration number → blocked, not merely at_risk", async () => {
    await makeProfile({});
    const vendor = await makeCustomer(); // no gstin
    await makeInvoice({ moveType: "in_invoice", partnerId: vendor, amountUntaxed: 1000, amountTax: 180, invoiceDate: new Date("2026-01-10") });
    await rebuildTaxProjection(TENANT, PERIOD);

    const result = await computeComplianceReadiness(TENANT, PERIOD, new Date("2026-01-15"));
    expect(result.obligations[0].readiness).toBe("blocked");
    expect(result.obligations[0].missingEvidence.length).toBeGreaterThan(0);
  });

  it("an obligation configured for a jurisdiction with no matching registration → registration gap", async () => {
    await makeProfile({ registrations: false });
    const result = await computeComplianceReadiness(TENANT, PERIOD, new Date("2026-01-15"));
    expect(result.registrationGaps).toHaveLength(1);
    expect(result.registrationGaps[0].jurisdiction).toBe("IN-KA");
    expect(result.registrationGaps[0].severity).toBe("high");
  });

  it("year-to-date turnover crosses a configured threshold with no registration on file → registration gap", async () => {
    await AiComplianceProfile.create({
      tenantId: TENANT,
      registrations: [],
      obligations: [],
      thresholds: [{ jurisdiction: "IN-KA", taxType: "gst", turnoverThreshold: 500 }],
    });
    const customer = await makeCustomer();
    await makeInvoice({ moveType: "out_invoice", partnerId: customer, amountUntaxed: 2000, amountTax: 360, invoiceDate: new Date("2026-01-05") });
    await rebuildTaxProjection(TENANT, PERIOD);
    // Force jurisdiction assignment for this single-registration-shaped test: no registrations
    // configured means resolveJurisdiction() returns null, so backfill jurisdiction directly to
    // exercise the threshold-crossing check in isolation.
    await AiTaxTransaction.updateMany({ tenantId: TENANT, periodKey: PERIOD }, { $set: { jurisdiction: "IN-KA" } });

    const result = await computeComplianceReadiness(TENANT, PERIOD, new Date("2026-01-15"));
    expect(result.registrationGaps).toHaveLength(1);
    expect(result.registrationGaps[0].reason).toContain("exceeds the configured threshold");
  });

  it("a registration gap is a real HIGH finding when the workflow runs", async () => {
    await makeProfile({ registrations: false });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-17", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runWorkflow(ai17ComplianceReadiness, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: PERIOD } });
    const finding = envelope.findings.find((f) => f.title.includes("Registration gap"));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("high");
  });

  it("AI-13's close state gets a compliance domain fed from the same computation — never a second, disagreeing engine", async () => {
    await makeProfile({ registrations: false });
    const computation = await computeCloseReadiness(TENANT, PERIOD, PERIOD_END);
    const compliance = computation.domains.find((d) => d.domain === "compliance")!;
    expect(compliance).toBeDefined();
    expect(compliance.status).toBe("blocked");
    expect(compliance.blockers.some((b) => b.sourceWorkflow === "AI-17")).toBe(true);
  });

  it("no profile configured → compliance domain is not_applicable, never an invented blocker", async () => {
    const computation = await computeCloseReadiness(TENANT, PERIOD, PERIOD_END);
    const compliance = computation.domains.find((d) => d.domain === "compliance")!;
    expect(compliance.status).toBe("not_applicable");
  });

  it("submission_capability is always not_implemented — no submit_filing tool exists (A.3, asserted directly)", async () => {
    const { getTool } = await import("@/lib/aiRuntime/tools/registry");
    expect(getTool("submit_filing")).toBeUndefined();
  });
});
