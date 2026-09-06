import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai29golden";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import AccountingSettings from "@/models/finance/AccountingSettings";
import TransactionLock from "@/models/finance/TransactionLock";
import PeriodClosing from "@/models/finance/PeriodClosing";
import User from "@/models/auth/User";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import AiHold from "@/models/ai/AiHold";
import AiMasterDataProfile from "@/models/ai/AiMasterDataProfile";
import { AI29_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_PERIOD_START, GOLDEN_PERIOD_END, type GoldenCase } from "@/tests/golden/ai29/goldenCases";

/**
 * The golden-dataset CI check for AI-29 (docs/ai/BRIEF-10-PRE-QA.md P0.6). Same shape as
 * `tests/golden/ai22.golden.test.ts`: calls `runAllControlDefinitions()`, the same engine entry
 * point AI-29's own workflow calls, and checks either one named control's exception count or
 * (the silent case) that every implemented control raises zero.
 */

const PASS_RATE_THRESHOLD = 1.0; // no LLM call anywhere in AI-29's control-evaluation path

let runAllControlDefinitions: typeof import("@/lib/aiRuntime/controls/engine").runAllControlDefinitions;
let CONTROL_DEFINITIONS: typeof import("@/lib/aiRuntime/controls/definitions").CONTROL_DEFINITIONS;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;

async function seedCase(tenantId: string, goldenCase: GoldenCase) {
  const accountIds = new Map<string, mongoose.Types.ObjectId>();
  for (const a of goldenCase.accounts) {
    const doc = await Account.create({ tenantId, name: a.name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: a.accountType, internal_group: a.internalGroup, isActive: true, isLocked: false, status: "active" });
    accountIds.set(a.key, doc._id as mongoose.Types.ObjectId);
  }

  const userIds = new Map<string, mongoose.Types.ObjectId>();
  for (const key of goldenCase.users) {
    const doc = await User.create({ tenantId, name: key, email: `${key.toLowerCase()}-${Date.now()}-${Math.random()}@x.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
    userIds.set(key, doc._id as mongoose.Types.ObjectId);
  }

  if (goldenCase.accountingSettings) {
    await AccountingSettings.create({ tenantId, journals: goldenCase.accountingSettings });
  }

  if (goldenCase.transactionLock) {
    await TransactionLock.create({ tenantId, module: "accountant", isLocked: true, lockedUpToDate: new Date(goldenCase.transactionLock.lockedUpToDate) });
  }

  let sourceId: mongoose.Types.ObjectId | undefined;
  if (goldenCase.extractedDocumentForSourceId) {
    sourceId = new mongoose.Types.ObjectId();
    await ExtractedDocument.create({ tenantId, docType: "vendor_bill", fileName: "golden-bill.pdf", extraction: {}, aiConfidence: 0.9, createdRecordModel: "Invoice", createdRecordId: sourceId, createdBy: new mongoose.Types.ObjectId() });
  }

  for (const j of goldenCase.journals) {
    await JournalEntry.create({
      tenantId,
      header: { name: j.name, date: new Date(j.date), journalType: "general" },
      status: "posted",
      voucherStatus: "posted",
      createdBy: j.createdByKey ? userIds.get(j.createdByKey) : undefined,
      approvalRequired: Boolean(j.approvedByKey),
      approvalDetails: j.approvedByKey ? { approvedBy: userIds.get(j.approvedByKey), approvedAt: new Date(j.date) } : undefined,
      lineIds: j.lines.map((l) => ({ accountId: accountIds.get(l.accountKey), label: "line", debit: l.debit, credit: l.credit, sourceId: l.sourceId ? sourceId : undefined })),
      totals: { amountUntaxed: 0, amountTax: 0, amountTotal: j.lines.reduce((s, l) => s + l.debit, 0) },
    });
  }
}

describe("AI-29 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), JournalEntry.init(), Invoice.init(), Customer.init(), AccountingSettings.init(), TransactionLock.init(), PeriodClosing.init(),
      User.init(), ExtractedDocument.init(), AiHold.init(), AiMasterDataProfile.init(),
    ]);
    ({ runAllControlDefinitions } = await import("@/lib/aiRuntime/controls/engine"));
    ({ CONTROL_DEFINITIONS } = await import("@/lib/aiRuntime/controls/definitions"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI29_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; expected: unknown; actual: unknown }[] = [];

    for (const goldenCase of AI29_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      await seedCase(tenantId, goldenCase);

      const allResults = await runAllControlDefinitions(tenantId, CONTROL_DEFINITIONS, GOLDEN_PERIOD_START, GOLDEN_PERIOD_END);

      let passed: boolean;
      let actual: unknown;
      if (goldenCase.controlId) {
        const control = allResults.find((r) => r.controlId === goldenCase.controlId);
        actual = control?.exceptions.length;
        passed = control !== undefined && control.exceptions.length === goldenCase.expectedExceptionCount;
      } else {
        const implemented = allResults.filter((r) => r.status === "implemented");
        actual = implemented.map((r) => ({ controlId: r.controlId, exceptions: r.exceptions.length }));
        passed = implemented.every((r) => r.exceptions.length === 0);
      }

      results.push({ id: goldenCase.id, passed, expected: goldenCase.controlId ? goldenCase.expectedExceptionCount : "zero exceptions on every implemented control", actual });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    // eslint-disable-next-line no-console
    console.log(`AI-29 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures, null, 2)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});
