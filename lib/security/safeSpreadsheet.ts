import * as xlsx from "xlsx";

/**
 * Hardened Spreadsheet Ingestion & Security Containment Layer
 *
 * Fully isomorphic (runs on Node.js server and in browser).
 * Mitigates known advisories in SheetJS (prototype pollution GHSA-4r6h-8v6p-xvw6,
 * ReDoS GHSA-5pgg-2g8v-p4x9) and general spreadsheet vulnerabilities (ZIP bombs,
 * memory exhaustion, formula injection) without regressing ERP ingestion features.
 */

export interface SpreadsheetValidationOptions {
  /** Maximum allowed compressed/raw file size in bytes (default: 10MB; 25MB for migration). */
  maxSizeBytes?: number;
  /** Maximum uncompressed payload size across all zip streams (default: 50MB; 100MB for migration). */
  maxUncompressedBytes?: number;
  /** Maximum decompression ratio per file entry or total (default: 20x). */
  maxCompressionRatio?: number;
  /** Maximum number of internal entries allowed in ZIP container (default: 500). */
  maxZipEntries?: number;
  /** Whether CSV / TSV formats are permitted (default: true). */
  allowCsvTsv?: boolean;
}

export interface SafeReadOptions extends SpreadsheetValidationOptions {
  /** Maximum number of sheets permitted in the workbook (default: 20). */
  maxSheets?: number;
  /** Preserve date objects instead of raw serial numbers (default: true). */
  cellDates?: boolean;
  /** Preserve raw unformatted cell values (default: true). */
  raw?: boolean;
  /** Optional file name for magic byte validation and extension checking. */
  fileName?: string;
}

export interface SafeSheetToJsonOptions {
  /** Maximum allowed rows in the target sheet (default: 25,000; 50,000 for migration). */
  maxRows?: number;
  /** Maximum allowed columns in the target sheet (default: 100). */
  maxCols?: number;
  /** Whether to neutralize formula injection prefixes (=, +, -, @, \t, \r) in text cells (default: true). */
  sanitizeFormulas?: boolean;
  /** Sheet to JSON header mode (1 for 2D array, or custom headers). */
  header?: any;
  /** Preserve raw unformatted values. */
  raw?: boolean;
  /** Default value for empty cells. */
  defval?: any;
  /** Optional range slice. */
  range?: any;
}

const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50MB
const DEFAULT_MAX_COMPRESSION_RATIO = 20; // 20:1
const DEFAULT_MAX_ZIP_ENTRIES = 500;
const DEFAULT_MAX_SHEETS = 20;
const DEFAULT_MAX_ROWS = 25000;
const DEFAULT_MAX_COLS = 100;

// Dangerous object prototype keys to strip from row objects
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Formula injection prefix characters
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function readU16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function toUint8Array(data: Uint8Array | ArrayBuffer | Buffer): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data);
}

/**
 * Neutralizes potential formula injection characters in string cell values.
 * If a value is a valid numeric string (e.g. "+123", "-45.6"), it is preserved.
 * If it looks like a formula (e.g. "=SUM(A1:A10)", "=cmd|' /C calc'!A0", "@SUM(...)"),
 * it is prefixed with a single quote so spreadsheet engines treat it strictly as text.
 */
export function sanitizeCellValue(val: unknown, sanitizeFormulas = true): unknown {
  if (typeof val !== "string") return val;
  if (!sanitizeFormulas || val.length === 0) return val;

  const firstChar = val[0];
  if (!FORMULA_PREFIXES.includes(firstChar)) return val;

  // Preserve valid signed numbers (e.g. "-100", "+50.5", "-0.25")
  if ((firstChar === "-" || firstChar === "+") && !isNaN(Number(val))) {
    return val;
  }

  // Neutralize formula trigger
  return `'${val}`;
}

/**
 * Validates ZIP headers and prevents zip bomb attacks before any decompressor touches the buffer.
 */
