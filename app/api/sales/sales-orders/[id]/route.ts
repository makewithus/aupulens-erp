import { stripProtectedFields } from "@/lib/api/validateId";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/sales/SaleOrder";
import InventoryItem from "@/models/inventory/InventoryItem";
import {
  SALES_ORDER_STATUS,
  SALES_ORDER_STATUS_VALUES,
  SALES_ORDER_SHIPMENT_STATUS,
  SALES_ORDER_SHIPMENT_STATUS_VALUES,
  STOCK_LEVEL_STATUS,
  Q2C_STATUS,
  DOCUMENT_STATUS,
} from "@/lib/constants/statuses";
import Product from "@/models/inventory/Product";
import Stock from "@/models/inventory/Stock";
import DeliveryChallan from "@/models/sales/DeliveryChallan";
import StockTransfer from "@/models/inventory/StockTransfer";
import { getOnHandQuantity } from "@/lib/inventory/stockGuard";
import { postStockMoveAccounting } from "@/lib/accounting/inventory";
import "@/models/sales/Customer";
import "@/models/auth/User";
import "@/models/sales/SalesInvoice";
import { validateObjectId, handleRouteError } from "@/lib/api/validateId";
import { withAccountingTransaction } from "@/lib/accounting/transaction";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    await connectDB();
    const order = await (SaleOrder as any)
      .findOne({ _id: id, tenantId: session.user.tenantId })
      .populate("header.partnerId", "header contact_details")
      .populate("otherInfo.salespersonId", "name email")
      .populate("salesInvoiceIds", "number status totalAmount")
      .lean();

    if (!order) {
      return NextResponse.json({ success: false, message: "Sales order not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error: any) {
    return handleRouteError(error);
  }
}

// Handles the small set of real lifecycle transitions the Zoho-style tab
// exposes (confirm / hold / void / close, shipment status updates).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    await connectDB();
    const tenantId = session.user.tenantId;
    // Parse once outside the retryable transaction callback. MongoDB may rerun
    // that callback after a write conflict, while a Request body is one-shot.
    const body = stripProtectedFields(await request.json());
    return await withAccountingTransaction(async () => {
    const currentOrder = await SaleOrder.findOne({ _id: id, tenantId });
    if (!currentOrder) {
      return NextResponse.json({ success: false, message: "Sales order not found" }, { status: 404 });
    }

    const update: Record<string, any> = {};
    if (body.salesOrderStatus !== undefined) {
      if (!SALES_ORDER_STATUS_VALUES.includes(body.salesOrderStatus)) {
        return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
      }
      update.salesOrderStatus = body.salesOrderStatus;
      if (body.salesOrderStatus === SALES_ORDER_STATUS.VOID || body.salesOrderStatus === "cancelled") {
        update.q2cStatus = Q2C_STATUS.CANCELLED;
        update.status = DOCUMENT_STATUS.CANCELLED;
      } else if (body.salesOrderStatus === SALES_ORDER_STATUS.CLOSED) {
        if (currentOrder.q2cStatus !== Q2C_STATUS.INVOICE_POSTED && currentOrder.q2cStatus !== Q2C_STATUS.REVENUE_RECOGNIZED) {
          update.q2cStatus = Q2C_STATUS.REVENUE_RECOGNIZED;
        }
        update.status = DOCUMENT_STATUS.CLOSED;
      } else if (body.salesOrderStatus === SALES_ORDER_STATUS.CONFIRMED) {
        if (currentOrder.q2cStatus === Q2C_STATUS.CANCELLED || currentOrder.q2cStatus === Q2C_STATUS.LOST) {
          update.q2cStatus = Q2C_STATUS.SALES_ORDER;
        }
        update.status = DOCUMENT_STATUS.APPROVED;
      }
    }
    if (body.shipmentStatus !== undefined) {
      if (!SALES_ORDER_SHIPMENT_STATUS_VALUES.includes(body.shipmentStatus)) {
        return NextResponse.json({ success: false, message: "Invalid shipment status" }, { status: 400 });
      }
      update.shipmentStatus = body.shipmentStatus;

      if (body.shipmentStatus === "shipped" && currentOrder.shipmentStatus !== "shipped") {
        const orderLines = (currentOrder as any).orderLines || [];
        if (!orderLines.length) {
          return NextResponse.json({ success: false, message: "Cannot ship an order with no line items" }, { status: 400 });
        }

        // 1. Resolve products and check stock availability for every line
        const resolvedLines: Array<{ line: any; product: any; inventoryItem?: any; qty: number }> = [];
        const requestedByProduct = new Map<string, number>();
        const lockedProducts = new Set<string>();

        for (const line of orderLines) {
          const qty = Number(line.productQty) || 0;
          if (qty <= 0) continue;

          let product: any = null;
          let invItem: any = null;
          if (line.productId) {
            product = await Product.findOne({ _id: line.productId, tenantId });
          }
          if (!product) {
            const itemName = line.name || line.productName;
            const itemCode = line.itemCode;
            product = await Product.findOne({
              tenantId,
              $or: [
                ...(itemCode ? [{ "tab_general_information.default_code": itemCode }] : []),
                ...(itemName ? [{ "header.name": itemName }, { "tab_general_information.default_code": itemName }] : []),
              ],
            });
          }

          if (!product) {
            const itemName = line.name || line.productName;
            const itemCode = line.itemCode;
            invItem = await InventoryItem.findOne({
              tenantId,
              $or: [
                ...(itemCode ? [{ itemCode }] : []),
                ...(itemName ? [{ name: itemName }, { itemCode: itemName }] : []),
              ],
            });

            if (invItem) {
              product = {
                _id: invItem._id,
                header: { name: invItem.name },
                tab_general_information: {
                  type: "consu",
                  uom: invItem.unit || "units",
                  standard_price: invItem.unitCost || 0,
                  default_code: invItem.itemCode,
                },
                allowNegativeStock: false,
              };
            }
          }

          if (!product) {
            return NextResponse.json(
              { success: false, message: `Product "${line.name || line.productName || "item"}" was not found in catalog.` },
              { status: 400 }
            );
          }

          const productKey = String(product._id);
          const cumulativeQty = (requestedByProduct.get(productKey) || 0) + qty;
          requestedByProduct.set(productKey, cumulativeQty);

          // Non-stock / service products don't require physical inventory
          if (product.tab_general_information?.type !== "service") {
            if (invItem) {
              const currentInvQty = invItem.quantity ?? 0;
              if (currentInvQty < cumulativeQty) {
                return NextResponse.json(
                  {
                    success: false,
                    message: `Insufficient stock for product "${invItem.name}": on hand is ${currentInvQty}, required ${cumulativeQty}. Receive stock before shipping.`,
                  },
                  { status: 400 }
                );
              }
            } else {
              // A product document is the per-product transaction lock. Competing
              // shipments for different orders now conflict on the same document;
              // MongoDB retries the loser and its stock check observes the new ledger.
              if (!lockedProducts.has(productKey)) {
                const lock = await Product.updateOne(
                  { _id: product._id, tenantId },
                  { $inc: { inventoryRevision: 1 } },
                );
                if (lock.matchedCount !== 1) {
                  return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
                }
                lockedProducts.add(productKey);
              }
              const onHand = await getOnHandQuantity(tenantId, String(product._id));
              if (onHand < cumulativeQty && !product.allowNegativeStock) {
                return NextResponse.json(
                  {
                    success: false,
                    message: `Insufficient stock for product "${product.header?.name || line.name}": on hand is ${onHand}, required ${cumulativeQty}. Receive stock before shipping.`,
                  },
                  { status: 400 }
                );
              }
            }
          }

          resolvedLines.push({ line, product, inventoryItem: invItem, qty });
        }

        if (resolvedLines.length === 0) {
          return NextResponse.json({ success: false, message: "No shippable items found on order" }, { status: 400 });
        }

        // 2. Create DeliveryChallan
        const dcCount = await DeliveryChallan.countDocuments({ tenantId });
        const dcNumber = `DC-${String(dcCount + 1).padStart(5, "0")}`;
        const orderName = currentOrder.header?.name || (currentOrder as any).name || currentOrder._id.toString();
        const customerName = (currentOrder as any).partnerId?.header?.displayName ||
                             (currentOrder as any).partnerId?.header?.name ||
                             (currentOrder as any).customerName ||
                             "Customer";
        const delivery = await DeliveryChallan.create({
          tenantId,
          dcNumber,
          customer: customerName,
          items: resolvedLines.map((r) => ({
            productId: r.product._id,
            description: r.line.name || r.product.header?.name || "Item",
            quantity: r.qty,
            unit: r.product.tab_general_information?.uom || "units",
          })),
          deliveryAddress: (currentOrder as any).shippingAddress || "Default Address",
          deliveryDate: new Date().toISOString().split("T")[0],
          status: "delivered",
          notes: `Delivery for Sales Order ${orderName}`,
        });

        // 3. Create StockTransfer (outgoing)
        const trCount = await StockTransfer.countDocuments({ tenantId, "header.operationType": "outgoing" });
        const transferName = `WH/OUT/${String(trCount + 1).padStart(5, "0")}`;
        await StockTransfer.create({
          tenantId,
          header: {
            name: transferName,
            partnerId: (currentOrder as any).partnerId?._id || (currentOrder as any).partnerId,
            operationType: "outgoing",
            scheduledDate: new Date(),
            sourceDocument: orderName,
          },
          operations_tab: resolvedLines.map((r) => ({
            productId: r.product._id,
            demand: r.qty,
            done: r.qty,
          })),
          status: DOCUMENT_STATUS.POSTED,
          dispatchStatus: "dispatched",
          dispatchDate: new Date(),
          chatter: [
            {
              authorId: session.user.id as any,
              body: `Dispatched against ${orderName}`,
              type: "notification",
              createdAt: new Date(),
            },
          ],
        });

        // 4. Record stock moves (type: "out", negative qty in signed ledger)
        const stockMoves = resolvedLines
          .filter((r) => r.product.tab_general_information?.type !== "service")
          .map((r) => ({
            product: r.product._id,
            quantity: -r.qty,
            type: "out" as const,
            reference: orderName,
            isReserved: false,
            notes: `Dispatched for Sales Order ${orderName} via ${dcNumber}`,
            tenantId,
            createdBy: session.user.id as any,
          }));
        if (stockMoves.length > 0) {
          await Stock.insertMany(stockMoves);
        }

        // Deduct inventory items if matched
        for (const r of resolvedLines) {
          if (r.inventoryItem) {
            const inventoryUpdate = await InventoryItem.updateOne(
              { _id: r.inventoryItem._id, tenantId, quantity: { $gte: r.qty } },
              { $inc: { quantity: -r.qty } }
            );
            if (inventoryUpdate.modifiedCount !== 1) {
              return NextResponse.json({ success: false, message: "Insufficient stock for inventory item" }, { status: 409 });
            }
          }
        }

        // 5. Post COGS entry through established accounting service
        const totalCost = resolvedLines.reduce((sum, r) => {
          const unitCost = Number(r.product.tab_general_information?.standard_price) || 0;
          return sum + (r.qty * unitCost);
        }, 0);

        if (totalCost > 0) {
          await postStockMoveAccounting({
            move: {
              reference: `${orderName}/COGS`,
              moveType: "outgoing",
              valuation: { totalValue: totalCost },
              lines: resolvedLines.map((r) => ({
                done: r.qty,
                unitCost: Number(r.product.tab_general_information?.standard_price) || 0,
              })),
            },
            tenantId,
            createdBy: session.user.id,
          });
        }

        // 6. Link delivery to order and update order statuses
        update.deliveryChallanId = delivery._id;
        update.fulfillment = {
          ...(currentOrder as any).fulfillment,
          deliveryChallanId: delivery._id,
          status: "delivered",
        };
        update.shipmentStatus = SALES_ORDER_SHIPMENT_STATUS.SHIPPED;
        update.salesOrderStatus = SALES_ORDER_STATUS.CLOSED;
        if (currentOrder.q2cStatus === Q2C_STATUS.SALES_ORDER) {
          update.q2cStatus = Q2C_STATUS.INVOICE_POSTED;
        }
      }
    }
    if (body.customerViewed !== undefined) update.customerViewed = !!body.customerViewed;

    const order = await (SaleOrder as any)
      .findOneAndUpdate({ _id: id, tenantId }, { $set: update }, { new: true })
      .populate("header.partnerId", "header contact_details")
      .populate("otherInfo.salespersonId", "name email")
      .populate("salesInvoiceIds", "number status totalAmount")
      .lean();
    return NextResponse.json({ success: true, data: order });
    });

  } catch (error: any) {
    return handleRouteError(error);
  }
}
