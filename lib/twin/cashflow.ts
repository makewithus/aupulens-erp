/**
 * Digital Business Twin — cash-flow projection + the "late invoice" simulation
 * (6.11). Pure (no DB) so the money maths is unit-tested in isolation.
 *
 * The one genuinely-useful simulation this ships: how does delaying a specific
 * receivable's payment by N days shift the projected weekly cash position?
 * Deliberately scoped to that, not an unfounded "predict everything" claim.
 */
export interface Receivable {
  id: string;
  label?: string;
  amount: number;      // outstanding amount expected to come in
  dueDate: string;     // ISO
}

export interface WeeklyPoint {
  weekStart: string;   // ISO (Monday)
  inflow: number;      // receivables landing this week
  cumulative: number;  // running cash position (starting from openingBalance)
}

function startOfWeekUTC(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday=0
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

/** Project a weekly cash-inflow curve over `weeks` weeks from `from`. */
export function projectWeeklyCashflow(
  receivables: Receivable[],
  from: Date,
  weeks: number,
  openingBalance = 0,
): WeeklyPoint[] {
  const firstWeek = startOfWeekUTC(from);
  const buckets: number[] = new Array(weeks).fill(0);

  for (const r of receivables) {
    const due = startOfWeekUTC(new Date(r.dueDate));
    const weekIdx = Math.floor((due.getTime() - firstWeek.getTime()) / (7 * 86_400_000));
    // Overdue (before the window) counts in week 0 (expected imminently);
    // anything past the window is ignored for this projection.
    if (weekIdx < 0) buckets[0] += r.amount;
    else if (weekIdx < weeks) buckets[weekIdx] += r.amount;
  }

  const points: WeeklyPoint[] = [];
  let cumulative = openingBalance;
  for (let i = 0; i < weeks; i++) {
    cumulative += buckets[i];
    const ws = new Date(firstWeek.getTime() + i * 7 * 86_400_000);
    points.push({ weekStart: ws.toISOString().slice(0, 10), inflow: Math.round(buckets[i]), cumulative: Math.round(cumulative) });
  }
  return points;
}

export interface DelaySimulation {
  baseline: WeeklyPoint[];
  simulated: WeeklyPoint[];
  /** Per-week cumulative delta (simulated − baseline). */
  delta: { weekStart: string; delta: number }[];
  invoice: { id: string; amount: number; originalDue: string; newDue: string };
  summary: string;
}

/**
 * Simulate delaying ONE receivable's payment by `daysLate` days and report how
 * the weekly cumulative cash position changes vs the baseline.
 */
export function simulateInvoiceDelay(
  receivables: Receivable[],
  invoiceId: string,
  daysLate: number,
  from: Date,
  weeks: number,
  openingBalance = 0,
): DelaySimulation | { error: string } {
  const target = receivables.find((r) => r.id === invoiceId);
  if (!target) return { error: "Invoice not found among outstanding receivables." };

  const baseline = projectWeeklyCashflow(receivables, from, weeks, openingBalance);

  const newDue = new Date(new Date(target.dueDate).getTime() + daysLate * 86_400_000).toISOString();
  const shifted = receivables.map((r) => (r.id === invoiceId ? { ...r, dueDate: newDue } : r));
  const simulated = projectWeeklyCashflow(shifted, from, weeks, openingBalance);

  const delta = baseline.map((b, i) => ({ weekStart: b.weekStart, delta: simulated[i].cumulative - b.cumulative }));
  const maxDip = Math.min(...delta.map((d) => d.delta));

  return {
    baseline,
    simulated,
    delta,
    invoice: { id: invoiceId, amount: target.amount, originalDue: new Date(target.dueDate).toISOString().slice(0, 10), newDue: newDue.slice(0, 10) },
    summary:
      maxDip < 0
        ? `Delaying ${target.label || "this invoice"} (${target.amount}) by ${daysLate} days lowers the projected cash position by up to ${Math.abs(Math.round(maxDip))} during the gap before the payment lands.`
        : `Delaying this invoice by ${daysLate} days keeps the payment within the same projection window — no dip in the ${weeks}-week horizon.`,
  };
}
