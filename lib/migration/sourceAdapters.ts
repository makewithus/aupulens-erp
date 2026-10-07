/**
 * Source adapters — turn an uploaded file (any supported format) into a uniform
 * { columns, rows } shape the rest of the pipeline consumes.
 *
 * Spreadsheet formats (CSV/TSV/XLS/XLSX) go through `xlsx`, matching every other
 * import route in this codebase. JSON and XML are parsed here so a Tally/Zoho
 * XML export or a REST/JSON dump can be migrated without first re-saving as a
 * spreadsheet.
 *
 * IMPORTANT: spreadsheets are read with `cellDates: true` and `raw: true`.
 * `raw:false` asks xlsx to format General numeric cells, which turns phone
 * numbers such as 919810000001 into 9.1981E+11. We preserve raw values and
 * normalize Date objects to YYYY-MM-DD strings ourselves.
 */

import * as xlsx from "xlsx";

export interface ParsedSource {
  columns: string[];
  rows: Record<string, unknown>[];
}

const SPREADSHEET_EXT = new Set(["csv", "tsv", "xls", "xlsx"]);

function extOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

/** Union of all keys seen across rows, preserving first-seen order. */
function deriveColumns(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const cols: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        cols.push(key);
      }
    }
  }
  return cols;
}

function parseSpreadsheet(buffer: Buffer): ParsedSource {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) return { columns: [], rows: [] };
  const rows = xlsx.utils.sheet_to_json(worksheet, {
    raw: true,
    defval: "",
  }) as Record<string, unknown>[];
  const normalizedRows = normalizeRows(rows);
  return { columns: deriveColumns(normalizedRows), rows: normalizedRows };
}

export function parseSpreadsheetSheets(buffer: Buffer): { sheetName: string; parsed: ParsedSource }[] {
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true });
  return workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return { sheetName, parsed: { columns: [], rows: [] } };
    const rows = xlsx.utils.sheet_to_json(worksheet, {
      raw: true,
      defval: "",
    }) as Record<string, unknown>[];
    const normalizedRows = normalizeRows(rows);
    return {
      sheetName,
      parsed: { columns: deriveColumns(normalizedRows), rows: normalizedRows },
    };
  });
}

function normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = value instanceof Date ? value.toISOString().slice(0, 10) : value;
    }
    return normalized;
  });
}

function parseJson(buffer: Buffer): ParsedSource {
  const text = buffer.toString("utf-8").trim();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("File is not valid JSON.");
  }
  // Accept either a top-level array, or an object with the first array-valued
  // property (a common REST-envelope shape like { data: [...] }).
  let arr: unknown[] | null = Array.isArray(data) ? data : null;
  if (!arr && data && typeof data === "object") {
    const firstArray = Object.values(data as Record<string, unknown>).find((v) =>
      Array.isArray(v),
    );
    if (Array.isArray(firstArray)) arr = firstArray;
  }
  if (!arr) throw new Error("JSON must be an array of records (or an object containing one).");
  const rows = arr
    .filter((r) => r && typeof r === "object" && !Array.isArray(r))
    .map((r) => r as Record<string, unknown>);
  return { columns: deriveColumns(rows), rows };
}

/**
 * Minimal, dependency-free XML flattening. Finds the most-repeated element name
 * (the record element, e.g. <VOUCHER> or <LEDGER> in Tally, <Contact> in Zoho)
 * and turns each occurrence's direct children into flat key/value pairs. Good
 * enough for the flat master-data exports this platform targets; deeply nested
 * transactional XML is out of scope for this version and documented as such.
 */
