import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { draftFollowUpMessage } from "@/lib/crm/ai/followUpMessage";
import { sanitizeForAi } from "@/lib/ai/sanitizeContext";
import CrmLead from "@/models/crm/Lead";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmAccount from "@/models/crm/Account";

/**
 * Suggested follow-up message — drafts (never sends) a follow-up for a Lead /
 * Opportunity / Account. Read-only: it returns text for the user to review and
 * send themselves.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  if (!session || !tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { entityType, entityId, channel, tone } = await req.json();
  if (!entityType || !entityId) {
    return NextResponse.json({ success: false, message: "entityType and entityId are required" }, { status: 400 });
  }

  await dbConnect();
  let doc: any = null;
  if (entityType === "Lead") doc = await CrmLead.findOne({ _id: entityId, tenantId }).lean();
  else if (entityType === "Opportunity") doc = await CrmOpportunity.findOne({ _id: entityId, tenantId }).lean();
  else if (entityType === "Account") doc = await CrmAccount.findOne({ _id: entityId, tenantId }).lean();
  else return NextResponse.json({ success: false, message: `Unsupported entityType: ${entityType}` }, { status: 400 });

  if (!doc) return NextResponse.json({ success: false, message: `${entityType} not found` }, { status: 404 });

  const context = sanitizeForAi(doc) as Record<string, unknown>;
  const result = await draftFollowUpMessage({ tenantId, entityType, context, channel, tone });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, message: result.gated ? "AI is disabled or over the monthly cap for this workspace." : "Couldn't draft a message right now." },
      { status: result.gated ? 403 : 502 },
    );
  }
  return NextResponse.json({ success: true, message: result.message });
}
