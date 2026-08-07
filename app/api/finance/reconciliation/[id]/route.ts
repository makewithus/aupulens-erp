import { NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import BankReconciliation from '@/models/BankReconciliation';
import { logActivity } from '@/lib/logger';

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
    const tenantIdCheck = requireTenantId(session);
    if (tenantIdCheck) return tenantIdCheck;
    const tenantId = (session.user as any).tenantId;
    const { transactions, reconciled } = body;

    const updateData: Record<string, unknown> = {};
    if (transactions) updateData.transactions = transactions;
    if (reconciled !== undefined) {
      updateData.reconciled = reconciled;
      updateData.reconciledBy = session.user.id;
      updateData.reconciledAt = new Date();
    }

    const reconciliation = await BankReconciliation.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: updateData },
      { new: true }
    );

    if (!reconciliation) {
      return NextResponse.json({ error: 'Reconciliation not found' }, { status: 404 });
    }

    await logActivity({
      activity: `Updated bank reconciliation`,
      details: `ID: ${reconciliation._id}, Reconciled: ${reconciled}`,
      req
    });

    return NextResponse.json({ reconciliation });
  } catch (error) {
    console.error('Error updating reconciliation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
