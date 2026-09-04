import connectDB from "@/lib/db";
import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import BankAccount from "@/models/finance/BankAccount";
import BankStatement from "@/models/finance/BankStatement";
import FxRate from "@/models/finance/FxRate";
import Payroll from "@/models/hr/Payroll";
import AiSchedule, { AI_SCHEDULE_TYPE, AI_SCHEDULE_PERIOD_STATUS } from "@/models/ai/AiSchedule";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import { computeBankPosition } from "@/lib/aiRuntime/workflows/ai-03-bank-reconciliation/position";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY, PAYROLL_STATUS } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-16 — Cash intelligence (docs/ai/BRIEF-05-BATCH-D.md). Where the cash is, where it's going,
 * and when it gets tight. OBSERVE only — recommends, never initiates anything; no write tool
 * exists for this workflow at all.
 *
 * **Depends on AI-05/AI-06, never rebuilds either**: rather than re-deriving predicted payment
 * dates or the payables due schedule (both real, non-trivial computations AI-05/AI-06 already
 * own), AI-16 reads each workflow's own most recent `AiDecisionTrace.rawProposal` for this
 * tenant — the same persisted, audited output surface every workflow already writes to, not a
 * new coupling. If neither has run yet for this tenant, the forecast reports that gap honestly
 * (`omissions`) rather than inventing a number.
 *
 * **Position** reuses AI-03's `computeBankPosition()` (`ai-03-bank-reconciliation/position.ts`)
 * per bank account's latest statement — never a second bank-vs-GL comparison.
 *
 * **Horizon** is a fixed, documented 30 days (no config field for this exists anywhere to
 * consult — same "no invented config" pattern used throughout this batch).
 *
 * **Never sums mixed currencies without a rate** (Chunk 4 A.1): a currency with no `FxRate` on
 * or before today is reported standalone in `position.by_currency[]` and excluded from
 * `position.total_available` and from the day-by-day forecast — `incomplete_reason` says why.
 */

const HORIZON_DAYS = 30;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface Ai16Raw {
  actingUserId?: string;
}

interface CurrencyPosition {
  currency: string;
  bankBalance: number;
  glBalance: number;
  difference: number;
  hasRateToInr: boolean;
}

interface AccountPosition {
  bankAccountId: string;
  accountName: string;
  currency: string;
  bankBalance: number;
  glBalance: number;
  hasStatement: boolean;
}

interface CashEvent {
  date: Date;
  amount: number;
  kind: string;
  ref: string;
}

interface Ai16Extracted {
  actingUserId?: string;
  byAccount: AccountPosition[];
  byCurrency: CurrencyPosition[];
  totalAvailableInr: number;
  totalAvailableIncomplete: boolean;
  inflows: CashEvent[];
  outflows: CashEvent[];
  omissions: { what: string; reason: string }[];
}

interface ForecastDay {
  date: Date;
  opening: number;
  inflows: number;
  outflows: number;
  closing: number;
  confidence: number;
}

interface RiskEntry {
  date: Date;
  shortfall: number;
  cause: string;
  recommendedActions: string[];
}

interface Ai16Proposal {
  position: { byAccount: AccountPosition[]; byCurrency: CurrencyPosition[]; totalAvailableInr: number; incompleteReason: string | null };
  forecast: ForecastDay[];
  risks: RiskEntry[];
  scenarios: { name: string; description: string; resultingMinBalance: number; newRisk: boolean }[];
  omissions: { what: string; reason: string }[];
}

function rollForward(opening: number, inflows: CashEvent[], outflows: CashEvent[], startDate: Date, days: number): ForecastDay[] {
  const forecast: ForecastDay[] = [];
  let running = opening;
  for (let i = 0; i < days; i++) {
    const day = addDays(startDate, i);
    const dayInflow = round2(inflows.filter((e) => differenceInCalendarDays(e.date, day) === 0).reduce((s, e) => s + e.amount, 0));
    const dayOutflow = round2(outflows.filter((e) => differenceInCalendarDays(e.date, day) === 0).reduce((s, e) => s + e.amount, 0));
    const openingBal = running;
    const closing = round2(openingBal + dayInflow - dayOutflow);
    forecast.push({ date: day, opening: openingBal, inflows: dayInflow, outflows: dayOutflow, closing, confidence: 1 });
    running = closing;
  }
  return forecast;
}

