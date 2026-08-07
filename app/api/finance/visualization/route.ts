import { NextRequest, NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import Invoice from '@/models/Invoice';
import Asset from '@/models/Asset';
import BankReconciliation from '@/models/BankReconciliation';
import { DOCUMENT_STATUS, PAYMENT_STATE } from '@/lib/constants/statuses';
import {
  buildPostedCashFlowSeries,
  buildPostedCategoryBreakdown,
  buildPostedDebitCreditSeries,
  buildPostedIncomeExpenseSeries,
} from '@/lib/accounting/reports';

function getCurrentBookValue(asset: {
  originalValue: number;
  salvageValue: number;
  durationYears: number;
  purchaseDate: Date;
}) {
  const usefulLifeMs = Math.max(asset.durationYears, 1) * 365 * 24 * 60 * 60 * 1000;
  const elapsedMs = Math.max(0, Date.now() - new Date(asset.purchaseDate).getTime());
  const depreciationRatio = Math.min(elapsedMs / usefulLifeMs, 1);
  const depreciableValue = Math.max(asset.originalValue - asset.salvageValue, 0);
  return asset.originalValue - depreciableValue * depreciationRatio;
}

function isBillPaid(bill: { paymentState?: string; paidDate?: Date | null }) {
  return bill.paymentState === PAYMENT_STATE.PAID || Boolean(bill.paidDate);
}

function isBillOverdue(bill: { paymentState?: string; paidDate?: Date | null; dueDate: Date; amountResidual?: number }) {
  return !isBillPaid(bill) && (Number(bill.amountResidual) || 0) > 0 && new Date(bill.dueDate) < new Date();
}

const OPEN_PAYMENT_STATES = new Set<string>([
  PAYMENT_STATE.NOT_PAID,
  PAYMENT_STATE.IN_PAYMENT,
  PAYMENT_STATE.PARTIAL,
]);

const EXCLUDED_BILL_STATUSES = new Set<string>([
  DOCUMENT_STATUS.REJECTED,
  DOCUMENT_STATUS.CANCELLED,
]);

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
await connectDB();

    const { searchParams } = new URL(req.url);
    const dataType = searchParams.get('type') || 'transactions';
    const dateRange = searchParams.get('dateRange') || '30'; // days
    const groupBy = searchParams.get('groupBy') || 'day';

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(dateRange));

    let data: Record<string, unknown>[] = [];

    switch (dataType) {
      case 'transactions':
        data = await buildPostedDebitCreditSeries({
          tenantId,
          startDate,
          groupBy: groupBy === 'month' ? 'month' : 'day',
        });
        break;

      case 'revenue-expenses':
        data = await buildPostedIncomeExpenseSeries({
          tenantId,
          startDate,
          groupBy: groupBy === 'month' ? 'month' : 'day',
        });
        break;

      case 'category-breakdown':
        data = await buildPostedCategoryBreakdown({
          tenantId,
          startDate,
        });
        break;

      case 'receivables-payables':
        const [invoices, bills] = await Promise.all([
          Invoice.find({ tenantId, moveType: 'out_invoice' }).lean(),
          Invoice.find({ tenantId, moveType: 'in_invoice' }).lean(),
        ]);

        const statusBreakdown = {
          receivables: {
            paid: invoices.filter(i => i.paymentState === PAYMENT_STATE.PAID).reduce((sum, i) => sum + i.amountTotal, 0),
            pending: invoices
              .filter(i => OPEN_PAYMENT_STATES.has(i.paymentState))
              .reduce((sum, i) => sum + (Number(i.amountResidual) || 0), 0),
            overdue: invoices.filter(i => i.paymentState === PAYMENT_STATE.OVERDUE).reduce((sum, i) => sum + (Number(i.amountResidual) || 0), 0),
          },
          payables: {
            paid: bills.filter(isBillPaid).reduce((sum, b) => sum + b.amountTotal, 0),
            pending: bills
              .filter(b => !isBillPaid(b) && !isBillOverdue(b) && !EXCLUDED_BILL_STATUSES.has(b.state))
              .reduce((sum, b) => sum + (Number(b.amountResidual) || 0), 0),
            overdue: bills.filter(isBillOverdue).reduce((sum, b) => sum + (Number(b.amountResidual) || 0), 0),
          },
        };

        data = [
          { name: 'Receivables - Paid', value: Math.round(statusBreakdown.receivables.paid) },
          { name: 'Receivables - Pending', value: Math.round(statusBreakdown.receivables.pending) },
          { name: 'Receivables - Overdue', value: Math.round(statusBreakdown.receivables.overdue) },
          { name: 'Payables - Paid', value: Math.round(statusBreakdown.payables.paid) },
          { name: 'Payables - Pending', value: Math.round(statusBreakdown.payables.pending) },
          { name: 'Payables - Overdue', value: Math.round(statusBreakdown.payables.overdue) },
        ].filter(item => item.value > 0);
        break;

      case 'cash-flow':
        data = await buildPostedCashFlowSeries({
          tenantId,
          startDate,
          groupBy: groupBy === 'month' ? 'month' : 'day',
        });
        break;

      case 'invoice-status':
        const allInvoices = await Invoice.find({ tenantId }).lean();
        
        const invoiceStatusTotals = {
          paid: allInvoices.filter(i => i.paymentState === PAYMENT_STATE.PAID).reduce((sum, i) => sum + i.amountTotal, 0),
          pending: allInvoices
            .filter(i => OPEN_PAYMENT_STATES.has(i.paymentState))
            .reduce((sum, i) => sum + i.amountTotal, 0),
          overdue: allInvoices.filter(i => i.paymentState === PAYMENT_STATE.OVERDUE).reduce((sum, i) => sum + i.amountTotal, 0),
        };

        data = [
          { name: 'Paid', value: Math.round(invoiceStatusTotals.paid) },
          { name: 'Pending', value: Math.round(invoiceStatusTotals.pending) },
          { name: 'Overdue', value: Math.round(invoiceStatusTotals.overdue) },
        ].filter(item => item.value > 0);
        break;

      case 'bill-status':
        const allBills = await Invoice.find({ tenantId, moveType: 'in_invoice' }).lean();
        
        const billStatusTotals = {
          paid: allBills.filter(isBillPaid).reduce((sum, b) => sum + b.amountTotal, 0),
          pending: allBills
            .filter(b => !isBillPaid(b) && !isBillOverdue(b) && !EXCLUDED_BILL_STATUSES.has(b.state))
            .reduce((sum, b) => sum + (Number(b.amountResidual) || 0), 0),
          overdue: allBills.filter(isBillOverdue).reduce((sum, b) => sum + (Number(b.amountResidual) || 0), 0),
        };

        data = [
          { name: 'Paid', value: Math.round(billStatusTotals.paid) },
          { name: 'Pending', value: Math.round(billStatusTotals.pending) },
          { name: 'Overdue', value: Math.round(billStatusTotals.overdue) },
        ].filter(item => item.value > 0);
        break;

      case 'invoice-timeline':
        const timelineInvoices = await Invoice.find({
          tenantId,
          dueDate: { $gte: startDate },
        })
          .sort({ dueDate: 1 })
          .lean();

        const invoicesByDate = new Map<string, { date: string; total: number; paid: number; pending: number }>();
        
        timelineInvoices.forEach((inv) => {
          const dateKey = groupBy === 'day' 
            ? new Date(inv.dueDate).toISOString().split('T')[0]
            : `${new Date(inv.dueDate).getFullYear()}-${String(new Date(inv.dueDate).getMonth() + 1).padStart(2, '0')}`;
          
          if (!invoicesByDate.has(dateKey)) {
            invoicesByDate.set(dateKey, { date: dateKey, total: 0, paid: 0, pending: 0 });
          }
          
          const entry = invoicesByDate.get(dateKey)!;
          entry.total += inv.amountTotal;
          if (inv.paymentState === PAYMENT_STATE.PAID) {
            entry.paid += inv.amountTotal;
          } else {
            entry.pending += inv.amountTotal;
          }
        });

        data = Array.from(invoicesByDate.values());
        break;

      case 'bill-timeline':
        const timelineBills = await Invoice.find({
          tenantId,
          moveType: 'in_invoice',
          dueDate: { $gte: startDate },
        })
          .sort({ dueDate: 1 })
          .lean();

        const billsByDate = new Map<string, { date: string; total: number; paid: number; pending: number }>();
        
        timelineBills.forEach((bill) => {
          const dateKey = groupBy === 'day' 
            ? new Date(bill.dueDate).toISOString().split('T')[0]
            : `${new Date(bill.dueDate).getFullYear()}-${String(new Date(bill.dueDate).getMonth() + 1).padStart(2, '0')}`;
          
          if (!billsByDate.has(dateKey)) {
            billsByDate.set(dateKey, { date: dateKey, total: 0, paid: 0, pending: 0 });
          }
          
          const entry = billsByDate.get(dateKey)!;
          entry.total += bill.amountTotal;
          if (isBillPaid(bill)) {
            entry.paid += bill.amountTotal;
          } else {
            entry.pending += bill.amountTotal;
          }
        });

        data = Array.from(billsByDate.values());
        break;

      case 'asset-category':
        const assets = await Asset.find({ tenantId }).lean();
        
        const assetsByCategory = new Map<string, number>();
        
        assets.forEach((asset) => {
          const category = asset.method || 'fixed';
          assetsByCategory.set(category, (assetsByCategory.get(category) || 0) + asset.originalValue);
        });

        data = Array.from(assetsByCategory.entries()).map(([name, value]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          value: Math.round(value),
        }));
        break;

      case 'asset-depreciation':
        const depreciationAssets = await Asset.find({
          tenantId,
          purchaseDate: { $gte: startDate },
        })
          .sort({ purchaseDate: 1 })
          .lean();

        const assetsByDate = new Map<string, { date: string; purchasePrice: number; currentValue: number; depreciation: number }>();
        
        depreciationAssets.forEach((asset) => {
          const dateKey = groupBy === 'day' 
            ? new Date(asset.purchaseDate).toISOString().split('T')[0]
            : `${new Date(asset.purchaseDate).getFullYear()}-${String(new Date(asset.purchaseDate).getMonth() + 1).padStart(2, '0')}`;
          
          if (!assetsByDate.has(dateKey)) {
            assetsByDate.set(dateKey, { date: dateKey, purchasePrice: 0, currentValue: 0, depreciation: 0 });
          }
          
          const entry = assetsByDate.get(dateKey)!;
          const currentValue = getCurrentBookValue(asset);
          entry.purchasePrice += asset.originalValue;
          entry.currentValue += currentValue;
          entry.depreciation += (asset.originalValue - currentValue);
        });

        data = Array.from(assetsByDate.values());
        break;

      case 'reconciliation-status':
        const reconciliations = await BankReconciliation.find({ tenantId }).lean();
        
        const reconStatusTotals = {
          reconciled: reconciliations.filter(r => r.reconciled).reduce((sum, r) => sum + Math.abs(r.bankBalance - r.ledgerBalance), 0),
          pending: reconciliations.filter(r => !r.reconciled).reduce((sum, r) => sum + Math.abs(r.bankBalance - r.ledgerBalance), 0),
        };

        data = [
          { name: 'Reconciled', value: Math.round(reconStatusTotals.reconciled) },
          { name: 'Pending', value: Math.round(reconStatusTotals.pending) },
        ].filter(item => item.value > 0);
        break;

      default:
        return NextResponse.json({ error: 'Invalid data type' }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Visualization API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch visualization data' },
      { status: 500 }
    );
  }
}
