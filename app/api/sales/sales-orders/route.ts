import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/sales/SaleOrder";
import SalesView from "@/models/sales/SalesView";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { generateSaleOrderNumber } from "@/lib/sales/saleOrderNumbering";
import { buildMongoFilterFromCriteria } from "@/lib/sales/saleOrderViews";
import { resolveSpecialFilter } from "@/lib/sales/saleOrderViews.server";
import {
  SALES_ORDER_STATUS,
  SALES_ORDER_SHIPMENT_STATUS,
  SALES_ORDER_INVOICING_STATUS,
} from "@/lib/constants/statuses";
import "@/models/sales/Customer";
import "@/models/auth/User";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const skip = (page - 1) * limit;
    const sortField = searchParams.get("sortField") || "createdAt";
    const sortDir = searchParams.get("sortDir") === "asc" ? 1 : -1;
    const viewId = searchParams.get("viewId");
    const search = searchParams.get("search")?.trim();

    // Only ever touches orders created by the new Zoho-style form (salesOrderStatus
    // is set on create); the legacy Odoo /sales/orders page never sets it, so this
    // tab and that page never show each other's rows.
    let query: Record<string, any> = { tenantId, salesOrderStatus: { $ne: null } };

    if (viewId) {
      const view = await SalesView.findOne({ _id: viewId, tenantId, entityType: "sales-orders" }).lean();
      if (view) {
        query = (view as any).specialFilter
          ? { ...query, ...(await resolveSpecialFilter((view as any).specialFilter)) }
          : { ...query, ...buildMongoFilterFromCriteria((view as any).criteria) };
      }
    }

    if (search) {
      query.$or = [
        { "header.name": { $regex: search, $options: "i" } },
        { "otherInfo.clientOrderRef": { $regex: search, $options: "i" } },
      ];
    }

    const [total, orders] = await Promise.all([
      SaleOrder.countDocuments(query),
      (SaleOrder as any)
        .find(query)
        .populate("header.partnerId", "header contact_details")
        .populate("otherInfo.salespersonId", "name email")
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return NextResponse.json({ success: true, data: orders, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error: any) {
    console.error("Sales Orders GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const body = await request.json();

    if (!body.customerId) {
      return NextResponse.json({ success: false, message: "Customer is required" }, { status: 400 });
    }
    if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
      return NextResponse.json({ success: false, message: "At least one line item is required" }, { status: 400 });
    }

    const taxMode = body.taxMode || "none";
    const taxRate = taxMode !== "none" ? Number(body.taxRate) || 0 : 0;

    const totals = computeInvoiceTotals({
      lineItems: body.lineItems,
      extraDiscount: Number(body.extraDiscount) || 0,
      extraDiscountMode: body.extraDiscountMode || "amount",
      tdsRate: taxMode === "tds" ? taxRate : 0,
      tcsRate: taxMode === "tcs" ? taxRate : 0,
    });

    const adjustment = Number(body.adjustment) || 0;
    const totalAmount = totals.totalAmount + adjustment;

    let number = body.number;
    if (!number) {
      const generated = await generateSaleOrderNumber(tenantId, body.prefix);
      number = generated.number;
    }

    const orderLines = totals.computedLines.map((line: any, i: number) => ({
      productId: body.lineItems[i].itemId || undefined,
      name: line.name || body.lineItems[i].name,
      productQty: line.qty,
      priceUnit: line.unitPrice,
      taxIds: [],
      discount: line.discount,
      priceSubtotal: line.lineTotal,
    }));

    const order = await SaleOrder.create({
      tenantId,
      header: {
        name: number,
        partnerId: body.customerId,
        dateOrder: body.orderDate ? new Date(body.orderDate) : new Date(),
      },
      orderLines,
      otherInfo: {
        salespersonId: body.salespersonId || undefined,
        clientOrderRef: body.referenceNumber,
      },
      totals: {
        amountUntaxed: totals.taxableAmount,
        amountTax: totals.totalTax,
        amountTotal: totalAmount,
      },
      salesOrderStatus: body.status === "confirmed" ? SALES_ORDER_STATUS.CONFIRMED : SALES_ORDER_STATUS.DRAFT,
      shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED,
      invoicingStatus: SALES_ORDER_INVOICING_STATUS.NOT_INVOICED,
      expectedShipmentDate: body.expectedShipmentDate ? new Date(body.expectedShipmentDate) : undefined,
      paymentTermsLabel: body.paymentTermsLabel || "Due on Receipt",
      deliveryMethod: body.deliveryMethod || undefined,
      extraDiscount: body.extraDiscount || 0,
      extraDiscountMode: body.extraDiscountMode || "amount",
      taxMode,
      taxId: body.taxId || undefined,
      taxRate,
      adjustment,
      subTotal: totals.subtotal,
      taxAmount: totals.totalTax,
      customerNotes: body.customerNotes,
      termsAndConditions: body.termsAndConditions,
      attachments: body.attachments || [],
      chatter: [],
    });

    return NextResponse.json({ success: true, data: order }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, message: "That sales order number is already in use. Please choose another." },
        { status: 409 },
      );
    }
    console.error("Sales Orders POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
