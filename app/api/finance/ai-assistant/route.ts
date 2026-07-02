import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import { randomUUID } from 'crypto';
import JournalEntry from '@/models/JournalEntry';
import Invoice from '@/models/Invoice';
import {
  buildPostedIncomeExpenseSeries,
  buildPostedJournalReport,
} from '@/lib/accounting/reports';
import { DOCUMENT_STATUS } from '@/lib/constants/statuses';
import { callClaude, callClaudeWithHistory, type ChatTurn } from '@/lib/ai/claude';
import ChatHistory from '@/models/ChatHistory';
import { detectAccountingActionIntent } from '@/lib/accounting/aiIntent';
import { buildActionPreview, AiActionError } from '@/lib/accounting/aiActions';
import AiActionProposal from '@/models/AiActionProposal';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user?.role !== 'finance') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { message, conversationId: incomingConversationId } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    await connectDB();

    const conversationId: string = incomingConversationId || randomUUID();
    const userId = (session.user as any).id as string;

    // Restore prior turns for multi-turn context
    const existingHistory = await ChatHistory.findOne(
      { tenantId, conversationId },
      { messages: 1 }
    ).lean();
    const priorTurns: ChatTurn[] = (existingHistory?.messages ?? []).map(
      (m: any) => ({ role: m.role, content: m.content })
    );

    // AI never auto-commits financial actions: if the message matches a known
    // destructive/financial intent, propose it and require explicit user
    // confirmation via /api/finance/accounting/ai-actions/[id]/confirm instead
    // of executing it here.
    const intent = detectAccountingActionIntent(message);
    if (intent) {
      try {
        const preview = await buildActionPreview(intent.actionType, intent.params, tenantId);
        const proposal = await AiActionProposal.create({
          tenantId,
          userId,
          module: 'finance',
          actionType: intent.actionType,
          params: intent.params,
          preview,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        });

        return NextResponse.json({
          response: `${preview.summary}\n\nThis requires your confirmation before it's applied.`,
          proposal: { id: proposal._id, actionType: intent.actionType, preview },
        });
      } catch (intentError: any) {
        const msg = intentError instanceof AiActionError ? intentError.message : 'Failed to prepare that action.';
        return NextResponse.json({ response: `I couldn't prepare that action: ${msg}` });
      }
    }

    // Fetch finance-specific data
    const data = await fetchFinanceData(tenantId);
    const response = await generateResponse(message, data, priorTurns);

    // Persist both turns to ChatHistory (upsert by tenantId + conversationId)
    const now = new Date();
    await ChatHistory.findOneAndUpdate(
      { tenantId, conversationId },
      {
        $setOnInsert: {
          tenantId,
          conversationId,
          userId,
          module: 'finance',
          title: message.slice(0, 80),
        },
        $push: {
          messages: {
            $each: [
              { role: 'user', content: message, timestamp: now },
              { role: 'assistant', content: response, timestamp: new Date(now.getTime() + 1) },
            ],
          },
        },
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ response, conversationId });
  } catch (error) {
    console.error('Finance AI Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

async function fetchFinanceData(tenantId: string) {
  const [transactions, invoices, bills, ledgerReport] = await Promise.all([
    JournalEntry.find({ tenantId, status: DOCUMENT_STATUS.POSTED })
      .sort({ 'header.date': -1 })
      .limit(20)
      .lean(),
    Invoice.find({ tenantId, moveType: 'out_invoice' })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    Invoice.find({ tenantId, moveType: 'in_invoice' })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    buildPostedJournalReport({ tenantId }),
  ]);

  const totalRevenue = ledgerReport.income.total;
  const totalExpenses = ledgerReport.expense.total;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const incomeExpenseSeries = await buildPostedIncomeExpenseSeries({
    tenantId,
    startDate: start,
    groupBy: 'month',
  });

  const monthlyRevenue = incomeExpenseSeries.map((item, index) => ({
    _id: { month: index + 1 },
    total: item.revenue,
  }));

  const monthlyExpenses = incomeExpenseSeries.map((item, index) => ({
    _id: { month: index + 1 },
    total: item.expenses,
  }));

  return {
    summary: {
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
      transactionCount: transactions.length,
      invoiceCount: invoices.length,
      billCount: bills.length,
      accountingBasis: 'posted_journal_entries',
    },
    recentTransactions: transactions.slice(0, 5),
    recentInvoices: invoices.slice(0, 5),
    monthlyRevenue,
    monthlyExpenses,
  };
}

async function generateResponse(
  message: string,
  data: any,
  priorTurns: ChatTurn[] = []
): Promise<string> {
  const prompt = `You are an expert finance AI assistant for an ERP system.

User Question: "${message}"

Data Category: Finance
Action Type: Analysis & Insights

Available Data:
${JSON.stringify(data, null, 2)}

Instructions:
1. Analyze the user's question carefully
2. Use the provided data to give accurate, specific answers
3. Format currency values with ₹ and proper thousand separators (Indian ERP)
4. Provide insights and actionable recommendations
5. Be conversational and helpful
6. If you detect forecast/prediction requests, analyze trends and provide predictions
7. If data is missing, acknowledge it and provide what's available
8. Use bullet points for clarity
9. Add business context and interpretation
10. Keep responses concise but comprehensive`;

  const opts = {
    systemPrompt:
      'You are a precise finance analytics assistant. Use only the provided data. Never invent numbers.',
    maxTokens: 1024,
  };

  try {
    if (priorTurns.length > 0) {
      return await callClaudeWithHistory(priorTurns, prompt, opts);
    }
    return await callClaude(prompt, opts);
  } catch {
    return generateSimpleResponse(message, data);
  }
}

function generateSimpleResponse(message: string, data: any): string {
  const lowerMessage = message.toLowerCase();

  const isPredictive =
    lowerMessage.includes('next month') ||
    lowerMessage.includes('predict') ||
    lowerMessage.includes('forecast');

  if (isPredictive && data.monthlyRevenue?.length > 0) {
    const prediction = predictNextMonth(data.monthlyRevenue);
    return (
      `Finance forecast for next month:\n\n` +
      `• Predicted Revenue: ${formatCurrency(prediction.predicted)}\n` +
      `• Current Month: ${formatCurrency(data.summary.totalRevenue)}\n` +
      `• Expected Change: ${prediction.changePct.toFixed(1)}%\n\n` +
      `Analysis: Based on the last 12 months of data, the model projects ` +
      `${formatCurrency(prediction.predicted)} in revenue for next month.`
    );
  }

  return (
    `Finance Overview:\n\n` +
    `• Total Revenue: ${formatCurrency(data.summary.totalRevenue)}\n` +
    `• Total Expenses: ${formatCurrency(data.summary.totalExpenses)}\n` +
    `• Net Income: ${formatCurrency(data.summary.netIncome)}\n` +
    `• Transactions: ${data.summary.transactionCount}\n` +
    `• Invoices: ${data.summary.invoiceCount}\n` +
    `• Bills: ${data.summary.billCount}`
  );
}

function predictNextMonth(monthlyData: any[]) {
  const vals = monthlyData.map((m: any) => m.total || 0);
  const n = vals.length;
  if (n === 0) return { predicted: 0, changePct: 0 };

  const xs = vals.map((_, i) => i);
  const sumX = xs.reduce((a: number, b: number) => a + b, 0);
  const sumY = vals.reduce((a: number, b: number) => a + b, 0);
  const sumXY = xs.reduce((s: number, x: number, i: number) => s + x * vals[i], 0);
  const sumXX = xs.reduce((s: number, x: number) => s + x * x, 0);

  const denom = n * sumXX - sumX * sumX;
  let slope = 0;
  if (denom !== 0) slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const predicted = Math.max(0, intercept + slope * n);
  const last = vals[n - 1] || 0;
  const changePct = last > 0 ? ((predicted - last) / last) * 100 : 0;

  return { predicted, changePct };
}

function formatCurrency(num: number) {
  return '₹' + Number(num || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
