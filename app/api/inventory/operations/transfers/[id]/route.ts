import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import StockTransfer from "@/models/StockTransfer";
import Stock from "@/models/Stock";
import {
  DOCUMENT_STATUS,
  isValidTransition,
  type DocumentStatus,
} from "@/lib/constants/statuses";

/* ------------------------------------------------------------------ */
/*  helpers                                                           */
/* ------------------------------------------------------------------ */

/** Generate a GRN number: GRN/YYYY/NNNNN */
async function nextGRN(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await StockTransfer.countDocuments({
    tenantId,
    grnNumber: { $exists: true, $ne: null },
  });
  return `GRN/${year}/${String(count + 1).padStart(5, "0")}`;
}

/** Check available (non-reserved) stock for a product */
async function availableStock(
  productId: string,
  tenantId: string,
): Promise<number> {
  const [inResult] = await Stock.aggregate([
    {
      $match: {
        product: productId,
        tenantId,
        type: "in",
        isReserved: false,
      },
    },
    { $group: { _id: null, total: { $sum: "$quantity" } } },
  ]);
  const [outResult] = await Stock.aggregate([
    {
      $match: {
        product: productId,
        tenantId,
        type: "out",
        isReserved: false,
      },
    },
    { $group: { _id: null, total: { $sum: "$quantity" } } },
  ]);
  return (inResult?.total ?? 0) - (outResult?.total ?? 0);
}

/* ------------------------------------------------------------------ */
/*  GET  /api/inventory/operations/transfers/:id                      */
/* ------------------------------------------------------------------ */

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
    const transfer = await StockTransfer.findOne({ _id: id, tenantId })
      .populate("header.partnerId", "name")
      .populate(
        "operations_tab.productId",
        "header.name tab_general_information.default_code tab_general_information.standard_price",
      )
      .populate("chatter.authorId", "name image")
      .lean();

    if (!transfer)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ transfer });
  } catch (error) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH  /api/inventory/operations/transfers/:id                    */
