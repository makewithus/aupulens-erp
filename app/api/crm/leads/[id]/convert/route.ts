import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Lead from "@/models/Lead";
import Opportunity from "@/models/Opportunity";
import {
  LEAD_STATUS,
  OPPORTUNITY_STAGE,
  normalizeProbability,
} from "@/lib/crm/workflow";
import {
  hasCrmAccess,
  normalizeFollowUps,
  normalizeNotes,
  normalizeOptionalEmail,
  normalizeOptionalString,
} from "@/lib/crm/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session || !hasCrmAccess(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenantId = session.user.tenantId || "default-tenant";
    const body = await request.json();

    await connectDB();

    const lead = await Lead.findOne({ _id: id, tenantId });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.status === LEAD_STATUS.CONVERTED) {
      return NextResponse.json(
        { error: "Lead has already been converted" },
        { status: 409 },
      );
    }

    if (lead.status !== LEAD_STATUS.QUALIFIED) {
      return NextResponse.json(
        { error: "Lead must be qualified before conversion" },
        { status: 400 },
      );
    }

    const opportunity = await Opportunity.create({
      tenantId,
      name:
        normalizeOptionalString(body.name) ||
        normalizeOptionalString(body.opportunityName) ||
        `${lead.companyName || lead.name} Opportunity`,
      companyName:
        normalizeOptionalString(body.companyName) || lead.companyName,
      contactName: normalizeOptionalString(body.contactName) || lead.name,
      email: normalizeOptionalEmail(body.email) || lead.email,
      phone: normalizeOptionalString(body.phone) || lead.phone,
      amount: Number(body.amount ?? lead.estimatedValue) || 0,
      probability: normalizeProbability(body.probability, lead.score),
      stage: body.stage || OPPORTUNITY_STAGE.QUALIFICATION,
      expectedCloseDate: body.expectedCloseDate
        ? new Date(body.expectedCloseDate)
        : lead.expectedCloseDate,
      sourceLeadId: lead._id,
      ownerId: body.ownerId || lead.ownerId || session.user.id,
      notes: [
        ...normalizeNotes(body.notes, session.user.id),
        {
          body: `Converted from lead ${lead.name}`,
          authorId: session.user.id,
          createdAt: new Date(),
        },
      ],
      followUps: normalizeFollowUps(body.followUps),
      createdBy: session.user.id,
    });

    lead.status = LEAD_STATUS.CONVERTED;
    lead.convertedOpportunityId = opportunity._id as any;
    lead.convertedAt = new Date();
    await lead.save();

    return NextResponse.json({ lead, opportunity }, { status: 201 });
  } catch (error: any) {
    console.error("CRM lead convert error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
