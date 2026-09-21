import ExcelJS from "exceljs";

// Presentation-ready Excel output shared by every export in the app:
//   • report title + "generated on" line above the table
//   • distinct, frozen, filterable header row
//   • borders, sensible column widths, zebra rows
//   • numbers / currency / dates written as real typed cells (not text) with
//     matching number formats, and aligned accordingly
// Works in Node (API routes) and the browser (dynamic import).

export type ColumnType = "text" | "number" | "integer" | "currency" | "date" | "percent";

export interface ReportColumn {
  header: string;
  key?: string;
  type?: ColumnType;
  width?: number;
}

export interface StyledReportInput {
  title: string;
  subtitle?: string;
  sheetName?: string;
  columns: ReportColumn[];
  rows: any[][];
  /** Optional totals row: column index -> "sum" */
  totals?: Record<number, "sum">;
}

const FORMATS: Record<ColumnType, string | undefined> = {
  text: undefined,
  number: "#,##0.00",
  integer: "#,##0",
  currency: '"₹"#,##0.00;[Red]-"₹"#,##0.00',
  date: "dd-mmm-yyyy",
  percent: "0.00%",
};

const CURRENCY_HEADER = /(amount|total|price|balance|value|paid|due|cost|salary|gross|net|tax|revenue|payable|receivable|deduction|basic|hra|rate\s*\(₹\)|₹)/i;
const DATE_HEADER = /(date|joined|created|updated|expiry|due on)/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
// Many list exports pre-format dates with toLocaleDateString("en-IN") => dd/mm/yyyy.
const DMY_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

function parseDmy(v: any): Date | null {
  const m = typeof v === "string" ? DMY_DATE.exec(v.trim()) : null;
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) ? d : null;
}

function safeSheetName(name: string) {
  return (name || "Report").replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Report";
}

function toCellValue(v: any, type: ColumnType): any {
  if (v === null || v === undefined || v === "") return null;
  if (type === "date") {
    const d = v instanceof Date ? v : parseDmy(v) || new Date(v);
    return isNaN(d.getTime()) ? String(v) : d;
  }
  if (type === "number" || type === "integer" || type === "currency" || type === "percent") {
    const n = typeof v === "number" ? v : Number(String(v).replace(/[₹,\s]/g, ""));
    return Number.isFinite(n) ? n : String(v);
  }
  return typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
}

