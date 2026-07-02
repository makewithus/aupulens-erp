import { BUDGET_SEGMENT, type BudgetSegment } from "@/lib/constants/statuses";

/** Classifies an AccountType.segment (Odoo-style label) into a top-level budget segment. */
export function classifyBudgetSegment(accountTypeSegment?: string): BudgetSegment {
  const s = (accountTypeSegment || "").toLowerCase();
  if (s.includes("income")) return BUDGET_SEGMENT.INCOME;
  if (s.includes("expense") || s.includes("cost of goods sold")) return BUDGET_SEGMENT.EXPENSE;
  if (s.includes("liability")) return BUDGET_SEGMENT.LIABILITY;
  if (s === "equity") return BUDGET_SEGMENT.EQUITY;
  return BUDGET_SEGMENT.ASSET;
}

export function getFiscalYearOptions(reference: Date = new Date()): string[] {
  const fyStartYear = reference.getMonth() < 3 ? reference.getFullYear() - 1 : reference.getFullYear();
  const years: string[] = [];
  for (let offset = -1; offset <= 2; offset++) {
    const startYear = fyStartYear + offset;
    years.push(`Apr ${startYear} - Mar ${startYear + 1}`);
  }
  return years;
}

export function getCurrentFiscalYear(reference: Date = new Date()): string {
  const fyStartYear = reference.getMonth() < 3 ? reference.getFullYear() - 1 : reference.getFullYear();
  return `Apr ${fyStartYear} - Mar ${fyStartYear + 1}`;
}

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

export function getPeriodLabels(fiscalYear: string, period: "monthly" | "quarterly" | "yearly"): string[] {
  const match = fiscalYear.match(/(\d{4})/);
  const startYear = match ? parseInt(match[1], 10) : new Date().getFullYear();

  if (period === "yearly") return [fiscalYear];

  if (period === "quarterly") {
    return [
      `Q1 (Apr-Jun ${startYear})`,
      `Q2 (Jul-Sep ${startYear})`,
      `Q3 (Oct-Dec ${startYear})`,
      `Q4 (Jan-Mar ${startYear + 1})`,
    ];
  }

  return MONTHS.map((m, i) => `${m} ${i < 9 ? startYear : startYear + 1}`);
}
