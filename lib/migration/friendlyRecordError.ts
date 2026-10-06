import { friendlyError, humanizeField } from "@/lib/errors/friendlyError";

type MigrationErrorInput = {
  entityType?: string;
  sourceData?: Record<string, unknown> | null;
  mappedData?: Record<string, unknown> | null;
  errors?: Array<{ message?: string }> | null;
};

const ENTITY_LABELS: Record<string, string> = {
  employee: "employee",
  product: "product",
  customer: "customer",
  vendor: "vendor",
  invoice: "invoice",
};

const FIELD_LABELS: Record<string, string> = {
  employeeCode: "Employee code",
  employeeId: "Employee code",
  sourceId: "Source ID",
  default_code: "Product code",
  sku: "Product code",
  email: "Email address",
  name: "Name",
};

const SOURCE_KEYS = [
  "Employee Code",
  "Employee ID",
  "Product Code",
  "Product ID",
  "Full Name",
  "Employee Name",
  "Work Email",
  "Email",
  "Product Name",
  "SKU",
  "Mobile Number",
  "Department",
];

function labelEntity(entityType?: string) {
  const key = String(entityType || "").toLowerCase();
  return ENTITY_LABELS[key] || key || "record";
}

function labelField(field?: string) {
  if (!field) return "Unique value";
  const leaf = field.split(".").pop() || field;
  return FIELD_LABELS[leaf] || humanizeField(leaf);
}

function stringifyValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

function pickDuplicateField(message: string) {
  const body = message.match(/dup key:\s*\{([^}]+)\}/i)?.[1] || "";
  const pairs = Array.from(body.matchAll(/([\w.]+):\s*"([^"]*)"/g));
  const useful = pairs.find(([_, key]) => !/tenant/i.test(key)) || pairs[pairs.length - 1];
  return useful ? { field: useful[1], value: useful[2] } : null;
}

export function summarizeMigrationRow(record: MigrationErrorInput) {
  const source = record.sourceData || {};
  const mapped = record.mappedData || {};
  const summary: Array<{ label: string; value: string }> = [];

  for (const key of SOURCE_KEYS) {
    const value = stringifyValue(source[key]);
    if (value) summary.push({ label: key, value });
    if (summary.length >= 5) return summary;
  }

  for (const [key, raw] of Object.entries(mapped)) {
    const value = stringifyValue(raw);
    if (value) summary.push({ label: labelField(key), value });
    if (summary.length >= 5) break;
  }

  return summary;
}

export function friendlyMigrationRecordError(record: MigrationErrorInput) {
  const rawMessages = (record.errors || [])
    .map((error) => String(error?.message || "").trim())
    .filter(Boolean);
  const raw = rawMessages.join("; ");
  const entity = labelEntity(record.entityType);

  if (/E11000|duplicate key/i.test(raw)) {
    const duplicate = pickDuplicateField(raw);
    const field = labelField(duplicate?.field);
    const value = duplicate?.value ? ` "${duplicate.value}"` : "";
    return {
      title: "This record already exists",
      message: `${field}${value} is already used by another ${entity} in this workspace.`,
      action: `Review this row and choose Merge / Update to update the existing ${entity}, Skip to leave it unchanged, or Force Create only when it is truly a new ${entity}.`,
    };
  }

  if (/validation failed|Path [`'"].*[`'"] is required|Cast to|enum value/i.test(raw)) {
    return {
      title: "Some row values need correction",
      message: friendlyError(raw, "One or more values in this row are missing or not in the expected format."),
      action: "Open the failed rows, correct the highlighted values, and validate the import again before migration.",
    };
  }

  return {
    title: "This row could not be migrated",
    message: friendlyError(raw, "The system could not save this row safely."),
    action: "Review the row details below, fix the data if needed, then retry the migration.",
  };
}
