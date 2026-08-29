import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import ManufacturingOrder from "@/models/manufacturing/ManufacturingOrder";
import Stock from "@/models/inventory/Stock";
import {
  DOCUMENT_STATUS,
  PRODUCTION_STATUS,
  isValidProductionTransition,
  type ProductionStatus,
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
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();
    const order = await ManufacturingOrder.findOne({ _id: id, tenantId })
      .populate("header.productId", "header.name")
      .populate("components_tab.productId", "header.name")
      .populate("chatter.authorId", "name image")
      .lean();
    if (!order)
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    return NextResponse.json({ order });
  } catch (e) {
    return NextResponse.json({ error: "Error" }, { status: 500 });
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
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    await connectDB();

    const existing = await ManufacturingOrder.findOne({ _id: id, tenantId }).lean();
    if (!existing)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // ── Process chatter ────────────────────────────────────────
    if (body.chatter && Array.isArray(body.chatter)) {
      body.chatter = body.chatter.map((msg: any) => {
        let authorId = msg.authorId;
        if (authorId && typeof authorId === "object" && authorId._id) {
          authorId = authorId._id;
        } else if (!authorId) {
          authorId = session.user.id;
        }
        return {
          body: msg.body,
          type: msg.type,
          createdAt: msg.createdAt,
          authorId,
        };
      });
    }

    // ── Plan-to-Produce flow transition ────────────────────────
    if (body.productionStatus && body.productionStatus !== existing.productionStatus) {
      const nextStatus = body.productionStatus as ProductionStatus;
      const currentStatus = (existing.productionStatus ||
        PRODUCTION_STATUS.DEMAND_FORECAST) as ProductionStatus;

      if (!isValidProductionTransition(currentStatus, nextStatus)) {
        return NextResponse.json(
          {
            error: `Invalid production transition: ${currentStatus} → ${nextStatus}`,
          },
          { status: 400 },
        );
      }

      // Add chatter entry for the transition
      const transitionMsg = {
        authorId: session.user.id,
        body: `Production status changed: ${currentStatus} → ${nextStatus}`,
        type: "notification" as const,
        createdAt: new Date(),
      };
      body.chatter = [...(body.chatter || existing.chatter || []), transitionMsg];

      // ── Material Reserved ──
      if (nextStatus === PRODUCTION_STATUS.MATERIAL_RESERVED) {
        body.materialReservation = {
          ...(body.materialReservation || {}),
          reservedAt: new Date(),
          reservedBy: session.user.id,
          isFullyReserved: body.materialReservation?.isFullyReserved ?? true,
        };
      }

      // ── Material Issued — consume raw materials from stock ──
      if (nextStatus === PRODUCTION_STATUS.MATERIAL_ISSUED) {
        body.materialIssue = {
          issuedAt: new Date(),
          issuedBy: session.user.id,
        };
        // Create stock-out moves for each component
        const outMoves: any[] = [];
        const components = existing.components_tab || [];
        components.forEach((comp: any) => {
          const qty = comp.toConsume || 0;
          if (qty > 0) {
            outMoves.push({
              product: comp.productId,
              quantity: qty,
              type: "out",
              reference: existing.header.name,
              notes: "Manufacturing – Raw Material Issued",
              tenantId: existing.tenantId,
              createdBy: session.user.id,
            });
          }
        });
        if (outMoves.length > 0) {
          await Stock.insertMany(outMoves);
        }
      }

      // ── Rework — increment counter ──
      if (nextStatus === PRODUCTION_STATUS.REWORK) {
        body.reworkCount = (existing.reworkCount || 0) + 1;
      }

      // ── QC Passed ──
      if (nextStatus === PRODUCTION_STATUS.QC_PASSED) {
        body.qcDetails = {
          ...(existing.qcDetails || {}),
          ...(body.qcDetails || {}),
          result: "passed",
          inspectedAt: new Date(),
          inspectedBy: session.user.id,
        };
      }

      // ── QC Failed ──
      if (nextStatus === PRODUCTION_STATUS.QC_FAILED) {
        body.qcDetails = {
          ...(existing.qcDetails || {}),
          ...(body.qcDetails || {}),
          result: "failed",
          inspectedAt: new Date(),
          inspectedBy: session.user.id,
        };
      }

      // ── Finished Goods — produce into stock ──
      if (nextStatus === PRODUCTION_STATUS.FINISHED) {
        body.finishedAt = new Date();
        body.status = DOCUMENT_STATUS.CLOSED; // close the document too
        const inMove = {
          product: existing.header.productId,
          quantity: existing.header.quantity,
          type: "in",
          reference: existing.header.name,
          notes: "Manufacturing – Finished Goods Produced",
          tenantId: existing.tenantId,
          createdBy: session.user.id,
        };
        await Stock.insertMany([inMove]);
      }

      // ── Cancelled ──
      if (nextStatus === PRODUCTION_STATUS.CANCELLED) {
        body.status = DOCUMENT_STATUS.CANCELLED;
      }
    }

    // ── Legacy document-level close (backward-compat) ──────────
    if (
      body.status === DOCUMENT_STATUS.CLOSED &&
      existing.status !== DOCUMENT_STATUS.CLOSED &&
      !body.productionStatus // skip if already handled above
    ) {
      const moves: any[] = [];
      moves.push({
        product: existing.header.productId,
        quantity: existing.header.quantity,
        type: "in",
        reference: existing.header.name,
        notes: "Manufacturing Production",
        tenantId: existing.tenantId,
        createdBy: session.user.id,
      });
      if (existing.components_tab && existing.components_tab.length > 0) {
        existing.components_tab.forEach((comp: any) => {
          const consumed = comp.consumed > 0 ? comp.consumed : comp.toConsume;
          if (consumed > 0) {
            moves.push({
              product: comp.productId,
              quantity: consumed,
              type: "out",
              reference: existing.header.name,
              notes: "Manufacturing Consumption",
              tenantId: existing.tenantId,
              createdBy: session.user.id,
            });
          }
        });
      }
      if (moves.length > 0) {
        await Stock.insertMany(moves);
      }
    }

    const updated = await ManufacturingOrder.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true },
    ).populate("chatter.authorId", "name image");
    return NextResponse.json({ order: updated });
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
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();
    const deleted = await ManufacturingOrder.findOneAndDelete({ _id: id, tenantId });
    if (!deleted)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ message: "Deleted" });
  } catch (e) {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
