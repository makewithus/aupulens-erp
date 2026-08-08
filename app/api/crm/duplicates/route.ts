import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { detectDuplicatesWithAi } from "@/lib/crm/ai/duplicateAssistant";
import CrmLead from "@/models/crm/Lead";
import CrmContact from "@/models/crm/Contact";
import CrmAccount from "@/models/crm/Account";

/**
 * On-demand duplicate detection assistance.
 *
 * The AI fuzzy dedup was removed from the create path (it was blocking and slow);
 * this exposes the same engine as an explicit, non-blocking check a page/button
 * can call — so create stays instant AND duplicate assistance is available.
 * Read-only: it only reports likely duplicates; it never merges or deletes.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  if (!session || !tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { entityType, record } = await req.json();
  if (!record || typeof record !== "object") {
    return NextResponse.json({ success: false, message: "A record object is required" }, { status: 400 });
  }

  await dbConnect();
  const type = entityType === "Account" ? "Account" : entityType === "Contact" ? "Contact" : "Lead";
  const model: any = type === "Account" ? CrmAccount : type === "Contact" ? CrmContact : CrmLead;
  const proj = type === "Account"
    ? "company_name website"
    : "lead_name first_name last_name email phone company_name";

  // Bounded candidate set — targeted on shared fields, then recent as a net.
  const or: any[] = [];
  if (record.email) or.push({ email: record.email });
  if (record.phone) or.push({ phone: record.phone });
  if (record.company_name) or.push({ company_name: record.company_name });
  const candidates = or.length
    ? await model.find({ tenantId, $or: or }, proj).limit(50).lean()
    : await model.find({ tenantId }, proj).sort({ createdAt: -1 }).limit(50).lean();

  const { aiUsed, duplicates } = await detectDuplicatesWithAi(tenantId, record, candidates, type);
  const matches = duplicates.map((d) => ({
    ...d,
    record: candidates.find((c: any) => String(c._id) === String(d.recordId)) || null,
  }));

  return NextResponse.json({ success: true, aiUsed, duplicates: matches });
}
