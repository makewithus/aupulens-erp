// Turns raw backend/driver/validation messages into something an end user can
// act on. Anything that still looks technical after translation collapses to
// the caller's fallback, so stack-ish text (Mongoose paths, BSON, ObjectId
// casts, driver codes) never reaches the screen.

const FIELD_LABELS: Record<string, string> = {
  itemCode: "Item",
  itemName: "Item name",
  departmentId: "Department",
  designationId: "Designation",
  managerId: "Manager",
  warehouseId: "Warehouse",
  customerId: "Customer",
  vendorId: "Vendor",
  dob: "Date of birth",
  doj: "Date of joining",
  ifsc: "IFSC code",
  gstin: "GSTIN",
  pan: "PAN",
  phone: "Phone number",
  email: "Email address",
  expectedDeliveryDate: "Expected delivery date",
};

export function humanizeField(path: string): string {
  const leaf = path.split(".").pop() || path;
  if (FIELD_LABELS[leaf]) return FIELD_LABELS[leaf];
  const words = leaf
    .replace(/Id$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "This field";
}

function unique<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

const TECHNICAL = /(at path|BSONError|ObjectId|Cast to|validation failed|MongoServerError|MongooseError|E11000|ECONN|ETIMEDOUT|ENOTFOUND|TypeError|ReferenceError|SyntaxError|undefined|is not a function|Unexpected token|stack|\bat\s+\S+\s+\(|JSON\.parse|Internal server error|status code \d{3}|fetch failed|Failed to fetch|NetworkError|Load failed)/i;

export function friendlyError(raw: unknown, fallback = "Something went wrong. Please try again."): string {
  let msg = "";
  if (typeof raw === "string") msg = raw;
  else if (raw instanceof Error) msg = raw.message;
  else if (raw && typeof raw === "object" && "message" in (raw as any)) msg = String((raw as any).message || "");
  msg = (msg || "").trim();
  if (!msg) return fallback;

  if (/Failed to fetch|NetworkError|Load failed|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(msg)) {
    return "We couldn't reach the server. Please check your internet connection and try again.";
  }
  if (/unauthori[sz]ed|not authenticated|jwt expired|session (has )?expired/i.test(msg)) {
    return "Your session has expired. Please sign in again.";
  }
  if (/forbidden|not permitted|permission denied|access denied/i.test(msg) && !TECHNICAL.test(msg.replace(/access denied/i, ""))) {
    return "You don't have permission to do this. Please contact your administrator.";
  }

  const problems: string[] = [];

  // Duplicate key: E11000 duplicate key error ... index: x_1 dup key: { x: "abc" }
  if (/E11000|duplicate key/i.test(msg)) {
    const m = msg.match(/dup key: \{\s*(?:[a-zA-Z_]+: [^,}]+,\s*)*([a-zA-Z_.]+):/);
    const field = m ? humanizeField(m[1]) : "";
    return field && field !== "Tenant"
      ? `${field} already exists. Please use a different value.`
      : "A record with these details already exists. Please use different values.";
  }

  // Required: Path `itemCode` is required.
  for (const m of msg.matchAll(/Path [`'"]([\w.]+)[`'"] is required/gi)) {
    problems.push(`${humanizeField(m[1])} is required`);
  }
  // Enum: `` is not a valid enum value for path `gender`.
  for (const m of msg.matchAll(/is not a valid enum value for path [`'"]([\w.]+)[`'"]/gi)) {
    problems.push(`Please select a valid ${humanizeField(m[1]).toLowerCase()}`);
  }
  // Cast: Cast to ObjectId failed for value "" (type string) at path "departmentId"
  for (const m of msg.matchAll(/Cast to (\w+) failed for value .*? at path "([\w.]+)"/gi)) {
    const label = humanizeField(m[2]);
    problems.push(m[1] === "ObjectId" ? `Please select a ${label.toLowerCase()}` : m[1] === "Number" ? `${label} must be a number` : m[1] === "date" || m[1] === "Date" ? `${label} must be a valid date` : `${label} is not valid`);
  }
  // min/max: Path `x` (-1) is less than minimum allowed value (0).
  for (const m of msg.matchAll(/Path [`'"]([\w.]+)[`'"] \(.*?\) is (less|more) than (minimum|maximum) allowed value \((.*?)\)/gi)) {
    problems.push(`${humanizeField(m[1])} must be ${m[2] === "less" ? "at least" : "at most"} ${m[4]}`);
  }

  if (problems.length) {
    const list = unique(problems);
    return `${list.join(". ")}.`.replace(/\.\.$/, ".");
  }

  if (TECHNICAL.test(msg)) return fallback;
  return msg;
}