export const ai16CashIntelligence: WorkflowDefinition<Ai16Raw, Ai16Extracted, Ai16Proposal> = {
  id: "AI-16",
  version: "1.0.0",
  eventKeys: ["ai.sweep.hourly"],
  actionClass: "cash_intelligence",
  defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,

  async subscriptionFilter(): Promise<boolean> {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai16Raw>> {
    return { entityId: event.tenantId, raw: { actingUserId: event.payload.actingUserId ? String(event.payload.actingUserId) : undefined } };
  },

  async extract(observed, ctx): Promise<Ai16Extracted> {
    await connectDB();
    const tenantId = ctx.tenantId;
    const today = startOfDay(new Date());
    const omissions: { what: string; reason: string }[] = [
      { what: "tax_payments", reason: "no filing/return model exists anywhere in this codebase (Chunk 6) — tax outflows cannot be forecast" },
      { what: "committed_po_outflow", reason: "PurchaseOrder has no expected-payment or expected-delivery date to schedule an un-billed commitment against; once billed, it already appears in AI-06's due schedule" },
    ];

    // ── Position: every BankAccount, cleared vs uncleared, by currency ──
    const bankAccounts = await BankAccount.find({ tenantId }).lean();
    const byAccount: AccountPosition[] = [];
    const currencyTotals = new Map<string, { bankBalance: number; glBalance: number }>();

    for (const acc of bankAccounts) {
      const currency = acc.currency || "INR";
      let bankBalance = 0;
      let glBalance = 0;
      let hasStatement = false;

      if (acc.glAccountId) {
        const statement = await BankStatement.findOne({ tenantId, "header.journalId": acc.glAccountId }).sort({ "header.date": -1 }).lean();
        if (statement) {
          const position = await computeBankPosition(tenantId, String(statement._id));
          if (position) {
            bankBalance = position.bankBalance;
            glBalance = position.glBalance;
            hasStatement = true;
          }
        }
      }
      if (!hasStatement) {
        omissions.push({ what: `bank_position:${acc.accountName}`, reason: "no bank statement on file for this account — position reported as 0" });
      }

      byAccount.push({ bankAccountId: String(acc._id), accountName: acc.accountName, currency, bankBalance, glBalance, hasStatement });
      const running = currencyTotals.get(currency) ?? { bankBalance: 0, glBalance: 0 };
      currencyTotals.set(currency, { bankBalance: round2(running.bankBalance + bankBalance), glBalance: round2(running.glBalance + glBalance) });
    }

    const byCurrency: CurrencyPosition[] = [];
    let totalAvailableInr = 0;
    let totalAvailableIncomplete = false;
    for (const [currency, totals] of currencyTotals.entries()) {
      if (currency === "INR") {
        byCurrency.push({ currency, bankBalance: totals.bankBalance, glBalance: totals.glBalance, difference: round2(totals.bankBalance - totals.glBalance), hasRateToInr: true });
        totalAvailableInr = round2(totalAvailableInr + totals.bankBalance);
        continue;
      }
      // Full "now", not startOfDay(now) — a rate entered earlier today must still be found; only
      // the forecast's own day buckets need midnight-aligned dates.
      const rate = await FxRate.findOne({ tenantId, fromCurrency: currency.toUpperCase(), toCurrency: "INR", rateDate: { $lte: new Date() } }).sort({ rateDate: -1 }).lean();
      if (rate) {
        byCurrency.push({ currency, bankBalance: totals.bankBalance, glBalance: totals.glBalance, difference: round2(totals.bankBalance - totals.glBalance), hasRateToInr: true });
        totalAvailableInr = round2(totalAvailableInr + totals.bankBalance * rate.rate);
      } else {
        byCurrency.push({ currency, bankBalance: totals.bankBalance, glBalance: totals.glBalance, difference: round2(totals.bankBalance - totals.glBalance), hasRateToInr: false });
        totalAvailableIncomplete = true;
        omissions.push({ what: `fx_rate:${currency}`, reason: `no FxRate to INR on or before ${today.toISOString().slice(0, 10)} — this currency's balance is excluded from the total and the forecast` });
      }
    }

    // ── Inflows: AI-05's predicted payment dates + deferred-revenue schedules ──
    const inflows: CashEvent[] = [];
    const ai05Trace = await AiDecisionTrace.findOne({ tenantId, workflowId: "AI-05" }).sort({ createdAt: -1 }).lean();
    if (ai05Trace?.rawProposal) {
      const predicted = (ai05Trace.rawProposal as { predictedPayments?: { invoiceId: string; amount: number; predictedDate: string | Date }[] }).predictedPayments ?? [];
      for (const p of predicted) {
        inflows.push({ date: startOfDay(new Date(p.predictedDate)), amount: p.amount, kind: "ar_predicted", ref: p.invoiceId });
      }
    } else {
      omissions.push({ what: "predicted_ar_inflows", reason: "AI-05 has not run yet for this tenant — no predicted payment dates available" });
    }

    const deferredSchedules = await AiSchedule.find({ tenantId, scheduleType: AI_SCHEDULE_TYPE.DEFERRED_REVENUE }).lean();
    for (const sched of deferredSchedules) {
      for (const period of sched.periods) {
        if (period.status === AI_SCHEDULE_PERIOD_STATUS.PENDING && differenceInCalendarDays(period.dueDate, today) >= 0 && differenceInCalendarDays(period.dueDate, today) < HORIZON_DAYS) {
          inflows.push({ date: startOfDay(new Date(period.dueDate)), amount: period.amount, kind: "deferred_revenue", ref: String(sched._id) });
        }
      }
    }

    // ── Outflows: AI-06's due schedule + payroll ──
    const outflows: CashEvent[] = [];
    const ai06Trace = await AiDecisionTrace.findOne({ tenantId, workflowId: "AI-06" }).sort({ createdAt: -1 }).lean();
    if (ai06Trace?.rawProposal) {
      const dueSchedule = (ai06Trace.rawProposal as { dueSchedule?: { billId: string; amount: number; currency: string; dueDate: string | Date }[] }).dueSchedule ?? [];
      for (const bill of dueSchedule) {
        if (bill.currency && bill.currency !== "INR") continue; // mixed-currency safety — never folded into the INR forecast without a rate
        outflows.push({ date: startOfDay(new Date(bill.dueDate)), amount: bill.amount, kind: "ap_due", ref: bill.billId });
      }
    } else {
      omissions.push({ what: "payables_due_schedule", reason: "AI-06 has not run yet for this tenant — no due schedule available" });
    }

    const payrollRuns = await Payroll.find({ tenantId, status: { $nin: [PAYROLL_STATUS.DISBURSED, PAYROLL_STATUS.REJECTED] } }).lean();
    for (const run of payrollRuns) {
      const payDate = startOfDay(new Date(run.payrollPeriod.endDate));
      if (differenceInCalendarDays(payDate, today) >= 0 && differenceInCalendarDays(payDate, today) < HORIZON_DAYS) {
        outflows.push({ date: payDate, amount: run.totals.totalNet, kind: "payroll", ref: String(run._id) });
      }
    }

    return { actingUserId: observed.raw.actingUserId, byAccount, byCurrency, totalAvailableInr, totalAvailableIncomplete, inflows, outflows, omissions };
  },

  async reason(extracted): Promise<ReasonResult<Ai16Proposal>> {
    const today = startOfDay(new Date());
    const forecast = rollForward(extracted.totalAvailableInr, extracted.inflows, extracted.outflows, today, HORIZON_DAYS);

    const risks: RiskEntry[] = [];
    for (const day of forecast) {
      if (day.closing < 0) {
        risks.push({
          date: day.date,
          shortfall: round2(Math.abs(day.closing)),
          cause: "projected outflows exceed available cash on this date",
          recommendedActions: ["delay a non-critical payment run", "accelerate collection on the largest predicted receivable"],
        });
      }
    }

    // Concentration risk: any single customer's predicted inflow over 40% of total forecast inflows.
    const inflowByRef = new Map<string, number>();
    for (const e of extracted.inflows) inflowByRef.set(e.ref, round2((inflowByRef.get(e.ref) ?? 0) + e.amount));
    const totalInflow = extracted.inflows.reduce((s, e) => s + e.amount, 0);
    if (totalInflow > 0) {
      for (const [ref, amount] of inflowByRef.entries()) {
        if (amount / totalInflow > 0.4) {
          risks.push({
            date: today,
            shortfall: 0,
            cause: `concentration risk — a single receivable (${ref}) is ${Math.round((amount / totalInflow) * 100)}% of forecast inflows over the horizon`,
            recommendedActions: ["confirm this customer's payment intent directly before relying on this forecast"],
          });
        }
      }
    }

    // Scenarios — recomputed roll-forwards on a shifted input, never applied, never initiated.
    const scenarios: Ai16Proposal["scenarios"] = [];
    if (extracted.inflows.length > 0) {
      const topInflow = [...extracted.inflows].sort((a, b) => b.amount - a.amount)[0];
      const shifted = extracted.inflows.map((e) => (e === topInflow ? { ...e, date: addDays(e.date, 30) } : e));
      const scenarioForecast = rollForward(extracted.totalAvailableInr, shifted, extracted.outflows, today, HORIZON_DAYS);
      const minBalance = Math.min(...scenarioForecast.map((d) => d.closing));
      scenarios.push({ name: "top_customer_30_days_late", description: "Largest predicted receivable pays 30 days later than predicted", resultingMinBalance: minBalance, newRisk: minBalance < 0 });
    }
    if (extracted.outflows.length > 0) {
      const smallestOutflow = [...extracted.outflows].sort((a, b) => a.amount - b.amount)[0];
      const shifted = extracted.outflows.map((e) => (e === smallestOutflow ? { ...e, date: addDays(e.date, 14) } : e));
      const scenarioForecast = rollForward(extracted.totalAvailableInr, extracted.inflows, shifted, today, HORIZON_DAYS);
      const minBalance = Math.min(...scenarioForecast.map((d) => d.closing));
      scenarios.push({ name: "non_critical_payment_delayed", description: "Smallest scheduled outflow delayed by 14 days", resultingMinBalance: minBalance, newRisk: minBalance < 0 });
    }
    const payrollEvent = extracted.outflows.find((e) => e.kind === "payroll");
    if (payrollEvent) {
      const shifted = extracted.outflows.map((e) => (e === payrollEvent ? { ...e, date: addDays(e.date, -5) } : e));
      const scenarioForecast = rollForward(extracted.totalAvailableInr, extracted.inflows, shifted, today, HORIZON_DAYS);
      const minBalance = Math.min(...scenarioForecast.map((d) => d.closing));
      scenarios.push({ name: "payroll_5_days_early", description: "Payroll disbursed 5 days earlier than scheduled", resultingMinBalance: minBalance, newRisk: minBalance < 0 });
    }

    const findings: ReasonResult<Ai16Proposal>["findings"] = risks
      .filter((r) => r.shortfall > 0)
      .map((r) => ({
        id: `ai16-shortfall-${r.date.toISOString().slice(0, 10)}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity: AI_FINDING_SEVERITY.HIGH,
        title: `Projected cash shortfall on ${r.date.toISOString().slice(0, 10)}`,
        detail: `${r.cause} — shortfall ₹${r.shortfall}`,
        amount: r.shortfall,
        confidence: 1,
        subjectRefs: [],
        evidence: [],
        reasonChain: [],
      }));

    return {
      proposal: {
        position: {
          byAccount: extracted.byAccount,
          byCurrency: extracted.byCurrency,
          totalAvailableInr: extracted.totalAvailableInr,
          incompleteReason: extracted.totalAvailableIncomplete ? "one or more currencies have no FX rate to INR — see omissions" : null,
        },
        forecast,
        risks,
        scenarios,
        omissions: extracted.omissions,
      },
      confidence: 1,
      findings,
      reasonChain: [
        `${extracted.byAccount.length} bank account(s), total available ₹${extracted.totalAvailableInr}${extracted.totalAvailableIncomplete ? " (incomplete)" : ""}`,
        `${risks.length} risk(s) over a ${HORIZON_DAYS}-day horizon`,
      ],
      gateOverrides: { periodOpen: true, permissionOk: true },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(): Promise<ActResult> {
    // OBSERVE only — recommends, never initiates anything. No write tool exists for AI-16 at all.
    return { findings: [], actionsTaken: [] };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
