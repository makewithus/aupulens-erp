import { NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import Invoice from '@/models/Invoice';
import JournalEntry from '@/models/JournalEntry';
import { DOCUMENT_STATUS, PAYMENT_STATE } from '@/lib/constants/statuses';
import {
  buildPostedCashFlowTotals,
  buildPostedJournalReport,
} from '@/lib/accounting/reports';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'finance')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const body = await req.json();
    const { prompt } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const lowerPrompt = prompt.toLowerCase();

    // Simple keyword-based parsing
    if (lowerPrompt.includes('unpaid invoice') || lowerPrompt.includes('outstanding invoice')) {
      const amountMatch = prompt.match(/(\d+)/);
      const amount = amountMatch ? parseInt(amountMatch[1]) : 0;

      const query: Record<string, unknown> = {
        tenantId,
        moveType: 'out_invoice',
        paymentState: { $in: [PAYMENT_STATE.NOT_PAID, PAYMENT_STATE.PARTIAL, PAYMENT_STATE.OVERDUE] },
      };
      if (amount > 0) {
        query.amountTotal = { $gte: amount };
      }

      const invoices = await Invoice.find(query).limit(10);

      return NextResponse.json({
        response: `Found ${invoices.length} unpaid invoices${amount > 0 ? ` over ${amount}` : ''}`,
        data: invoices,
        type: 'invoices',
      });
    } else if (lowerPrompt.includes('revenue') || lowerPrompt.includes('income')) {
      const report = await buildPostedJournalReport({
        tenantId,
      });
      const totalRevenue = report.income.total;

      return NextResponse.json({
        response: `Total posted revenue: ₹${totalRevenue.toLocaleString('en-IN')}`,
        data: {
          totalRevenue,
          accountCount: Object.keys(report.income.accounts).length,
          accountingBasis: 'posted_journal_entries',
        },
        type: 'summary',
      });
    } else if (lowerPrompt.includes('payable') || lowerPrompt.includes('vendor bill')) {
      const vendorMatch = prompt.match(/vendor\s+(\w+)/i);
      const query: Record<string, unknown> = {
        tenantId,
        moveType: 'in_invoice',
        paymentState: {
          $in: [
            PAYMENT_STATE.NOT_PAID,
            PAYMENT_STATE.IN_PAYMENT,
            PAYMENT_STATE.PARTIAL,
            PAYMENT_STATE.OVERDUE,
          ],
        },
      };

      if (vendorMatch) {
        query.name = { $regex: vendorMatch[1], $options: 'i' };
      }

      const bills = await Invoice.find(query).populate('partnerId', 'header.name').limit(10);
      const totalPayable = bills.reduce((sum, bill) => sum + (Number(bill.amountResidual) || 0), 0);

      return NextResponse.json({
        response: `Outstanding payables: ₹${totalPayable.toLocaleString('en-IN')} across ${bills.length} bills`,
        data: bills,
        type: 'bills',
      });
    } else if (lowerPrompt.includes('transaction') || lowerPrompt.includes('ledger')) {
      const transactions = await JournalEntry.find({
        tenantId,
        status: DOCUMENT_STATUS.POSTED,
      })
        .sort({ 'header.date': -1 })
        .limit(10);

      return NextResponse.json({
        response: `Showing ${transactions.length} recent posted journal entries`,
        data: transactions,
        type: 'transactions',
      });
    } else if (lowerPrompt.includes('cash flow')) {
      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);

      const cashFlow = await buildPostedCashFlowTotals({
        tenantId,
        startDate: currentMonth,
      });

      return NextResponse.json({
        response: `Current month posted cash flow: ₹${cashFlow.net.toLocaleString('en-IN')} (Inflow: ₹${cashFlow.inflow.toLocaleString('en-IN')}, Outflow: ₹${cashFlow.outflow.toLocaleString('en-IN')})`,
        data: {
          inflow: cashFlow.inflow,
          outflow: cashFlow.outflow,
          netCashFlow: cashFlow.net,
          accountingBasis: 'posted_journal_entries',
        },
        type: 'summary',
      });
    } else {
      return NextResponse.json({
        response: 'I can help you with:\n- Unpaid invoices\n- Revenue analysis\n- Outstanding payables\n- Recent transactions\n- Cash flow\n\nTry asking: "Show unpaid invoices over 10000" or "What is the total revenue?"',
        data: null,
        type: 'help',
      });
    }
  } catch (error) {
    console.error('Error processing AI request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
