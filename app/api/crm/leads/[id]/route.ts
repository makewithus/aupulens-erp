import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Lead from "@/models/Lead";
import {
  LEAD_STATUS,
  isValidLeadTransition,
  normalizeProbability,
  type LeadStatus,
} from "@/lib/crm/workflow";
import {
  hasCrmAccess,
  normalizeFollowUps,
  normalizeNotes,
  normalizeOptionalEmail,
  normalizeOptionalString,
} from "@/lib/crm/api";

export async function GET(
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
    await connectDB();

    const lead = await Lead.findOne({ _id: id, tenantId })
      .populate("ownerId", "name email")
      .populate("convertedOpportunityId", "name stage amount")
      .populate("convertedCustomerId", "header.name contact_details.email")
      .lean();

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ lead });
  } catch (error: any) {
    console.error("CRM lead GET error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
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

    const existing = await Lead.findOne({ _id: id, tenantId });
    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const update: Record<string, any> = {};
    const push: Record<string, any> = {};
    if (body.name !== undefined) {
      const name = normalizeOptionalString(body.name);
      if (!name) {
        return NextResponse.json(
          { error: "Lead name is required" },
          { status: 400 },
        );
      }
      update.name = name;
    }
    if (body.companyName !== undefined) {
      update.companyName = normalizeOptionalString(body.companyName);
    }
    if (body.email !== undefined) {
      update.email = normalizeOptionalEmail(body.email);
    }
    if (body.phone !== undefined) {
      update.phone = normalizeOptionalString(body.phone);
    }
    if (body.source !== undefined) {
      update.source = normalizeOptionalString(body.source);
    }
    if (body.score !== undefined) {
      update.score = normalizeProbability(body.score, existing.score);
    }
    if (body.estimatedValue !== undefined) {
      update.estimatedValue = Number(body.estimatedValue) || 0;
    }
    if (body.expectedCloseDate !== undefined) {
      update.expectedCloseDate = body.expectedCloseDate
        ? new Date(body.expectedCloseDate)
        : undefined;
    }
    if (body.ownerId !== undefined) update.ownerId = body.ownerId || undefined;

    if (body.status && body.status !== existing.status) {
      const nextStatus = body.status as LeadStatus;
      if (!isValidLeadTransition(existing.status, nextStatus)) {
        return NextResponse.json(
          {
            error: `Invalid lead transition from "${existing.status}" to "${nextStatus}"`,
          },
          { status: 400 },
        );
      }

      if (nextStatus === LEAD_STATUS.CONVERTED) {
        return NextResponse.json(
          { error: "Use the lead conversion endpoint to convert leads" },
          { status: 400 },
        );
      }

      update.status = nextStatus;
    }

    if (body.note) {
      push.notes = {
        body: String(body.note).trim(),
        authorId: session.user.id,
        createdAt: new Date(),
      };
    }

    if (body.notes !== undefined) {
      update.notes = normalizeNotes(body.notes, session.user.id);
    }
    if (body.followUps !== undefined) {
      update.followUps = normalizeFollowUps(body.followUps);
    }

    const lead = await Lead.findOneAndUpdate(
      { _id: id, tenantId },
      Object.keys(push).length
        ? { $set: update, $push: push }
        : { $set: update },
      { new: true, runValidators: true },
    );

    return NextResponse.json({ lead });
  } catch (error: any) {
    console.error("CRM lead PATCH error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
    await connectDB();

    const lead = await Lead.findOneAndDelete({
      _id: id,
      tenantId,
      status: { $ne: LEAD_STATUS.CONVERTED },
    });

    if (!lead) {
      return NextResponse.json(
        { error: "Lead not found or already converted" },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: "Lead deleted successfully" });
  } catch (error: any) {
    console.error("CRM lead DELETE error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
