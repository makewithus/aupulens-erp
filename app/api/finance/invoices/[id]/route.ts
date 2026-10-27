import { handleRouteError, stripProtectedFields } from "@/lib/api/validateId";
import { NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import Invoice from '@/models/finance/Invoice';
import { logActivity } from '@/lib/logger';
import { postInvoicePayment } from '@/lib/accounting/payments';
import {
  DOCUMENT_STATUS,
  PAYMENT_STATE,
  type PaymentState,
} from '@/lib/constants/statuses';
import { assertTransactionNotLocked, TransactionLockError } from '@/lib/accounting/transactionLock';
import { withAccountingTransaction } from "@/lib/accounting/transaction";

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

    const transactionRequestBody = await req.json();
    return await withAccountingTransaction(async () => {
      const body = stripProtectedFields(structuredClone(transactionRequestBody));
      const { id } = await params;
      const tenantIdCheck = requireTenantId(session);
      if (tenantIdCheck) return tenantIdCheck;
      const tenantId = (session.user as any).tenantId;

      const invoice = await Invoice.findOne({ _id: id, tenantId });

      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }

      // This legacy endpoint may collect a payment, but it must not let a
      // generic update promote an invoice or forge its ledger residual.
      if (body.state !== undefined && body.state !== invoice.state) {
        return NextResponse.json(
          { error: 'Invoice state must be changed through the accounting posting workflow.' },
          { status: 400 },
        );
      }
      if (body.amountResidual !== undefined) {
        return NextResponse.json(
          { error: 'Invoice residual is derived from posted payments.' },
          { status: 400 },
        );
      }

      try {
        await assertTransactionNotLocked(tenantId, 'sales', invoice.invoiceDate);
        if (body.invoiceDate) {
          await assertTransactionNotLocked(tenantId, 'sales', body.invoiceDate);
        }
      } catch (lockError) {
        if (lockError instanceof TransactionLockError) {
          return NextResponse.json({ error: lockError.message }, { status: 403 });
        }
        throw lockError;
      }

      const paymentState = (body.paymentState ||
        (body.status === 'paid' ? PAYMENT_STATE.PAID : undefined)) as
        | PaymentState
        | undefined;
      const wantsPaymentPosting =
        paymentState === PAYMENT_STATE.PAID || body.paymentAmount !== undefined;

      if (
        body.paymentState !== undefined &&
        body.paymentState !== PAYMENT_STATE.PAID &&
        body.paymentState !== invoice.paymentState
      ) {
        return NextResponse.json(
          { error: 'Payment state is derived from posted payments.' },
          { status: 400 },
        );
      }
      if (body.paidDate !== undefined && !wantsPaymentPosting) {
        return NextResponse.json(
          { error: 'Paid date is set when a payment is posted.' },
          { status: 400 },
        );
      }

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
        // Payment-state transitions are written only by postInvoicePayment.
      }

      await invoice.save();
      await invoice.populate("partnerId", "header.name contact_details.email");

      await logActivity({
        activity: `Updated invoice ${invoice.name}`,
        details: `State: ${invoice.state}, Payment: ${invoice.paymentState}`,
        req
      });

      return NextResponse.json({ invoice });
    });
  } catch (error: any) {
    console.error('Error updating invoice:', error);
    return handleRouteError(error);
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

    return await withAccountingTransaction(async () => {
      const { id } = await params;
      const tenantIdCheck = requireTenantId(session);
      if (tenantIdCheck) return tenantIdCheck;
      const tenantId = (session.user as any).tenantId;

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

      try {
        await assertTransactionNotLocked(tenantId, 'sales', invoice.invoiceDate);
      } catch (lockError) {
        if (lockError instanceof TransactionLockError) {
          return NextResponse.json({ error: lockError.message }, { status: 403 });
        }
        throw lockError;
      }

      await Invoice.deleteOne({ _id: id, tenantId });

      await logActivity({
        activity: `Deleted invoice ${invoice.name}`,
        details: `Invoice ID: ${invoice._id}`,
        req
      });

      return NextResponse.json({ message: 'Invoice deleted' });
    });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
