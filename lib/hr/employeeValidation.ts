// Shared (client + server) input rules for the employee form. The form shows
// the messages next to each field; the API re-runs the same checks so a bad
// request can never reach Mongoose and come back as a technical error.

export type EmployeeFieldErrors = Record<string, string>;

const NAME_RE = /^[\p{L}][\p{L} .'-]*$/u;
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const GENDERS = ["male", "female", "other"] as const;
export const EMPLOYMENT_TYPES = ["full-time", "part-time", "contract", "intern"] as const;
export const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

/** Normalises an Indian mobile / international number to digits (with optional leading +). */
export function normalizePhone(raw: string): string {
  const s = String(raw || "").replace(/[\s()-]/g, "");
  if (s.startsWith("+91")) return s.slice(3);
  if (/^91\d{10}$/.test(s)) return s.slice(2);
  if (/^0\d{10}$/.test(s)) return s.slice(1);
  return s;
}

export function isValidPhone(raw: string): boolean {
  const p = normalizePhone(raw);
  return /^[6-9]\d{9}$/.test(p) || /^\+\d{8,15}$/.test(p);
}

const num = (v: any) => (v === "" || v === null || v === undefined ? 0 : Number(v));

/**
 * Drops values that would break Mongoose casts/enums when left as "" (the
 * cause of "Cast to ObjectId failed for value ''" / "'' is not a valid enum
 * value") and trims text fields.
 */
export function sanitizeEmployeePayload<T extends Record<string, any>>(data: T): T {
  const out: Record<string, any> = { ...data };
  for (const k of ["departmentId", "managerId", "userId", "gender", "designation", "department", "dateOfBirth", "bloodGroup"]) {
    if (out[k] === "" || out[k] === null) delete out[k];
  }
  for (const k of ["employeeCode", "firstName", "lastName", "designation"]) {
    if (typeof out[k] === "string") out[k] = out[k].trim();
  }
  if (typeof out.email === "string") out.email = out.email.trim().toLowerCase();
  if (typeof out.phone === "string") out.phone = out.phone.trim();
  if (out.salary && typeof out.salary === "object") {
    const s = { ...out.salary, deductions: { ...(out.salary.deductions || {}) } };
    for (const k of ["basic", "hra", "da", "specialAllowance"]) s[k] = num(s[k]);
    for (const k of ["pf", "esi", "professionalTax", "tds", "otherDeductions"]) s.deductions[k] = num(s.deductions[k]);
    out.salary = s;
  }
  return out as T;
}

export function validateEmployee(
  data: Record<string, any>,
  opts: { partial?: boolean } = {},
): EmployeeFieldErrors {
  const e: EmployeeFieldErrors = {};
  const has = (k: string) => !opts.partial || k in data;
  const str = (k: string) => String(data[k] ?? "").trim();

  if (has("employeeCode")) {
    const v = str("employeeCode");
    if (!v) e.employeeCode = "Employee code is required.";
    else if (v.length < 2 || v.length > 20) e.employeeCode = "Employee code must be 2–20 characters.";
    else if (!CODE_RE.test(v)) e.employeeCode = "Use only letters, numbers, hyphen or underscore (no spaces).";
  }
  for (const [k, label] of [["firstName", "First name"], ["lastName", "Last name"]] as const) {
    if (!has(k)) continue;
    const v = str(k);
    if (!v) e[k] = `${label} is required.`;
    else if (v.length > 50) e[k] = `${label} must be 50 characters or fewer.`;
    else if (!NAME_RE.test(v)) e[k] = `${label} can contain only letters, spaces, dots, apostrophes and hyphens.`;
  }
  if (has("email")) {
    const v = str("email");
    if (!v) e.email = "Email is required.";
    else if (!EMAIL_RE.test(v)) e.email = "Enter a valid email address, e.g. name@company.com.";
  }
  if (has("phone")) {
    const v = str("phone");
    if (!v) e.phone = "Phone number is required.";
    else if (!isValidPhone(v)) e.phone = "Enter a valid 10-digit mobile number (starting with 6–9), or an international number starting with +.";
  }
  if (has("dateOfJoining")) {
    const v = str("dateOfJoining");
    const d = new Date(v);
    if (!v) e.dateOfJoining = "Date of joining is required.";
    else if (isNaN(d.getTime())) e.dateOfJoining = "Enter a valid date of joining.";
    else {
      const max = new Date();
      max.setFullYear(max.getFullYear() + 1);
      if (d > max) e.dateOfJoining = "Date of joining can't be more than a year in the future.";
      if (d.getFullYear() < 1950) e.dateOfJoining = "Enter a valid date of joining.";
    }
  }
  if (data.gender && !(GENDERS as readonly string[]).includes(String(data.gender))) {
    e.gender = "Please select a valid gender.";
  }
  if (data.employmentType && !(EMPLOYMENT_TYPES as readonly string[]).includes(String(data.employmentType))) {
    e.employmentType = "Please select a valid employment type.";
  }
  if (data.departmentId && !OBJECT_ID_RE.test(String(data.departmentId))) {
    e.departmentId = "Please choose a department from the list.";
  }
  if (data.designation && String(data.designation).length > 80) e.designation = "Designation must be 80 characters or fewer.";

  const s = data.salary;
  if (s && typeof s === "object") {
    const fields: [string, any, string][] = [
      ["salary.basic", s.basic, "Basic"],
      ["salary.hra", s.hra, "HRA"],
      ["salary.da", s.da, "DA"],
      ["salary.specialAllowance", s.specialAllowance, "Special allowance"],
      ["salary.deductions.pf", s.deductions?.pf, "PF"],
      ["salary.deductions.esi", s.deductions?.esi, "ESI"],
      ["salary.deductions.professionalTax", s.deductions?.professionalTax, "Professional tax"],
      ["salary.deductions.tds", s.deductions?.tds, "TDS"],
    ];
    for (const [key, val, label] of fields) {
      const n = num(val);
      if (Number.isNaN(n)) e[key] = `${label} must be a number.`;
      else if (n < 0) e[key] = `${label} can't be negative.`;
      else if (n > 1e9) e[key] = `${label} is too large.`;
    }
    if (!Object.keys(e).some((k) => k.startsWith("salary."))) {
      const gross = num(s.basic) + num(s.hra) + num(s.da) + num(s.specialAllowance);
      const ded = num(s.deductions?.pf) + num(s.deductions?.esi) + num(s.deductions?.professionalTax) + num(s.deductions?.tds) + num(s.deductions?.otherDeductions);
      if (ded > gross) e["salary.deductions"] = "Total deductions can't be more than the gross salary.";
    }
  }

  if (data.createUserAccount) {
    if (!data.userRole) e.userRole = "Choose a portal role for the new login.";
    const pw = String(data.userPassword || "");
    if (pw && pw.length < 8) e.userPassword = "Password must be at least 8 characters.";
  }
  return e;
}
