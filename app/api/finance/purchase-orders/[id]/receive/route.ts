import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import StockTransfer from "@/models/inventory/StockTransfer";
import Stock from "@/models/inventory/Stock";
import Product from "@/models/inventory/Product";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";
import Invoice from "@/models/finance/Invoice";
import { runPOMatching } from "@/lib/accounting/matching";
import { validateObjectId } from "@/lib/api/validateId";
import mongoose from "mongoose";
import { withAccountingTransaction } from "@/lib/accounting/transaction";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    const body = await request.json().catch(() => ({}));

    return await withAccountingTransaction(async () => {
    const po = await PurchaseOrder.findOne({ _id: id, tenantId });
    if (!po) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    }

    if (po.status !== DOCUMENT_STATUS.POSTED) {
      return NextResponse.json(
        { error: `Cannot receive goods: purchase order is in "${po.status}" status (must be "${DOCUMENT_STATUS.POSTED}")` },
        { status: 400 }
      );
    }

    // items: Array<{ lineIndex?: number; productId?: string; quantity?: number; receiveQty?: number }>
    const receiveItems: Array<{ lineIndex?: number; productId?: string; quantity?: number; receiveQty?: number }> =
      body.items || body.lines || [];
    if (!Array.isArray(receiveItems)) {
      return NextResponse.json({ error: "Receipt items must be an array" }, { status: 400 });
    }

    // If no items payload provided, default to receiving full remaining quantities for all lines
    const linesToProcess: Array<{
      lineIndex: number;
      productId: mongoose.Types.ObjectId;
      name: string;
      qtyToReceive: number;
    }> = [];
    const requestedByLine = new Map<number, number>();

    if (receiveItems.length === 0) {
      // Default: receive all remaining quantities
      po.orderLines.forEach((line, idx) => {
        const remaining = (line.productQty || 0) - (line.receivedQty || 0);
        if (remaining > 0) {
          linesToProcess.push({
            lineIndex: idx,
            productId: line.productId,
            name: line.name,
            qtyToReceive: remaining,
          });
        }
      });
    } else {
      // Custom quantities per line
      for (const item of receiveItems) {
        let lineIdx = item.lineIndex;
        if (lineIdx === undefined && item.productId) {
          lineIdx = po.orderLines.findIndex(
            (l) => l.productId.toString() === item.productId?.toString()
          );
        }
        if (lineIdx === undefined || lineIdx < 0 || lineIdx >= po.orderLines.length) {
          return NextResponse.json({ error: `Invalid line item or productId: ${item.productId}` }, { status: 400 });
        }

        const poLine = po.orderLines[lineIdx];
        const remaining = (poLine.productQty || 0) - (poLine.receivedQty || 0) - (requestedByLine.get(lineIdx) || 0);
        const qty = Number(item.quantity ?? item.receiveQty);

        if (isNaN(qty) || qty <= 0) {
          return NextResponse.json(
            { error: `Receive quantity for "${poLine.name}" must be greater than 0`, message: `Receive quantity for "${poLine.name}" must be greater than 0` },
            { status: 400 }
          );
        }
        if (qty > remaining + 0.0001) {
          return NextResponse.json(
            { error: `Receive quantity of ${qty} exceeds remaining quantity of ${remaining}`, message: `Receive quantity of ${qty} exceeds remaining quantity of ${remaining}` },
            { status: 400 }
          );
        }

        linesToProcess.push({
          lineIndex: lineIdx,
          productId: poLine.productId,
          name: poLine.name,
          qtyToReceive: qty,
        });
        requestedByLine.set(lineIdx, (requestedByLine.get(lineIdx) || 0) + qty);
      }
    }

    if (linesToProcess.length === 0) {
      return NextResponse.json(
        { error: "All line items for this purchase order have already been fully received" },
        { status: 400 }
      );
    }

    const productIds = [...new Set(linesToProcess.map((line) => String(line.productId)))];
    const ownedProducts = await Product.countDocuments({ _id: { $in: productIds }, tenantId });
    if (ownedProducts !== productIds.length) {
      return NextResponse.json({ error: "One or more purchase-order products are unavailable for this organization" }, { status: 400 });
    }

    // Generate incoming transfer name: WH/IN/00001
    const count = await StockTransfer.countDocuments({
      tenantId,
      "header.operationType": "incoming",
    });
    const transferName = `WH/IN/${String(count + 1).padStart(5, "0")}`;

    const operations_tab = linesToProcess.map((l) => ({
      productId: l.productId,
      demand: l.qtyToReceive,
      done: l.qtyToReceive,
    }));

    // 1. Create incoming StockTransfer
    const transfer = await StockTransfer.create({
      tenantId,
      header: {
        name: transferName,
        partnerId: po.partnerId,
        operationType: "incoming",
        scheduledDate: new Date(),
        sourceDocument: po.name,
      },
      operations_tab,
      status: DOCUMENT_STATUS.POSTED,
      additional_info: {
        note: `Goods receipt for Purchase Order ${po.name}`,
        responsibleId: session.user.id as any,
      },
      chatter: [
        {
          authorId: session.user.id as any,
          body: `Goods received against PO ${po.name}`,
          type: "notification",
          createdAt: new Date(),
        },
      ],
    });

    // 2. Insert Stock movements (type: "in")
    const stockMoves = linesToProcess.map((l) => ({
      product: l.productId,
      quantity: l.qtyToReceive,
      type: "in" as const,
      reference: transferName,
      isReserved: false,
      notes: `Received from ${po.name} via ${transferName}`,
      tenantId,
      createdBy: session.user.id as any,
    }));
    await Stock.insertMany(stockMoves);

    // 3. Update PO line received quantities
    for (const l of linesToProcess) {
      const poLine = po.orderLines[l.lineIndex];
      poLine.receivedQty = (poLine.receivedQty || 0) + l.qtyToReceive;
    }

    if (!po.stockTransferIds) po.stockTransferIds = [];
    po.stockTransferIds.push(transfer._id as mongoose.Types.ObjectId);

    await po.save();

    // 4. Trigger auto-matching for linked bills
    try {
      const linkedInvoices = await Invoice.find({
        tenantId,
        poReference: po.name,
        moveType: "in_invoice",
        poMatchStatus: "mismatch",
      });
      for (const inv of linkedInvoices) {
        await runPOMatching(String(inv._id), tenantId);
      }
    } catch (e) {
      console.error("runPOMatching error:", e);
    }

    const receivedCount = linesToProcess.reduce((sum, l) => sum + l.qtyToReceive, 0);
    return NextResponse.json({
      success: true,
      message: `Successfully received ${receivedCount} unit(s) into inventory`,
      receivedCount,
      transfer,
      stockTransfer: transfer,
      po,
    });
    });
  } catch (error: any) {
    console.error("Error receiving purchase order goods:", error);
    return NextResponse.json({ error: safeInternalErrorMessage() }, { status: 500 });
  }
}
