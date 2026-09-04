import connectDB from "@/lib/db";
import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import Employee from "@/models/hr/Employee";
import { nameSimilarity } from "@/lib/aiRuntime/relatedParty/detectRelatedParties";

/**
 * AI-19's employee/vendor collision detection (docs/ai/BRIEF-08a-BATCH-G.md, AI-19 detection set
 * item 4) — closes AI-15's `vendor_shares_bank_or_address_with_employee` detector honestly.
 * `docs/ai/SYSTEM_INVENTORY.md`'s 0.3 investigation confirmed `Customer` (the real AP "vendor"
 * model) has no bank-account or address field at all, so bank/address matching against
 * `Employee.bankDetails`/`.address` is structurally impossible — never guessed. What **is** real
 * on both sides: name and email. A vendor record whose name/email closely matches a real
 * employee's is the honest, buildable version of this check — the classic shell-vendor /
 * conflict-of-interest signal, even without bank data.
 */

const NAME_MATCH_THRESHOLD = 0.7;

export interface EmployeeCollision {
  vendorId: string;
  employeeId: string;
  matchedOn: string[];
}

export async function findEmployeeVendorCollisions(tenantId: string): Promise<EmployeeCollision[]> {
  await connectDB();
  const vendorIds = (await Invoice.distinct("partnerId", { tenantId, moveType: "in_invoice" })).map(String);
  if (vendorIds.length === 0) return [];

  const [vendors, employees] = await Promise.all([
    Customer.find({ tenantId, _id: { $in: vendorIds } }).select("header contact_details").lean(),
    Employee.find({ tenantId }).select("firstName lastName email").lean(),
  ]);

  const collisions: EmployeeCollision[] = [];
  for (const v of vendors) {
    const header = (v as { header?: { name?: string; displayName?: string } }).header;
    const vendorName = header?.displayName || header?.name || "";
    const vendorEmail = ((v as { contact_details?: { email?: string } }).contact_details?.email || "").toLowerCase();

    for (const e of employees) {
      const employeeName = `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim();
      const matchedOn: string[] = [];
      if (vendorEmail && e.email && vendorEmail === String(e.email).toLowerCase()) matchedOn.push("email");
      if (vendorName && employeeName && nameSimilarity(vendorName, employeeName) >= NAME_MATCH_THRESHOLD) matchedOn.push("name_similarity");
      if (matchedOn.length > 0) collisions.push({ vendorId: String(v._id), employeeId: String(e._id), matchedOn });
    }
  }
  return collisions;
}