export function inspectZipHeaders(
  data: Uint8Array | Buffer | ArrayBuffer,
  maxUncompressedBytes = DEFAULT_MAX_UNCOMPRESSED_BYTES,
  maxCompressionRatio = DEFAULT_MAX_COMPRESSION_RATIO,
  maxZipEntries = DEFAULT_MAX_ZIP_ENTRIES,
): { entryCount: number; totalCompressed: number; totalUncompressed: number } {
  const bytes = toUint8Array(data);
  if (bytes.length < 22) {
    throw new Error("Invalid archive: file too small to be a valid ZIP/XLSX.");
  }

  // Locate End of Central Directory (EOCD) signature 0x06054b50 searching backwards
  let eocdOffset = -1;
  const maxSearch = Math.min(bytes.length, 65535 + 22);
  for (let i = bytes.length - 22; i >= bytes.length - maxSearch; i--) {
    if (readU32LE(bytes, i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("Invalid XLSX file: End of Central Directory signature not found.");
  }

  const totalEntries = readU16LE(bytes, eocdOffset + 10);
  const cdSize = readU32LE(bytes, eocdOffset + 12);
  const cdOffset = readU32LE(bytes, eocdOffset + 16);

  if (totalEntries > maxZipEntries) {
    throw new Error(
      `Zip security violation: archive contains ${totalEntries} entries, exceeding maximum allowed of ${maxZipEntries}.`,
    );
  }

  if (cdOffset + cdSize > bytes.length) {
    throw new Error("Corrupted XLSX archive: Central Directory extends beyond file boundary.");
  }

  let offset = cdOffset;
  let totalUncompressed = 0;
  let totalCompressed = 0;
  let entryCount = 0;

  while (offset < cdOffset + cdSize && offset <= bytes.length - 46) {
    const sig = readU32LE(bytes, offset);
    if (sig !== 0x02014b50) break; // Central Directory File Header signature

    const compSize = readU32LE(bytes, offset + 20);
    const uncompSize = readU32LE(bytes, offset + 24);
    const fnLen = readU16LE(bytes, offset + 28);
    const extraLen = readU16LE(bytes, offset + 30);
    const commentLen = readU16LE(bytes, offset + 32);

    totalCompressed += compSize;
    totalUncompressed += uncompSize;
    entryCount++;

    if (entryCount > maxZipEntries) {
      throw new Error(`Zip security violation: entry count exceeds limit of ${maxZipEntries}.`);
    }

    if (compSize > 0) {
      const ratio = uncompSize / compSize;
      if (ratio > maxCompressionRatio) {
        throw new Error(
          `Zip bomb detected: entry compression ratio ${ratio.toFixed(1)}:1 exceeds safety limit of ${maxCompressionRatio}:1.`,
        );
      }
    }

    if (totalUncompressed > maxUncompressedBytes) {
      throw new Error(
        `Zip bomb detected: total uncompressed size (${Math.round(totalUncompressed / (1024 * 1024))}MB) exceeds limit of ${Math.round(maxUncompressedBytes / (1024 * 1024))}MB.`,
      );
    }

    offset += 46 + fnLen + extraLen + commentLen;
  }

  // Also check overall compression ratio if archive has non-trivial uncompressed size
  if (totalCompressed > 0 && totalUncompressed > 1024 * 1024) {
    const overallRatio = totalUncompressed / totalCompressed;
    if (overallRatio > maxCompressionRatio) {
      throw new Error(
        `Zip bomb detected: aggregate compression ratio ${overallRatio.toFixed(1)}:1 exceeds safety limit of ${maxCompressionRatio}:1.`,
      );
    }
  }

  return { entryCount, totalCompressed, totalUncompressed };
}

/**
 * Validates spreadsheet buffer against magic bytes, maximum size, and structural constraints.
 */
export function validateSpreadsheetBuffer(
  data: Uint8Array | Buffer | ArrayBuffer,
  fileName = "",
  options?: SpreadsheetValidationOptions,
): void {
  const bytes = toUint8Array(data);
  const maxSizeBytes = options?.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const maxUncompressedBytes = options?.maxUncompressedBytes ?? DEFAULT_MAX_UNCOMPRESSED_BYTES;
  const maxCompressionRatio = options?.maxCompressionRatio ?? DEFAULT_MAX_COMPRESSION_RATIO;
  const maxZipEntries = options?.maxZipEntries ?? DEFAULT_MAX_ZIP_ENTRIES;

  if (bytes.length === 0) {
    throw new Error("File is empty.");
  }

  if (bytes.length > maxSizeBytes) {
    throw new Error(
      `File size (${Math.round(bytes.length / (1024 * 1024))}MB) exceeds maximum permitted size of ${Math.round(maxSizeBytes / (1024 * 1024))}MB.`,
    );
  }

  const ext = fileName.split(".").pop()?.toLowerCase();

  // Check magic bytes
  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);

  const isOle2 =
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1;

  if (ext === "xlsx") {
    if (!isZip) {
      throw new Error("Invalid XLSX file: file header does not match ZIP container format.");
    }
    // Inspect ZIP structure for decompression safety
    inspectZipHeaders(bytes, maxUncompressedBytes, maxCompressionRatio, maxZipEntries);
    return;
  }

  if (ext === "xls") {
    if (isOle2) {
      return; // Standard BIFF8/OLE2 XLS
    }
    // Some systems export HTML tables or XML with an .xls extension.
    // Verify it doesn't contain unexpected binary executable signatures (e.g. PE header MZ)
    if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) {
      throw new Error("Disallowed executable binary detected in spreadsheet upload.");
    }
    return;
  }

  if (ext === "csv" || ext === "tsv" || options?.allowCsvTsv !== false) {
    // If it's a zip or OLE2, check if extension matches
    if (isZip) {
      inspectZipHeaders(bytes, maxUncompressedBytes, maxCompressionRatio, maxZipEntries);
      return;
    }
    if (isOle2) {
      return;
    }

    // Verify it's not a native executable binary (MZ or ELF)
    if (bytes.length >= 4) {
      if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
        throw new Error("Disallowed executable binary detected in spreadsheet upload.");
      }
      if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
        throw new Error("Disallowed ELF binary detected in spreadsheet upload.");
      }
    }

    // Ensure CSV doesn't contain excessive null bytes in the header (indicative of binary files)
    const checkLen = Math.min(bytes.length, 1024);
    let nullBytes = 0;
    for (let i = 0; i < checkLen; i++) {
      if (bytes[i] === 0x00) nullBytes++;
    }
    if (nullBytes > 2) {
      throw new Error("Binary data detected in text spreadsheet upload.");
    }
  }
}

