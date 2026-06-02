import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import StockMove from "@/models/StockMove";
import Stock from "@/models/Stock";
import { postStockMoveAccounting } from "@/lib/accounting/inventory";
import {
  STOCK_MOVE_STATUS,
  isValidStockMoveTransition,
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
    await connectDB();

    const move = await StockMove.findOne({ _id: id, tenantId })
      .populate("sourceLocation.warehouseId", "name warehouseCode location")
      .populate(
        "destinationLocation.warehouseId",
        "name warehouseCode location",
      )
      .populate("lines.productId", "header.name tab_general_information")
      .populate("responsibleId", "name email")
      .lean();

    if (!move) {
      return NextResponse.json(
        { error: "Stock move not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ item: move });
  } catch (error: any) {
    console.error("Error fetching stock move:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
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
    const sessionTenantId = (session.user as any).tenantId || "default-tenant";
    const body = await req.json();
    await connectDB();

    const existing = await StockMove.findOne({ _id: id, tenantId: sessionTenantId }).lean();
    if (!existing) {
      return NextResponse.json(
        { error: "Stock move not found" },
        { status: 404 },
      );
    }

    // ── Move status transition validation ──
    if (body.moveStatus) {
      const currentStatus = (existing as any).moveStatus;
      if (!isValidStockMoveTransition(currentStatus, body.moveStatus)) {
        return NextResponse.json(
          {
            error: `Invalid transition from "${currentStatus}" to "${body.moveStatus}"`,
          },
          { status: 400 },
        );
      }

      // ── Source Validated: verify source warehouse exists ──
      if (body.moveStatus === STOCK_MOVE_STATUS.SOURCE_VALIDATED) {
        const srcWh = (existing as any).sourceLocation?.warehouseId;
        if (
          !srcWh &&
          (existing as any).moveType !== "incoming" &&
          (existing as any).moveType !== "adjustment"
        ) {
          return NextResponse.json(
            { error: "Source warehouse is required for this move type" },
            { status: 400 },
          );
        }
      }

      // ── Destination Assigned: verify destination warehouse ──
      if (body.moveStatus === STOCK_MOVE_STATUS.DESTINATION_ASSIGNED) {
        const destWh =
          body.destinationLocation?.warehouseId ||
          (existing as any).destinationLocation?.warehouseId;
        if (
          !destWh &&
          (existing as any).moveType !== "outgoing" &&
          (existing as any).moveType !== "adjustment"
        ) {
          return NextResponse.json(
            {
              error: "Destination warehouse is required for this move type",
            },
            { status: 400 },
          );
        }
      }

      // ── Move Executed: set effective date, update done qty ──
      if (body.moveStatus === STOCK_MOVE_STATUS.MOVE_EXECUTED) {
        body.effectiveDate = new Date();

        // Auto-set done = demand for all lines if not explicitly provided
        const lines = (existing as any).lines || [];
        const updatedLines = lines.map((line: any) => ({
          ...line,
          done: line.done > 0 ? line.done : line.demand,
        }));
        body.lines = updatedLines;

        // Create stock entries for source (out) and destination (in)
        const tenantId = (existing as any).tenantId;
        const moveType = (existing as any).moveType;

        for (const line of updatedLines) {
          const qty = line.done || line.demand;

          // Outgoing from source
          if (moveType === "internal" || moveType === "outgoing") {
            await new Stock({
              product: line.productId,
              quantity: -qty,
              type: "out",
              reference: (existing as any).reference,
              warehouse: (existing as any).sourceLocation?.warehouseName || "",
              notes: `Stock move ${(existing as any).reference} - source deduction`,
              tenantId,
              createdBy: session.user.id,
            }).save();
          }

          // Incoming to destination
          if (moveType === "internal" || moveType === "incoming") {
            await new Stock({
              product: line.productId,
              quantity: qty,
              type: "in",
              reference: (existing as any).reference,
              warehouse:
                (existing as any).destinationLocation?.warehouseName || "",
              notes: `Stock move ${(existing as any).reference} - destination receipt`,
              tenantId,
              createdBy: session.user.id,
            }).save();
          }

          // Adjustment: create a single adjustment entry
          if (moveType === "adjustment") {
            await new Stock({
              product: line.productId,
              quantity: qty,
              type: "adjustment",
              reference: (existing as any).reference,
              notes: `Inventory adjustment ${(existing as any).reference}`,
              tenantId,
              createdBy: session.user.id,
            }).save();
          }
        }

        // Add chatter
        body.chatter = [
          ...((existing as any).chatter || []),
          {
            authorId: session.user.id,
            body: `Move executed — stock entries created`,
            type: "notification",
            createdAt: new Date(),
          },
        ];
      }

      // ── Valuation Updated: recalculate total value ──
      if (body.moveStatus === STOCK_MOVE_STATUS.VALUATION_UPDATED) {
        const lines = body.lines || (existing as any).lines || [];
        const totalValue = lines.reduce(
          (sum: number, l: any) =>
            sum + (l.done || l.demand) * (l.unitCost || 0),
          0,
        );
        body.valuation = {
          ...(existing as any).valuation,
          totalValue,
          updatedAt: new Date(),
        };

        body.chatter = [
          ...((existing as any).chatter || []),
          {
            authorId: session.user.id,
            body: `Valuation updated — total: ₹${totalValue.toLocaleString()}`,
            type: "notification",
            createdAt: new Date(),
          },
        ];
      }

      // ── Accounting Created: record journal reference ──
      if (body.moveStatus === STOCK_MOVE_STATUS.ACCOUNTING_CREATED) {
        const accountingResult = await postStockMoveAccounting({
          move: {
            ...existing,
            lines: body.lines || (existing as any).lines || [],
            valuation: body.valuation || (existing as any).valuation,
          },
          tenantId: (existing as any).tenantId,
        });

        body.accounting = {
          ...(existing as any).accounting,
          ...body.accounting,
          journalEntryId: accountingResult.journalEntryId,
          debitAccount: accountingResult.debitAccount,
          creditAccount: accountingResult.creditAccount,
          createdAt: new Date(),
        };

        body.chatter = [
          ...((existing as any).chatter || []),
          {
            authorId: session.user.id,
            body: `Accounting entry created`,
            type: "notification",
            createdAt: new Date(),
          },
        ];
      }
    }

    const move = await StockMove.findOneAndUpdate(
      { _id: id, tenantId: sessionTenantId },
      { $set: body },
      { new: true, runValidators: true },
    );

    if (move && body.moveStatus === STOCK_MOVE_STATUS.MOVE_EXECUTED) {
      try {
        const { matchStockMoveToPO } = await import("@/lib/accounting/matching");
        await matchStockMoveToPO(String(move._id), sessionTenantId);
      } catch (matchError) {
        console.error("Auto-matching failed on stock move execution:", matchError);
      }
    }

    return NextResponse.json({ item: move });
  } catch (error: any) {
    console.error("Error updating stock move:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
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
    await connectDB();

    const move = await StockMove.findOneAndDelete({
      _id: id,
      tenantId,
      moveStatus: {
        $in: [STOCK_MOVE_STATUS.REQUESTED, STOCK_MOVE_STATUS.CANCELLED],
      },
    });

    if (!move) {
      return NextResponse.json(
        { error: "Move not found or cannot be deleted in current status" },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: "Stock move deleted" });
  } catch (error: any) {
    console.error("Error deleting stock move:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
