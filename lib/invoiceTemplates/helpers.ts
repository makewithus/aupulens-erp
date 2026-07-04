export function escapeHtml(input: unknown): string {
  const s = input === null || input === undefined ? "" : String(input);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fmtNum(n: number, decimals = 2): string {
  return (Number(n) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function money(n: number, decimals = 2): string {
  return `&#8377; ${fmtNum(n, decimals)}`;
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