/* ------------------------------------------------------------------ */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const sessionTenantIdGuard = requireTenantId(session);
    if (sessionTenantIdGuard) return sessionTenantIdGuard;
    const sessionTenantId = (session.user as any).tenantId;
    const body = await req.json();

    await connectDB();

    const existing = await StockTransfer.findOne({ _id: id, tenantId: sessionTenantId });
    if (!existing)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const tenantId = existing.tenantId;
    const opType = existing.header.operationType; // "incoming" | "outgoing"

    /* ── Sub-status-only updates (no document-status change) ─────── */

    // QC pass / fail  (incoming, while pending_approval)
    if (body.qcStatus && !body.status) {
      if (opType !== "incoming")
        return NextResponse.json(
          { error: "QC only applies to incoming receipts" },
          { status: 400 },
        );
      if (existing.status !== DOCUMENT_STATUS.PENDING_APPROVAL)
        return NextResponse.json(
          { error: "QC can only be updated while pending approval" },
          { status: 400 },
        );
      existing.qcStatus = body.qcStatus;
      if (body.qcNotes) existing.qcNotes = body.qcNotes;
      existing.chatter.push({
        authorId: session.user.id as any,
        body:
          body.qcStatus === "passed"
            ? "Quality check PASSED"
            : `Quality check FAILED${body.qcNotes ? ": " + body.qcNotes : ""}`,
        type: "notification",
        createdAt: new Date(),
      });
      await existing.save();
      const refreshed = await StockTransfer.findOne({ _id: id, tenantId }).populate(
        "chatter.authorId",
        "name image",
      );
      return NextResponse.json({ transfer: refreshed });
    }

    // Pick / Pack confirmation (outgoing, while pending_approval)
    if ((body.pickStatus || body.packStatus) && !body.status) {
      if (opType !== "outgoing")
        return NextResponse.json(
          { error: "Pick/pack only applies to outgoing deliveries" },
          { status: 400 },
        );
      if (existing.status !== DOCUMENT_STATUS.PENDING_APPROVAL)
        return NextResponse.json(
          { error: "Pick/pack can only be updated while pending approval" },
          { status: 400 },
        );
      if (body.pickStatus) {
        existing.pickStatus = body.pickStatus;
        existing.chatter.push({
          authorId: session.user.id as any,
          body: "Pick list confirmed — items picked",
          type: "notification",
          createdAt: new Date(),
        });
      }
      if (body.packStatus) {
        if (existing.pickStatus !== "picked")
          return NextResponse.json(
            { error: "Items must be picked before packing" },
            { status: 400 },
          );
        existing.packStatus = body.packStatus;
        existing.chatter.push({
          authorId: session.user.id as any,
          body: "Packing confirmed — items packed",
          type: "notification",
          createdAt: new Date(),
        });
      }
      await existing.save();
      const refreshed = await StockTransfer.findOne({ _id: id, tenantId }).populate(
        "chatter.authorId",
        "name image",
      );
      return NextResponse.json({ transfer: refreshed });
    }

    /* ── Chatter-only update ─────────────────────────────────────── */
    if (body.chatter && !body.status) {
      if (Array.isArray(body.chatter)) {
        body.chatter = body.chatter.map((msg: any) => {
          let authorId = msg.authorId;
          if (authorId && typeof authorId === "object" && authorId._id)
            authorId = authorId._id;
          else if (!authorId) authorId = session.user.id as any;
          return {
            body: msg.body,
            type: msg.type,
            createdAt: msg.createdAt,
            authorId,
          };
        });
      }
      const updated = await StockTransfer.findOneAndUpdate(
        { _id: id, tenantId },
        { $set: { chatter: body.chatter } },
        { new: true },
      ).populate("chatter.authorId", "name image");
      return NextResponse.json({ transfer: updated });
    }

    /* ── General field update (no status change) ─────────────────── */
    if (!body.status) {
      // Process chatter authorIds if included
      if (body.chatter && Array.isArray(body.chatter)) {
        body.chatter = body.chatter.map((msg: any) => {
          let authorId = msg.authorId;
          if (authorId && typeof authorId === "object" && authorId._id)
            authorId = authorId._id;
          else if (!authorId) authorId = session.user.id as any;
          return {
            body: msg.body,
            type: msg.type,
            createdAt: msg.createdAt,
            authorId,
          };
        });
      }
      const updated = await StockTransfer.findOneAndUpdate(
        { _id: id, tenantId },
        { $set: body },
        { new: true },
      ).populate("chatter.authorId", "name image");
      return NextResponse.json({ transfer: updated });
    }

    /* ================================================================
     *  STATUS TRANSITION — enforce sequencing
     * ================================================================ */
    const newStatus = body.status as DocumentStatus;

    if (!isValidTransition(existing.status as DocumentStatus, newStatus)) {
      return NextResponse.json(
        {
          error: `Cannot move from "${existing.status}" to "${newStatus}"`,
        },
        { status: 400 },
      );
    }

    /* -------------------------------------------------------------- */
    /*  INCOMING  (Stock Inward: Procure → Stock)                     */
    /*  draft → pending_approval → approved → posted → closed         */
    /* -------------------------------------------------------------- */
    if (opType === "incoming") {
      /* ① draft → pending_approval  (Goods Received — start QC) */
      if (
        newStatus === DOCUMENT_STATUS.PENDING_APPROVAL &&
        existing.status === DOCUMENT_STATUS.DRAFT
      ) {
        existing.status = DOCUMENT_STATUS.PENDING_APPROVAL;
        existing.qcStatus = "pending";
        existing.chatter.push({
          authorId: session.user.id as any,
          body: "Goods received — Quality Check initiated",
          type: "notification",
          createdAt: new Date(),
        });
      }

      /* ② pending_approval → approved  (QC passed → generate GRN) */
      else if (
        newStatus === DOCUMENT_STATUS.APPROVED &&
        existing.status === DOCUMENT_STATUS.PENDING_APPROVAL
      ) {
        if (existing.qcStatus !== "passed") {
          return NextResponse.json(
            {
              error:
                "QC must pass before GRN can be created. Current QC status: " +
                existing.qcStatus,
            },
            { status: 400 },
          );
        }
        existing.status = DOCUMENT_STATUS.APPROVED;
        existing.grnNumber = await nextGRN(tenantId);
        existing.grnDate = new Date();
        existing.chatter.push({
          authorId: session.user.id as any,
          body: `GRN created: ${existing.grnNumber}`,
          type: "notification",
          createdAt: new Date(),
        });
      }

      /* ③ approved → posted  (Update stock — actual IN moves) */
      else if (
        newStatus === DOCUMENT_STATUS.POSTED &&
        existing.status === DOCUMENT_STATUS.APPROVED
      ) {
        const moves = existing.operations_tab.map((op: any) => ({
          product: op.productId,
          quantity: op.done > 0 ? op.done : op.demand,
          type: "in" as const,
          reference: existing.header.name,
          isReserved: false,
          tenantId,
          createdBy: session.user.id as any,
        }));
        if (moves.length > 0) await Stock.insertMany(moves);

        existing.status = DOCUMENT_STATUS.POSTED;
        existing.chatter.push({
          authorId: session.user.id as any,
          body: `Stock updated — ${moves.length} product(s) received into inventory`,
          type: "notification",
          createdAt: new Date(),
        });
      }

      /* ④ posted → closed  (Notify Finance) */
      else if (
        newStatus === DOCUMENT_STATUS.CLOSED &&
        existing.status === DOCUMENT_STATUS.POSTED
      ) {
        existing.status = DOCUMENT_STATUS.CLOSED;
        existing.financeNotified = true;
        existing.chatter.push({
          authorId: session.user.id as any,
          body: "Finance notified — receipt closed",
          type: "notification",
          createdAt: new Date(),
        });
      } else {
        return NextResponse.json(
          { error: `Invalid incoming flow transition: ${existing.status} → ${newStatus}` },
          { status: 400 },
        );
      }
    }

    /* -------------------------------------------------------------- */
    /*  OUTGOING  (Stock Outward: Order → Dispatch)                   */
    /*  draft → pending_approval → approved → posted → closed         */
    /* -------------------------------------------------------------- */
    else if (opType === "outgoing") {
      /* ① draft → pending_approval  (Check inventory + reserve + pick list) */
      if (
        newStatus === DOCUMENT_STATUS.PENDING_APPROVAL &&
        existing.status === DOCUMENT_STATUS.DRAFT
      ) {
        // Check availability for every line
        const shortages: string[] = [];
        for (const op of existing.operations_tab) {
          const avail = await availableStock(
            op.productId.toString(),
            tenantId,
          );
          if (avail < op.demand) {
            shortages.push(
              `Product ${op.productId}: need ${op.demand}, available ${avail}`,
            );
          }
        }

        if (shortages.length > 0) {
          // Create back-order flag but still allow to proceed
          existing.backorderCreated = true;
          existing.chatter.push({
            authorId: session.user.id as any,
            body: `Inventory shortages detected (back-order flagged):\n${shortages.join("\n")}`,
            type: "notification",
            createdAt: new Date(),
          });
        }

        // Create reservations
        const reservations = existing.operations_tab.map((op: any) => ({
          product: op.productId,
          quantity: op.demand,
          type: "out" as const,
          reference: `${existing.header.name} (Reserved)`,
          isReserved: true,
          tenantId,
          createdBy: session.user.id as any,
        }));
        if (reservations.length > 0) await Stock.insertMany(reservations);

        existing.status = DOCUMENT_STATUS.PENDING_APPROVAL;
        existing.inventoryChecked = true;
        existing.pickStatus = "pending";
        existing.packStatus = "pending";
        existing.chatter.push({
          authorId: session.user.id as any,
          body: "Inventory checked — stock reserved — pick list generated",
          type: "notification",
          createdAt: new Date(),
        });
      }

      /* ② pending_approval → approved  (Pick + Pack confirmed) */
      else if (
        newStatus === DOCUMENT_STATUS.APPROVED &&
        existing.status === DOCUMENT_STATUS.PENDING_APPROVAL
      ) {
        if (existing.pickStatus !== "picked") {
          return NextResponse.json(
            { error: "Items must be picked before approval" },
            { status: 400 },
          );
        }
        if (existing.packStatus !== "packed") {
          return NextResponse.json(
            { error: "Items must be packed before approval" },
            { status: 400 },
          );
        }
        existing.status = DOCUMENT_STATUS.APPROVED;
        existing.chatter.push({
          authorId: session.user.id as any,
          body: "Pick & Pack confirmed — ready for dispatch",
          type: "notification",
          createdAt: new Date(),
        });
      }

      /* ③ approved → posted  (Dispatch) */
      else if (
        newStatus === DOCUMENT_STATUS.POSTED &&
        existing.status === DOCUMENT_STATUS.APPROVED
      ) {
        existing.status = DOCUMENT_STATUS.POSTED;
        existing.dispatchStatus = "dispatched";
        existing.dispatchDate = new Date();
        existing.chatter.push({
          authorId: session.user.id as any,
          body: "Order dispatched",
          type: "notification",
          createdAt: new Date(),
        });
      }

      /* ④ posted → closed  (Remove reservations + actual stock OUT) */
      else if (
        newStatus === DOCUMENT_STATUS.CLOSED &&
        existing.status === DOCUMENT_STATUS.POSTED
      ) {
        // Remove reservations
        await Stock.deleteMany({
          reference: `${existing.header.name} (Reserved)`,
          isReserved: true,
          tenantId,
        });

        // Create actual stock out moves
        const moves = existing.operations_tab.map((op: any) => ({
          product: op.productId,
          quantity: op.done > 0 ? op.done : op.demand,
          type: "out" as const,
          reference: existing.header.name,
          isReserved: false,
          tenantId,
          createdBy: session.user.id as any,
        }));
        if (moves.length > 0) await Stock.insertMany(moves);

        existing.status = DOCUMENT_STATUS.CLOSED;
        existing.chatter.push({
          authorId: session.user.id as any,
          body: `Stock reduced — ${moves.length} product(s) dispatched. Delivery closed.`,
          type: "notification",
          createdAt: new Date(),
        });
      } else {
        return NextResponse.json(
          { error: `Invalid outgoing flow transition: ${existing.status} → ${newStatus}` },
          { status: 400 },
        );
      }
    }

    /* ---- internal transfers — simple pass-through ---- */
    else {
      existing.status = newStatus;
    }

    await existing.save();

    if (existing.status === DOCUMENT_STATUS.POSTED && existing.header.operationType === "incoming") {
      try {
        const { matchStockTransferToPO } = await import("@/lib/accounting/matching");
        await matchStockTransferToPO(String(existing._id), tenantId);
      } catch (matchError) {
        console.error("Auto-matching failed on stock transfer save:", matchError);
      }
    }

    const refreshed = await StockTransfer.findOne({ _id: id, tenantId })
      .populate("chatter.authorId", "name image")
      .populate("operations_tab.productId", "header.name");
    return NextResponse.json({ transfer: refreshed });
  } catch (error: any) {
    console.error("Update Transfer Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE  /api/inventory/operations/transfers/:id                   */
/* ------------------------------------------------------------------ */

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
    const deleted = await StockTransfer.findOneAndDelete({ _id: id, tenantId });
    if (!deleted)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ message: "Deleted" });
  } catch (e) {
    return NextResponse.json({ error: "Delete Failed" }, { status: 500 });
  }
}
