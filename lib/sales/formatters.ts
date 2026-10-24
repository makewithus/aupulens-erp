/**
 * Canonical formatting utilities for Sales module.
 * Guarantees consistent Indian digit grouping (en-IN), DD/MM/YYYY date formatting,
 * and exact decimal quantity preservation across all Sales lists, detail views, and print templates.
 */

export function formatSalesDate(input: Date | string | number | null | undefined): string {
  if (!input) return "—";
  if (typeof input === "string") {
    const trimmed = input.trim();
    const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
    if (ymd) {
      const [, y, m, d] = ymd;
      return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
    }
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(trimmed);
    if (dmy) {
      const [, d, m, y] = dmy;
      return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
    }
  }
  const d = new Date(input);
  if (isNaN(d.getTime())) return "—";

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

export function formatSalesCurrency(amount: number | null | undefined, decimals = 2): string {
  const n = Number(amount) || 0;
  const isNeg = n < 0;
  const formatted = Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return isNeg ? `-₹${formatted}` : `₹${formatted}`;
}

export function formatQuantity(qty: number | null | undefined, show3Decimals = false): string {
  const n = Number(qty) || 0;
  if (show3Decimals) {
    return n.toLocaleString("en-IN", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
  }
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}