/**
 * Safely parses a spreadsheet buffer using hardened options.
 * Disables formula evaluation, HTML rendering, number format ReDoS triggers, and VBA macros.
 */
export function safeReadSpreadsheet(
  data: Uint8Array | Buffer | ArrayBuffer,
  options?: SafeReadOptions,
): xlsx.WorkBook {
  validateSpreadsheetBuffer(data, options?.fileName || "", options);

  const maxSheets = options?.maxSheets ?? DEFAULT_MAX_SHEETS;

  // SheetJS parsing options hardened against GHSA-4r6h-8v6p-xvw6 and GHSA-5pgg-2g8v-p4x9
  const workbook = xlsx.read(data, {
    type: typeof Buffer !== "undefined" && Buffer.isBuffer(data) ? "buffer" : "array",
    cellFormula: false, // Prevents formula parsing / AST evaluation
    cellHTML: false,    // Disables HTML rendering / embedded scripts in cells
    cellNF: false,      // Disables number format string parsing (prevents ReDoS in custom format string parsers)
    sheetStubs: false,  // Don't emit empty stub cells
    bookVBA: false,     // Never parse VBA macros or execute macros
    bookDeps: false,    // Never parse sheet dependencies
    dense: true,        // Dense mode: sheets store row arrays instead of key strings, lower memory & prevents object key injection
    cellDates: options?.cellDates ?? true,
    raw: options?.raw ?? true,
  });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("The workbook does not contain any readable worksheets.");
  }

  if (workbook.SheetNames.length > maxSheets) {
    throw new Error(
      `Workbook contains ${workbook.SheetNames.length} sheets, exceeding maximum allowed of ${maxSheets}.`,
    );
  }

  return workbook;
}

