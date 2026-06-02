import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/Customer";
import Opportunity from "@/models/Opportunity";
import {
  OPPORTUNITY_STAGE,
  isValidOpportunityTransition,
  normalizeProbability,
  type OpportunityStage,
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

    const opportunity = await Opportunity.findOne({ _id: id, tenantId })
      .populate("ownerId", "name email")
      .populate("sourceLeadId", "name companyName email")
      .populate("customerId", "header.name contact_details.email")
      .lean();

    if (!opportunity) {
      return NextResponse.json(
        { error: "Opportunity not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ opportunity });
  } catch (error: any) {
    console.error("CRM opportunity GET error:", error);
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

    const existing = await Opportunity.findOne({ _id: id, tenantId });
    if (!existing) {
      return NextResponse.json(
        { error: "Opportunity not found" },
        { status: 404 },
      );
    }

    const update: Record<string, any> = {};
    const push: Record<string, any> = {};

    if (body.name !== undefined) {
      const name = normalizeOptionalString(body.name);
      if (!name) {
        return NextResponse.json(
          { error: "Opportunity name is required" },
          { status: 400 },
        );
      }
      update.name = name;
    }
    if (body.companyName !== undefined) {
      update.companyName = normalizeOptionalString(body.companyName);
    }
    if (body.contactName !== undefined) {
      update.contactName = normalizeOptionalString(body.contactName);
    }
    if (body.email !== undefined) {
      update.email = normalizeOptionalEmail(body.email);
    }
    if (body.phone !== undefined) {
      update.phone = normalizeOptionalString(body.phone);
    }
    if (body.amount !== undefined) update.amount = Number(body.amount) || 0;
    if (body.probability !== undefined) {
      update.probability = normalizeProbability(
        body.probability,
        existing.probability,
      );
    }
    if (body.expectedCloseDate !== undefined) {
      update.expectedCloseDate = body.expectedCloseDate
        ? new Date(body.expectedCloseDate)
        : undefined;
    }
    if (body.ownerId !== undefined) update.ownerId = body.ownerId || undefined;

    if (body.customerId !== undefined) {
      if (body.customerId) {
        const customer = await Customer.exists({
          _id: body.customerId,
          tenantId,
        });
        if (!customer) {
          return NextResponse.json(
            { error: "Customer not found for this tenant" },
            { status: 404 },
          );
        }
      }
      update.customerId = body.customerId || undefined;
    }

    if (body.stage && body.stage !== existing.stage) {
      const nextStage = body.stage as OpportunityStage;
      if (!isValidOpportunityTransition(existing.stage, nextStage)) {
        return NextResponse.json(
          {
            error: `Invalid opportunity transition from "${existing.stage}" to "${nextStage}"`,
          },
          { status: 400 },
        );
      }

      if (
        nextStage === OPPORTUNITY_STAGE.WON &&
        !body.customerId &&
        !existing.customerId
      ) {
        return NextResponse.json(
          {
            error:
              "Use the opportunity conversion endpoint to mark opportunities as won and create/link a customer",
          },
          { status: 400 },
        );
      }

      update.stage = nextStage;
      if (nextStage === OPPORTUNITY_STAGE.WON) {
        update.probability = 100;
        update.convertedAt = new Date();
      }
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

    const opportunity = await Opportunity.findOneAndUpdate(
      { _id: id, tenantId },
      Object.keys(push).length
        ? { $set: update, $push: push }
        : { $set: update },
      { new: true, runValidators: true },
    );

    return NextResponse.json({ opportunity });
  } catch (error: any) {
    console.error("CRM opportunity PATCH error:", error);
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

    const opportunity = await Opportunity.findOneAndDelete({
      _id: id,
      tenantId,
      stage: { $ne: OPPORTUNITY_STAGE.WON },
    });

    if (!opportunity) {
      return NextResponse.json(
        { error: "Opportunity not found or already won" },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: "Opportunity deleted successfully" });
  } catch (error: any) {
    console.error("CRM opportunity DELETE error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
