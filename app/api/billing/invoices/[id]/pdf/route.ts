import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import BillingInvoice from "@/models/billing/BillingInvoice";
import mongoose from "mongoose";
import { generateInvoicePdf } from "@/lib/billing/billingPdfGenerator";
import { handleRouteError } from "@/lib/api/validateId";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = session.user.tenantId;
    const { id } = await props.params;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid invoice identifier format" },
        { status: 400 }
      );
    }

    await connectDB();

    const query: any = { tenantId };
    if (mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id)) {
      query.$or = [{ _id: id }, { invoiceNumber: id }];
    } else {
      query.invoiceNumber = id;
    }

    const invoice = await BillingInvoice.findOne(query).lean();
    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "Invoice not found or access denied." },
        { status: 404 }
      );
    }

    // Do not generate a paid receipt for an unverified or pending payment
    if (invoice.status === "void" || invoice.status === "cancelled") {
      return NextResponse.json(
        { success: false, error: "Invoice has been voided or cancelled." },
        { status: 400 }
      );
    }

    const pdfBytes = await generateInvoicePdf(invoice);
    const filename = `${invoice.invoiceNumber || "INVOICE"}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
