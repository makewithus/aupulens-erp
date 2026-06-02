import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import Invoice from '@/models/Invoice';
import { logActivity } from '@/lib/logger';
import { postInvoicePayment } from '@/lib/accounting/payments';
import {
  DOCUMENT_STATUS,
  PAYMENT_STATE,
  type DocumentStatus,
  type PaymentState,
} from '@/lib/constants/statuses';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'finance')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const { id } = await params;
    const tenantId = (session.user as any).tenantId || "default-tenant";

    const invoice = await Invoice.findOne({ _id: id, tenantId });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const paymentState = (body.paymentState ||
      (body.status === 'paid' ? PAYMENT_STATE.PAID : undefined)) as
      | PaymentState
      | undefined;
    const wantsPaymentPosting =
      paymentState === PAYMENT_STATE.PAID || body.paymentAmount !== undefined;

    if (body.state) invoice.state = body.state as DocumentStatus;
    if (body.dueDate) invoice.dueDate = new Date(body.dueDate);
    if (body.invoiceDate) invoice.invoiceDate = new Date(body.invoiceDate);

    if (wantsPaymentPosting) {
      await postInvoicePayment({
        invoice,
        tenantId,
        createdBy: session.user.id,
        amount:
          body.paymentAmount !== undefined
            ? Number(body.paymentAmount)
            : undefined,
        paymentDate: body.paidDate ? new Date(body.paidDate) : new Date(),
        paymentAccountId: body.paymentAccountId,
        reference: body.reference,
      });
    } else {
      if (paymentState) invoice.paymentState = paymentState;
      if (body.paidDate) invoice.paidDate = new Date(body.paidDate);
      if (body.amountResidual !== undefined) {
        invoice.amountResidual = Number(body.amountResidual);
      }
    }

    await invoice.save();
    await invoice.populate("partnerId", "header.name contact_details.email");

    await logActivity({
      activity: `Updated invoice ${invoice.name}`,
      details: `State: ${invoice.state}, Payment: ${invoice.paymentState}`,
      req
    });

    return NextResponse.json({ invoice });
  } catch (error) {
    console.error('Error updating invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'finance')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { id } = await params;
    const tenantId = (session.user as any).tenantId || "default-tenant";

    const invoice = await Invoice.findOne({ _id: id, tenantId });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.state !== DOCUMENT_STATUS.DRAFT) {
      return NextResponse.json(
        { error: 'Only draft invoices can be deleted' },
        { status: 400 },
      );
    }

    await Invoice.deleteOne({ _id: id, tenantId });

    await logActivity({
      activity: `Deleted invoice ${invoice.name}`,
      details: `Invoice ID: ${invoice._id}`,
      req
    });

    return NextResponse.json({ message: 'Invoice deleted' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
