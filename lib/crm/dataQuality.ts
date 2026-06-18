import dbConnect from "@/lib/db";
import CrmLead from "@/models/crm/Lead";
import CrmAccount from "@/models/crm/Account";
import CrmContact from "@/models/crm/Contact";

export async function findDuplicateLeads(tenantId: string, email?: string, phone?: string) {
  await dbConnect();
  if (!email && !phone) return [];

  const query: any = { tenantId, $or: [] };
  if (email) query.$or.push({ email });
  if (phone) query.$or.push({ phone });

  return CrmLead.find(query).lean();
}

export async function validateEmail(email: string) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export async function validatePhone(phone: string) {
  const re = /^\+?[\d\s-]{7,15}$/;
  return re.test(phone);
}

export async function mergeRecords(
  entityType: "Lead" | "Account" | "Contact", 
  tenantId: string, 
  primaryId: string, 
  secondaryId: string,
  userId: string
) {
  await dbConnect();

  let Model: any;
  if (entityType === "Lead") Model = CrmLead;
  if (entityType === "Account") Model = CrmAccount;
  if (entityType === "Contact") Model = CrmContact;

  const primary = await Model.findOne({ _id: primaryId, tenantId });
  const secondary = await Model.findOne({ _id: secondaryId, tenantId });

  if (!primary || !secondary) throw new Error("Records not found");

  // Basic merge logic: preserve primary, only set fields from secondary if they are missing in primary
  const secondaryObj = secondary.toObject();
  const primaryObj = primary.toObject();

  for (const key of Object.keys(secondaryObj)) {
    if (!primaryObj[key] && secondaryObj[key]) {
      primary[key] = secondaryObj[key];
    }
  }

  // Add notes about merge
  primary.notes = (primary.notes || "") + `\nMerged with ${secondaryId} on ${new Date().toISOString()}`;
  
  await primary.save();
  await secondary.deleteOne();

  // Log in Audit
  const { default: CrmAuditLog } = await import("@/models/crm/CrmAuditLog");
  await CrmAuditLog.create({
    tenantId,
    user_id: userId,
    action: "merged",
    record_type: entityType,
    record_id: primaryId,
    old_value: secondaryId, // storing the merged ID here for tracking
    timestamp: new Date()
  });

  return primary;
}

export async function detectOrphanRecords(tenantId: string) {
  await dbConnect();
  // Example: Contacts with no Account
  const orphanContacts = await CrmContact.countDocuments({ tenantId, account_id: { $exists: false } });
  
  // Example: Opportunities with no Account
  const orphanOpps = await (await import("@/models/crm/Opportunity")).default.countDocuments({ tenantId, account_id: { $exists: false } });

  return {
    orphanContacts,
    orphanOpps
  };
}
