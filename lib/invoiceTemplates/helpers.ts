export function escapeHtml(input: unknown): string {
  const s = input === null || input === undefined ? "" : String(input);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// NBSP, zero-width space/non-joiner/joiner, BOM, tab — invisible whitespace
// variants copy-paste from emails/spreadsheets/WhatsApp commonly introduces.
const INVISIBLE_WHITESPACE = /[ ​‌‍﻿\t]/g;

/**
 * Normalizes user-entered / copy-pasted text before it reaches the renderer.
 * Business data (company names, addresses, item names, notes) routinely
 * arrives copy-pasted from emails, spreadsheets, or WhatsApp — carrying
 * invisible Unicode whitespace, stray tabs, doubled spaces, or a ragged
 * number of blank lines. None of that is acceptable on a document used for
 * real business/tax claims, so every text field is trimmed and collapsed
 * here — a single source of truth rather than each template re-implementing
 * its own cleanup.
 */
export function cleanText(input: unknown): string {
  if (input === null || input === undefined) return "";
  let s = String(input);
  s = s.replace(INVISIBLE_WHITESPACE, " ");
  // Collapse runs of spaces within each line and trim each line.
  s = s
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n");
  // Collapse 2+ consecutive blank lines down to one.
  s = s.replace(/\n{2,}/g, "\n");
  return s.trim();
}

export function fmtNum(n: number, decimals = 2): string {
  return (Number(n) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// A plain space between the currency symbol and the amount is a break
// opportunity — in a narrow table column the browser will wrap "₹" onto its
// own line, orphaned above the number. &nbsp; keeps them glued together.
export function money(n: number, decimals = 2): string {
  return `&#8377;&nbsp;${fmtNum(n, decimals)}`;
}

export function dateStr(d: Date | string | undefined): string {
  if (!d) return "-";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildUpiUri(payeeName: string, upiId: string | undefined, amount: number, note: string): string | null {
  if (!upiId) return null;
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: "INR",
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}