/**
 * Converts a worksheet to JSON rows with dimensional bounds checking,
 * prototype pollution defense, and formula injection sanitization.
 */
export function safeSheetToJson<T = any>(
  worksheet: xlsx.WorkSheet,
  options?: SafeSheetToJsonOptions,
): T[] {
  if (!worksheet) return [];

  const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
  const maxCols = options?.maxCols ?? DEFAULT_MAX_COLS;
  const sanitizeFormulas = options?.sanitizeFormulas ?? true;

  // Dimensional bounds check
  if (worksheet["!ref"]) {
    try {
      const range = xlsx.utils.decode_range(worksheet["!ref"]);
      const numRows = range.e.r - range.s.r + 1;
      const numCols = range.e.c - range.s.c + 1;

      if (numRows > maxRows) {
        throw new Error(
          `Sheet row count (${numRows.toLocaleString()}) exceeds maximum allowed of ${maxRows.toLocaleString()}.`,
        );
      }
      if (numCols > maxCols) {
        throw new Error(
          `Sheet column count (${numCols}) exceeds maximum allowed of ${maxCols}.`,
        );
      }
    } catch (err: any) {
      if (err.message && err.message.includes("exceeds maximum allowed")) {
        throw err;
      }
      // If range decoding fails on degenerate ref, continue to sheet_to_json with caution
    }
  }

  const sheetOpts: xlsx.Sheet2JSONOpts = {};
  if (options?.raw !== undefined) sheetOpts.raw = options.raw;
  if (options?.defval !== undefined) sheetOpts.defval = options.defval;
  if (options?.header !== undefined) sheetOpts.header = options.header;
  if (options?.range !== undefined) sheetOpts.range = options.range;

  const rawJson = xlsx.utils.sheet_to_json(worksheet, sheetOpts);

  if (!Array.isArray(rawJson)) {
    return [];
  }

  if (rawJson.length > maxRows) {
    throw new Error(
      `Parsed row count (${rawJson.length.toLocaleString()}) exceeds maximum allowed of ${maxRows.toLocaleString()}.`,
    );
  }

  // Sanitize each row
  const isHeaderModeArray = options?.header === 1;

  if (isHeaderModeArray) {
    // Array of arrays
    return rawJson.map((row) => {
      if (!Array.isArray(row)) return [];
      return row.map((cell) => sanitizeCellValue(cell, sanitizeFormulas));
    }) as unknown as T[];
  }

  // Array of objects: prototype pollution defense + formula sanitization
  const cleanRows: T[] = [];

  for (let i = 0; i < rawJson.length; i++) {
    const rawRow = rawJson[i];
    if (!rawRow || typeof rawRow !== "object") continue;

    // Use a clean object without prototype exposure
    const cleanRow: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(rawRow)) {
      // Disallow dangerous keys that could cause prototype pollution
      const normalizedKey = key.trim();
      if (FORBIDDEN_KEYS.has(normalizedKey) || normalizedKey.includes("__proto__")) {
        continue;
      }

      cleanRow[normalizedKey] = sanitizeCellValue(value, sanitizeFormulas);
    }

    cleanRows.push(cleanRow as unknown as T);
  }

  return cleanRows;
}
