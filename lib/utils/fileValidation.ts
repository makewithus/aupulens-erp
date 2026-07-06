const ALLOWED_SPREADSHEET_EXTENSIONS = ["csv", "tsv", "xls", "xlsx"];

// Client-side extension checks are cosmetic on their own (trivially bypassed
// by posting straight to the API) — this is the actual enforcement point.
export function validateSpreadsheetFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_SPREADSHEET_EXTENSIONS.includes(ext)) {
    return "Invalid file format. Only CSV, TSV, or XLS(X) are allowed.";
  }
  return null;
}
