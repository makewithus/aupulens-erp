import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import PeriodClosing from "@/models/PeriodClosing";
import {
  isValidPeriodTransition,
  PERIOD_CLOSING_STATUS,
  type PeriodClosingStatus,
} from "@/lib/constants/statuses";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const tenantId = (session.user as any).tenantId || "default-tenant";
    await dbConnect();

    const item = await PeriodClosing.findOne({ _id: id, tenantId })
      .populate("lockedBy", "name email")
      .populate("accrualsPostedBy", "name email")
      .populate("reconciledBy", "name email")
      .populate("closedBy", "name email")
      .populate("statementsGeneratedBy", "name email")
      .populate("createdBy", "name email");

    if (!item)
      return NextResponse.json({ error: "Period not found" }, { status: 404 });

    return NextResponse.json(item);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const userId = (session.user as any).id;
    const tenantId = (session.user as any).tenantId || "default-tenant";

    await dbConnect();

    const existing = await PeriodClosing.findOne({ _id: id, tenantId });
    if (!existing)
      return NextResponse.json({ error: "Period not found" }, { status: 404 });

    // ─── Status transition ───
    if (body.status && body.status !== existing.status) {
      const currentStatus = existing.status as PeriodClosingStatus;
      const nextStatus = body.status as PeriodClosingStatus;

      if (!isValidPeriodTransition(currentStatus, nextStatus)) {
        return NextResponse.json(
          {
            error: `Invalid transition: ${currentStatus} → ${nextStatus}`,
          },
          { status: 400 },
        );
      }

      // Step-specific logic
      switch (nextStatus) {
        case PERIOD_CLOSING_STATUS.LOCKED:
          body.lockedAt = new Date();
          body.lockedBy = userId;
          break;

        case PERIOD_CLOSING_STATUS.ACCRUALS_POSTED:
          body.accrualsPostedAt = new Date();
          body.accrualsPostedBy = userId;
          break;

        case PERIOD_CLOSING_STATUS.RECONCILED:
          body.reconciledAt = new Date();
          body.reconciledBy = userId;
          break;

        case PERIOD_CLOSING_STATUS.CLOSED:
          body.closedAt = new Date();
          body.closedBy = userId;
          break;

        case PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED:
          body.statementsGeneratedAt = new Date();
          body.statementsGeneratedBy = userId;
          break;

        case PERIOD_CLOSING_STATUS.OPEN:
          // Reverting – clear downstream timestamps
          body.lockedAt = null;
          body.lockedBy = null;
          break;
      }
    }

    const item = await PeriodClosing.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true },
    );

    return NextResponse.json(item);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const tenantId = (session.user as any).tenantId || "default-tenant";
    await dbConnect();

    const existing = await PeriodClosing.findOne({ _id: id, tenantId });
    if (!existing)
      return NextResponse.json({ error: "Period not found" }, { status: 404 });

    if (
      existing.status !== PERIOD_CLOSING_STATUS.OPEN
    ) {
      return NextResponse.json(
        { error: "Only open periods can be deleted" },
        { status: 400 },
      );
    }

    await PeriodClosing.findOneAndDelete({ _id: id, tenantId });
    return NextResponse.json({ message: "Period deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
