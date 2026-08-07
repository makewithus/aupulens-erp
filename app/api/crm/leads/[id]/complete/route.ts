import { NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmLead from "@/models/crm/Lead";
import { requireRole } from "@/lib/crm/rbac";
import { suggestLeadCompletions } from "@/lib/crm/dataCompletion";

/**
 * On-demand AI data COMPLETION for a single lead (Native ERP AI functionality
 * #10). Returns suggested values for the lead's empty fields for a human to
 * accept — it NEVER writes them itself (the caller does that on user confirm).
 * Deliberately on-demand (not on every list/detail load) so it only costs an
 * AI call when a rep actually asks to fill gaps. Degrades to a manual-fill
 * list (suggestion: null) when AI is gated/unavailable.
 */
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const roleCheck = requireRole(session, ["lead.edit", "lead.write"]);
  if (roleCheck) return roleCheck;

  await dbConnect();
  const lead = await CrmLead.findOne({ _id: params.id, tenantId: session.user.tenantId }).lean();
  if (!lead) return NextResponse.json({ success: false }, { status: 404 });

  const result = await suggestLeadCompletions(session.user.tenantId, lead);
  return NextResponse.json({ success: true, data: result });
}
