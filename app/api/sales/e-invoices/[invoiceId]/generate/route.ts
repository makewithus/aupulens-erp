import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import EInvoice from "@/models/EInvoice";
import EinvoiceGspCredential from "@/models/EinvoiceGspCredential";
import { SalesInvoice } from "@/models/SalesInvoice";
import { decrypt } from "@/lib/crypto";
import { getGspService } from "@/lib/einvoice/gspService";
import { GSP_CONNECTION_STATUS, EINVOICE_STATUS } from "@/lib/constants/statuses";

export async function POST(request: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { invoiceId } = await params;

    const invoice = await (SalesInvoice as any).findOne({ _id: invoiceId, tenantId }).lean();
    if (!invoice) {
      return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
    }

    const credential = await EinvoiceGspCredential.findOne({
      tenantId,
      status: GSP_CONNECTION_STATUS.CONNECTED,
    });
    if (!credential) {
      return NextResponse.json(
        { success: false, message: "Connect to the E-Invoicing portal before generating an e-invoice" },
        { status: 422 },
      );
    }

    const existing = await EInvoice.findOne({ tenantId, invoiceId });

    const result = await getGspService().generateEinvoice(
      { provider: credential.provider, username: credential.username, password: decrypt(credential.encryptedPassword) },
      { invoiceNumber: (invoice as any).number, totalAmount: (invoice as any).totalAmount },
    );

    const update = {
      tenantId,
      invoiceId,
      amount: (invoice as any).totalAmount,
      status: result.ok ? EINVOICE_STATUS.SUCCESS : EINVOICE_STATUS.FAILED,
      irn: result.irn,
      ackNo: result.ackNo,
      ackDate: result.ackDate,
      errorMessage: result.error,
      createdBy: session.user.id,
    };

    const record = existing
      ? await EInvoice.findOneAndUpdate({ _id: existing._id }, update, { new: true })
      : await EInvoice.create(update);

    if (result.ok) {
      await (SalesInvoice as any).updateOne({ _id: invoiceId, tenantId }, { $set: { eInvoice: true } });
    }

    return NextResponse.json(
      { success: result.ok, message: result.error, data: record },
      { status: result.ok ? 200 : 422 },
    );
  } catch (error: any) {
    console.error("E-Invoice generate POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
