import CrmLead from "@/models/crm/Lead";

const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();
const normalizePhone = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Find an existing tenant lead by normalized email/phone, or name + company
 * when the new lead has no contact information to identify it more precisely.
 */
export async function findDuplicateLead(tenantId: string, input: Record<string, unknown>) {
  const email = normalizeEmail(input.email);
  const digits = normalizePhone(input.phone);
  const conditions: any[] = [];
  if (email) conditions.push({ email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } });
  if (digits.length >= 7) {
    conditions.push({ phone: { $regex: new RegExp(`^\\D*${digits.split("").join("\\D*")}\\D*$`) } });
  }

  let matchedBy: "email" | "phone" | "name and company" = email ? "email" : "phone";
  if (!email && digits.length < 7 && input.lead_name && input.company_name) {
    const textPattern = (value: unknown) => `^${escapeRegex(String(value).trim()).replace(/\s+/g, "\\s+")}$`;
    conditions.push({
      lead_name: { $regex: textPattern(input.lead_name), $options: "i" },
      company_name: { $regex: textPattern(input.company_name), $options: "i" },
    });
    matchedBy = "name and company";
  }
  if (!conditions.length) return { duplicate: null, matchedBy };

  const duplicate = await CrmLead.findOne({ tenantId, $or: conditions })
    .select("_id lead_name company_name email phone")
    .lean();
  if (duplicate && email && normalizeEmail(duplicate.email) === email) matchedBy = "email";
  else if (duplicate && digits.length >= 7) matchedBy = "phone";
  return { duplicate, matchedBy };
}