/** Guesses column types from the header text + first non-empty values. */
export function inferColumns(headers: string[], rows: any[][]): ReportColumn[] {
  return headers.map((header, i) => {
    const sample = rows.map((r) => r[i]).filter((v) => v !== null && v !== undefined && v !== "").slice(0, 25);
    let type: ColumnType = "text";
    if (sample.length && sample.every((v) => v instanceof Date || (typeof v === "string" && (ISO_DATE.test(v) || !!parseDmy(v))))) type = "date";
    else if (DATE_HEADER.test(header) && sample.length && sample.every((v) => !isNaN(new Date(v).getTime()) && typeof v !== "number")) type = "date";
    else if (sample.length && sample.every((v) => typeof v === "number" || (typeof v === "string" && /^-?[\d,]+(\.\d+)?$/.test(v.trim()) && v.trim().length < 16))) {
      // Codes / phone numbers / ids that only look numeric stay text.
      const idLike = /(code|phone|mobile|pin|zip|number|no\.?|#|id|gstin|pan|account)/i.test(header) && !CURRENCY_HEADER.test(header);
      if (!idLike) type = CURRENCY_HEADER.test(header) ? "currency" : sample.every((v) => Number.isInteger(Number(String(v).replace(/,/g, "")))) ? "integer" : "number";
    }
    return { header, type };
  });
}

export async function buildStyledXlsx(input: StyledReportInput): Promise<Uint8Array> {
  const { title, subtitle, columns, rows, totals } = input;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Aupulens ERP";
  wb.created = new Date();
  const ws = wb.addWorksheet(safeSheetName(input.sheetName || title), {
    properties: { defaultRowHeight: 18 },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const colCount = Math.max(columns.length, 1);
  const lastCol = ws.getColumn(colCount).letter;

  // Title block
  ws.mergeCells(`A1:${lastCol}1`);
  const t = ws.getCell("A1");
  t.value = title;
  t.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FF1F2937" } };
  t.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 28;

  ws.mergeCells(`A2:${lastCol}2`);
  const st = ws.getCell("A2");
  st.value = subtitle || `Generated on ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`;
  st.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF6B7280" } };

  const headerRowIdx = 4;
  const headerRow = ws.getRow(headerRowIdx);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } };
    const numeric = ["number", "integer", "currency", "percent"].includes(c.type || "text");
    cell.alignment = { vertical: "middle", horizontal: numeric ? "right" : c.type === "date" ? "center" : "left", wrapText: true };
    cell.border = thinBorder();
  });
  headerRow.height = 24;

  const widths = columns.map((c) => Math.max(c.width || 0, Math.min(String(c.header).length + 4, 40), 10));
  rows.forEach((r, ri) => {
    const row = ws.getRow(headerRowIdx + 1 + ri);
    columns.forEach((c, i) => {
      const type = c.type || "text";
      const cell = row.getCell(i + 1);
      const value = toCellValue(r[i], type);
      cell.value = value;
      const fmt = FORMATS[type];
      if (fmt && typeof value !== "string") cell.numFmt = fmt;
      const numeric = ["number", "integer", "currency", "percent"].includes(type);
      cell.alignment = { vertical: "top", horizontal: numeric ? "right" : type === "date" ? "center" : "left", wrapText: type === "text" };
      cell.font = { name: "Calibri", size: 10 };
      cell.border = thinBorder();
      if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } };
      const len = value instanceof Date ? 12 : String(value ?? "").length;
      widths[i] = Math.min(Math.max(widths[i], len + 2), c.width ? Math.max(c.width, 12) : 50);
    });
  });

  if (totals && rows.length) {
    const tr = ws.getRow(headerRowIdx + 1 + rows.length);
    columns.forEach((c, i) => {
      const cell = tr.getCell(i + 1);
      cell.font = { name: "Calibri", bold: true, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E9F0" } };
      cell.border = { ...thinBorder(), top: { style: "medium", color: { argb: "FF1F3A5F" } } };
      if (i === 0) cell.value = "Total";
      if (totals[i] === "sum") {
        const col = ws.getColumn(i + 1).letter;
        cell.value = { formula: `SUM(${col}${headerRowIdx + 1}:${col}${headerRowIdx + rows.length})` };
        const fmt = FORMATS[c.type || "number"];
        if (fmt) cell.numFmt = fmt;
        cell.alignment = { horizontal: "right" };
      }
    });
  }

  columns.forEach((_, i) => {
    ws.getColumn(i + 1).width = Math.round(widths[i]);
  });

  ws.views = [{ state: "frozen", ySplit: headerRowIdx, xSplit: 0, topLeftCell: `A${headerRowIdx + 1}`, activeCell: `A${headerRowIdx + 1}` }];
  if (rows.length) ws.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: headerRowIdx + rows.length, column: colCount } };
  ws.pageSetup.printTitlesRow = `${headerRowIdx}:${headerRowIdx}`;

  if (rows.length === 0) {
    ws.mergeCells(headerRowIdx + 1, 1, headerRowIdx + 1, colCount);
    const c = ws.getCell(headerRowIdx + 1, 1);
    c.value = "No records found for this report.";
    c.font = { italic: true, color: { argb: "FF6B7280" } };
    c.alignment = { horizontal: "center" };
  }

  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

/** Convenience for the many exports that already build a header + rows grid. */
export async function gridToStyledXlsx(opts: { title: string; sheetName?: string; subtitle?: string; data: any[][] }): Promise<Uint8Array> {
  const [headers = [], ...rows] = opts.data;
  return buildStyledXlsx({
    title: opts.title,
    subtitle: opts.subtitle,
    sheetName: opts.sheetName,
    columns: inferColumns(headers.map(String), rows),
    rows,
  });
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const s = { style: "thin" as const, color: { argb: "FFD1D5DB" } };
  return { top: s, left: s, bottom: s, right: s };
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Same as gridToStyledXlsx for arrays of flat objects (keys become headers). */
export async function objectsToStyledXlsx(opts: { title: string; sheetName?: string; subtitle?: string; rows: Record<string, any>[] }): Promise<Uint8Array> {
  const headers = Array.from(new Set(opts.rows.flatMap((r) => Object.keys(r))));
  return gridToStyledXlsx({ ...opts, data: [headers, ...opts.rows.map((r) => headers.map((h) => r[h]))] });
}