function parseXml(buffer: Buffer): ParsedSource {
  const text = buffer.toString("utf-8");
  // Count element occurrences to guess the record element.
  const openTagRe = /<([A-Za-z_][\w.-]*)\b[^>]*>/g;
  const counts = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = openTagRe.exec(text)) !== null) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  if (counts.size === 0) throw new Error("No XML elements found.");
  // Record element = most frequent element that has >1 occurrence; ties broken
  // by longest name (record elements are usually more specific than wrappers).
  let recordEl = "";
  let best = 0;
  for (const [name, count] of counts) {
    if (count < 2) continue;
    if (count > best || (count === best && name.length > recordEl.length)) {
      best = count;
      recordEl = name;
    }
  }
  if (!recordEl) throw new Error("Could not detect a repeating record element in the XML.");

  const blockRe = new RegExp(`<${recordEl}\\b[^>]*>([\\s\\S]*?)</${recordEl}>`, "g");
  const childRe = /<([A-Za-z_][\w.-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
  const rows: Record<string, unknown>[] = [];
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(text)) !== null) {
    const inner = block[1];
    const row: Record<string, unknown> = {};
    let child: RegExpExecArray | null;
    while ((child = childRe.exec(inner)) !== null) {
      const key = child[1];
      // Skip nested-container children (value still contains a tag).
      const val = child[2].includes("<") ? "" : child[2].trim();
      if (!(key in row)) row[key] = val;
    }
    if (Object.keys(row).length > 0) rows.push(row);
  }
  return { columns: deriveColumns(rows), rows };
}

function parseTallyXml(buffer: Buffer): ParsedSource {
  const text = buffer.toString("utf-8");
  if (!text.includes("<TALLYMESSAGE")) return parseXml(buffer);
  
  const rows: Record<string, unknown>[] = [];
  const tallyMsgRe = /<TALLYMESSAGE[^>]*>([\s\S]*?)<\/TALLYMESSAGE>/g;
  const childRe = /<([A-Za-z_][\w.-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
  
  let msg: RegExpExecArray | null;
  while ((msg = tallyMsgRe.exec(text)) !== null) {
    const inner = msg[1];
    const recordMatch = /<([A-Za-z_][\w.-]*)\b[^>]*>/.exec(inner);
    if (!recordMatch) continue;
    const recordType = recordMatch[1];
    
    const recordBlockRe = new RegExp(`<${recordType}\\b[^>]*>([\\s\\S]*?)</${recordType}>`);
    const recordBlockMatch = recordBlockRe.exec(inner);
    if (!recordBlockMatch) continue;
    
    const row: Record<string, unknown> = { _tallyType: recordType };
    let child: RegExpExecArray | null;
    while ((child = childRe.exec(recordBlockMatch[1])) !== null) {
       const key = child[1];
       const val = child[2].includes("<") ? "" : child[2].trim();
       if (val && !(key in row)) row[key] = val;
    }
    if (Object.keys(row).length > 1) rows.push(row);
  }
  
  return { columns: deriveColumns(rows), rows };
}

function parseZohoExport(buffer: Buffer, ext: string): ParsedSource {
  if (SPREADSHEET_EXT.has(ext)) return parseSpreadsheet(buffer);
  if (ext === "json") return parseJson(buffer);
  return parseXml(buffer);
}

/**
 * Parse any supported source file. `fileName` drives format selection by
 * extension; unknown extensions fall back to a best-effort attempt (spreadsheet
 * first, since `xlsx` also reads raw CSV text).
 */
export function parseSourceFile(fileName: string, buffer: Buffer, sourceSystem?: string): ParsedSource {
  const ext = extOf(fileName);
  
  if (sourceSystem === "tally" && ext === "xml") return parseTallyXml(buffer);
  if (sourceSystem === "zoho") return parseZohoExport(buffer, ext);

  if (SPREADSHEET_EXT.has(ext)) return parseSpreadsheet(buffer);
  if (ext === "json") return parseJson(buffer);
  if (ext === "xml") return parseXml(buffer);
  // Unknown: sniff by leading character.
  const head = buffer.toString("utf-8", 0, 64).trim();
  if (head.startsWith("{") || head.startsWith("[")) return parseJson(buffer);
  if (head.startsWith("<")) return parseXml(buffer);
  return parseSpreadsheet(buffer);
}

const ALLOWED_EXT = ["csv", "tsv", "xls", "xlsx", "json", "xml"];

/** Server-side enforcement of the accepted source formats. */
export function validateSourceFile(fileName: string): string | null {
  const ext = extOf(fileName);
  if (!ext || !ALLOWED_EXT.includes(ext)) {
    return `Unsupported file format. Allowed: ${ALLOWED_EXT.map((e) => "." + e).join(", ")}.`;
  }
  return null;
}
