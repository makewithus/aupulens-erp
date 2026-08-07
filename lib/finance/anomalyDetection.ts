/**
 * Finance anomaly detection (Scope F — AI Copilot).
 *
 * Detection is DETERMINISTIC (statistics, not an LLM) — spotting an outlier
 * amount or a duplicate-suspect is a math/matching job an LLM would only make
 * less predictable and more expensive. The LLM's job is the *explanation*: given
 * the flagged anomalies, describe in plain language why each is worth a look and
 * what to do — with the deterministic descriptions as the fallback when AI is
 * gated/unavailable (same split used for CRM deal-risk / churn).
 */
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";

export type AnomalySeverity = "Low" | "Medium" | "High";
export interface FinanceAnomaly {
  type: "amount_outlier" | "duplicate_suspect" | "long_overdue";
  severity: AnomalySeverity;
  invoiceId: string;
  invoiceNumber?: string;
  amount: number;
  description: string;
}

interface InvoiceLike {
  _id: any;
  number?: string;
  totalAmount?: number;
  amount?: number;
  status?: string;
  invoiceDate?: string | Date;
  customerId?: any;
}

function amountOf(inv: InvoiceLike): number {
  return typeof inv.totalAmount === "number" ? inv.totalAmount : typeof inv.amount === "number" ? inv.amount : 0;
}

export interface AnomalyReport {
  anomalies: FinanceAnomaly[];
  stats: { count: number; mean: number; stdDev: number; max: number };
}

/**
 * Detect three anomaly classes across a tenant's invoices:
 *  - amount_outlier:  amount far above the mean (> mean + 2.5σ), a real spike.
 *  - duplicate_suspect: same customer + identical amount within 7 days.
 *  - long_overdue:    still overdue and dated > 60 days ago.
 */
export function detectInvoiceAnomalies(invoices: InvoiceLike[]): AnomalyReport {
  const amounts = invoices.map(amountOf).filter((n) => n > 0);
  const count = amounts.length;
  const mean = count ? amounts.reduce((a, b) => a + b, 0) / count : 0;
  const variance = count ? amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / count : 0;
  const stdDev = Math.sqrt(variance);
  const max = amounts.length ? Math.max(...amounts) : 0;

  const anomalies: FinanceAnomaly[] = [];
  const outlierThreshold = mean + 2.5 * stdDev;

  for (const inv of invoices) {
    const amt = amountOf(inv);
    // Outlier amount — only meaningful with enough data and a real spread.
    if (count >= 5 && stdDev > 0 && amt > outlierThreshold) {
      anomalies.push({
        type: "amount_outlier",
        severity: amt > mean + 4 * stdDev ? "High" : "Medium",
        invoiceId: String(inv._id),
        invoiceNumber: inv.number,
        amount: amt,
        description: `Invoice ${inv.number ?? String(inv._id)} of ${amt} is well above the average invoice (${Math.round(mean)}), a statistical outlier.`,
      });
    }
    // Long overdue.
    if (inv.status === "overdue" && inv.invoiceDate) {
      const days = (Date.now() - new Date(inv.invoiceDate).getTime()) / 86_400_000;
      if (days > 60) {
        anomalies.push({
          type: "long_overdue",
          severity: days > 120 ? "High" : "Medium",
          invoiceId: String(inv._id),
          invoiceNumber: inv.number,
          amount: amt,
          description: `Invoice ${inv.number ?? String(inv._id)} has been overdue for ${Math.round(days)} days.`,
        });
      }
    }
  }

  // Duplicate suspects: same customer + identical amount within 7 days.
  const byKey = new Map<string, InvoiceLike[]>();
  for (const inv of invoices) {
    if (!inv.customerId || !inv.invoiceDate) continue;
    const key = `${String(inv.customerId)}|${amountOf(inv)}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(inv);
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const sorted = group.slice().sort((a, b) => new Date(a.invoiceDate!).getTime() - new Date(b.invoiceDate!).getTime());
    for (let i = 1; i < sorted.length; i++) {
      const gapDays = (new Date(sorted[i].invoiceDate!).getTime() - new Date(sorted[i - 1].invoiceDate!).getTime()) / 86_400_000;
      if (gapDays <= 7) {
        anomalies.push({
          type: "duplicate_suspect",
          severity: "High",
          invoiceId: String(sorted[i]._id),
          invoiceNumber: sorted[i].number,
          amount: amountOf(sorted[i]),
          description: `Invoice ${sorted[i].number ?? String(sorted[i]._id)} duplicates the amount and customer of ${sorted[i - 1].number ?? String(sorted[i - 1]._id)} within ${Math.round(gapDays)} day(s) — possible double-billing.`,
        });
      }
    }
  }

  return { anomalies, stats: { count, mean, stdDev, max } };
}

export interface AnomalyExplanation { summary: string; aiUsed: boolean }

/**
 * Add a plain-language explanation over the deterministic anomalies. Falls back
 * to a concatenation of the deterministic descriptions when AI is unavailable.
 */
export async function explainAnomalies(tenantId: string, report: AnomalyReport): Promise<AnomalyExplanation> {
  if (report.anomalies.length === 0) return { summary: "No financial anomalies detected.", aiUsed: false };

  const fallback = report.anomalies.map((a) => `• [${a.severity}] ${a.description}`).join("\n");
  const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
  try {
    const result = await callClaudeForTenant(
      tenantId,
      tier,
      aiSettings,
      `A deterministic scan flagged these invoice anomalies. Explain briefly (for a finance manager) which deserve attention first and what to do about each. Use ONLY the flagged items — do not invent new ones.\n\n${JSON.stringify(report.anomalies)}`,
      { systemPrompt: "You are a finance controller's assistant. Be concise and specific. Reply in plain text.", maxTokens: AI_MAX_TOKENS.anomaly },
    );
    if (!("text" in result)) return { summary: fallback, aiUsed: false };
    return { summary: result.text, aiUsed: true };
  } catch {
    return { summary: fallback, aiUsed: false };
  }
}
