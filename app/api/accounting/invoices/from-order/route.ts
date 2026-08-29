import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import SaleOrder from "@/models/sales/SaleOrder";
import Product from "@/models/inventory/Product";
import Customer from "@/models/sales/Customer";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { saleOrderId } = await req.json();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    if (!saleOrderId) {
      return NextResponse.json(
        { error: "Sale Order ID is required" },
        { status: 400 },
      );
    }

    // 1. Fetch Sale Order with Line details
    const so = await SaleOrder.findOne({ _id: saleOrderId, tenantId }).populate(
      "orderLines.productId",
    );
    if (!so) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 2. Fetch Customer for Accounting settings
    const customer = await Customer.findOne({
      _id: so.header.partnerId,
      tenantId,
    });
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    // 3. Map Lines
    const invoiceLines = [];
    for (const line of so.orderLines) {
      const product = line.productId as any; // Populated
      let accountId = null;

      // Logic: Get Income Account from Product -> Accounting Tab
      if (
        product &&
        product.tab_accounting?.cost_and_revenue?.property_account_income_id
      ) {
        accountId =
          product.tab_accounting.cost_and_revenue.property_account_income_id;
      }

      // Fallback: Could fetch from Category or Global default (omitted for now)

      invoiceLines.push({
        productId: product?._id,
        name: line.name || product?.header?.name || "Product",
        quantity: line.productQty,
        priceUnit: line.priceUnit,
        priceSubtotal: line.priceSubtotal,
        taxIds: line.taxIds || [],
        accountId: accountId,
        discount: line.discount,
      });
    }

    // 4. Determine Receivable Account
    const receivableAccountId =
      customer.accounting_tab?.property_account_receivable_id || null;

    // 5. Create Draft Invoice
    const newInvoice = new Invoice({
      name: "Draft", // Will be numbered on Confirm
      partnerId: so.header.partnerId,
      invoiceDate: new Date(),
      dueDate: new Date(), // Logic for Payment Terms could be added here
      state: DOCUMENT_STATUS.DRAFT,
      moveType: "out_invoice",
      invoiceLines,
      currencyId: "INR", // Default or fetch from Pricelist associated with SO
      receivableAccountId,
      sourceDocument: so.header.name,
      sourceId: so._id,
      amountUntaxed: so.totals.amountUntaxed,
      amountTax: so.totals.amountTax,
      amountTotal: so.totals.amountTotal,
      amountResidual: so.totals.amountTotal, // Initially full amount due
      createdBy: session.user.id,
      tenantId,
    });

    await newInvoice.save();

    // Back-sync: Link to SaleOrder
    await SaleOrder.updateOne(
      { _id: so._id },
      { $push: { invoiceIds: newInvoice._id } },
    );

    await newInvoice.populate("partnerId");

    return NextResponse.json(newInvoice, { status: 201 });
  } catch (error: any) {
    console.error("Error creating invoice from order:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
