import { validateSpreadsheetBuffer } from "@/lib/security/safeSpreadsheet";

const ALLOWED_SPREADSHEET_EXTENSIONS = ["csv", "tsv", "xls", "xlsx"];
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Client-side extension checks are cosmetic on their own (trivially bypassed
// by posting straight to the API) — this is the actual enforcement point.
export function validateSpreadsheetFile(
  file: File,
  maxSizeBytes = DEFAULT_MAX_FILE_SIZE,
): string | null {
  if (!file) {
    return "No file provided.";
  }

  if (file.size === 0) {
    return "The uploaded file is empty.";
  }

  if (file.size > maxSizeBytes) {
    return `File size (${Math.round(file.size / (1024 * 1024))}MB) exceeds maximum limit of ${Math.round(maxSizeBytes / (1024 * 1024))}MB.`;
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_SPREADSHEET_EXTENSIONS.includes(ext)) {
    return "Invalid file format. Only CSV, TSV, or XLS(X) are allowed.";
  }

  return null;
}

export { validateSpreadsheetBuffer };
