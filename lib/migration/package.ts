import AdmZip from "adm-zip";
import {
  MIGRATION_ENTITY,
  MIGRATION_MAX_ROWS,
  MIGRATION_SOURCE_SYSTEM_VALUES,
  type MigrationEntity,
  type MigrationSourceSystem,
} from "@/lib/migration/constants";
import {
  parseSourceFile,
  validateSourceFile,
} from "@/lib/migration/sourceAdapters";

export interface UploadedMigrationFile {
  name: string;
  buffer: Buffer;
}

export interface PreparedMigrationFile extends UploadedMigrationFile {
  entityType: MigrationEntity;
  columns: string[];
  rows: Record<string, unknown>[];
}

const MAX_ZIP_ENTRIES = 100;
const MAX_UNCOMPRESSED_ZIP_BYTES = 50 * 1024 * 1024;

function extOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeSourceSystem(value: unknown): MigrationSourceSystem {
  return MIGRATION_SOURCE_SYSTEM_VALUES.includes(value as MigrationSourceSystem)
    ? (value as MigrationSourceSystem)
    : "other";
}

export function validateZipEntryPath(entryName: string): string | null {
  const normalized = entryName.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized)) {
    return `Unsafe ZIP entry path: ${entryName}`;
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === "..")) {
    return `Unsafe ZIP entry path: ${entryName}`;
  }
  return null;
}

export function expandMigrationPackage(files: UploadedMigrationFile[]): UploadedMigrationFile[] {
  const expanded: UploadedMigrationFile[] = [];

  for (const file of files) {
    if (extOf(file.name) !== "zip") {
      const error = validateSourceFile(file.name);
      if (error) throw new Error(`${file.name}: ${error}`);
      expanded.push(file);
      continue;
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(file.buffer);
    } catch {
      throw new Error(`${file.name}: Invalid ZIP file.`);
    }

    const entries = zip.getEntries();
    if (entries.length > MAX_ZIP_ENTRIES) {
      throw new Error(`${file.name}: ZIP contains too many entries. Maximum allowed is ${MAX_ZIP_ENTRIES}.`);
    }

    let uncompressedBytes = 0;
    for (const entry of entries) {
      if (entry.isDirectory || entry.entryName.startsWith("__MACOSX/")) continue;

      const pathError = validateZipEntryPath(entry.entryName);
      if (pathError) throw new Error(`${file.name}: ${pathError}`);

      const leafName = entry.entryName.split("/").pop() || entry.entryName;
      const formatError = validateSourceFile(leafName);
      if (formatError) throw new Error(`${file.name}/${entry.entryName}: ${formatError}`);

      const data = entry.getData();
      uncompressedBytes += data.byteLength;
      if (uncompressedBytes > MAX_UNCOMPRESSED_ZIP_BYTES) {
        throw new Error(`${file.name}: ZIP uncompressed size exceeds ${MAX_UNCOMPRESSED_ZIP_BYTES / (1024 * 1024)}MB.`);
      }

      expanded.push({ name: leafName, buffer: data });
    }
  }

  if (expanded.length === 0) {
    throw new Error("No supported data files were found in the upload.");
  }

  return expanded;
}

export function inferEntityType(fileName: string, columns: string[]): MigrationEntity | null {
  const name = normalizeHeader(fileName);
  const headers = new Set(columns.map(normalizeHeader));
  const has = (...tokens: string[]) => tokens.some((token) => headers.has(normalizeHeader(token)));
  const nameHas = (...tokens: string[]) => tokens.some((token) => name.includes(normalizeHeader(token)));

  if (nameHas("invoiceitem", "invoiceline", "lineitem") || (has("invoice number", "inv no", "voucher no") && has("qty", "quantity") && has("rate", "unit price"))) {
    return MIGRATION_ENTITY.INVOICE_ITEM;
  }
  if (nameHas("customer", "debtor", "client") || (has("customer name", "cust name", "company name") && has("email", "email id", "gstin", "gst no"))) {
    return MIGRATION_ENTITY.CUSTOMER;
  }
  if (nameHas("vendor", "creditor", "supplier") || has("vendor name", "supplier name")) {
    return MIGRATION_ENTITY.VENDOR;
  }
  if (nameHas("product", "item", "stock") || has("item name", "product name", "sku", "item code")) {
    return MIGRATION_ENTITY.PRODUCT;
  }
  if (nameHas("purchase", "bill") || has("vendor", "supplier", "bill no")) {
    return MIGRATION_ENTITY.PURCHASE_INVOICE;
  }
  if (nameHas("invoice", "salesinvoice", "sale") || has("invoice number", "inv no", "customer", "buyer")) {
    return MIGRATION_ENTITY.SALES_INVOICE;
  }
  if (nameHas("payment", "receipt") || has("payment date", "receipt date", "cheque", "utr")) {
    return MIGRATION_ENTITY.PAYMENT;
  }
  if (nameHas("expense") || has("expense date", "expense head")) {
    return MIGRATION_ENTITY.EXPENSE;
  }
  if (nameHas("account", "ledger") || has("ledger name", "account name", "under")) {
    return MIGRATION_ENTITY.ACCOUNT;
  }
  if (nameHas("employee", "staff") || has("employee id", "emp id", "work email")) {
    return MIGRATION_ENTITY.EMPLOYEE;
  }

  return null;
}

export function prepareMigrationFiles(
  files: UploadedMigrationFile[],
  sourceSystem: MigrationSourceSystem,
): PreparedMigrationFile[] {
  const expanded = expandMigrationPackage(files);
  const prepared: PreparedMigrationFile[] = [];

  for (const file of expanded) {
    let parsed;
    try {
      parsed = parseSourceFile(file.name, file.buffer, sourceSystem);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not parse file.";
      throw new Error(`${file.name}: ${message}`);
    }

    if (parsed.rows.length === 0) {
      throw new Error(`${file.name}: File contains no records.`);
    }
    if (parsed.rows.length > MIGRATION_MAX_ROWS) {
      throw new Error(`${file.name}: File has ${parsed.rows.length} rows; the per-file limit is ${MIGRATION_MAX_ROWS}. Split it into smaller files.`);
    }

    const entityType = inferEntityType(file.name, parsed.columns);
    if (!entityType) {
      throw new Error(`${file.name}: Could not infer a supported migration entity from filename or headers.`);
    }

    prepared.push({
      ...file,
      entityType,
      columns: parsed.columns,
      rows: parsed.rows,
    });
  }

  return prepared;
}
