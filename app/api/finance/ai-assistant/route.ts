import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import JournalEntry from '@/models/JournalEntry';
import Invoice from '@/models/Invoice';
import {
  buildPostedIncomeExpenseSeries,
  buildPostedJournalReport,
} from '@/lib/accounting/reports';
import { DOCUMENT_STATUS } from '@/lib/constants/statuses';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user?.role !== 'finance') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    const tenantId = (session.user as any).tenantId || "default-tenant";
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Fetch finance-specific data
    const data = await fetchFinanceData(tenantId);

    // Generate response
    const response = await generateResponse(message, data);

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Finance AI Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

async function fetchFinanceData(tenantId: string) {
  const [transactions, invoices, bills, ledgerReport] = await Promise.all([
    JournalEntry.find({ tenantId, status: DOCUMENT_STATUS.POSTED })
      .sort({ "header.date": -1 })
      .limit(20)
      .lean(),
    Invoice.find({ tenantId, moveType: "out_invoice" })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    Invoice.find({ tenantId, moveType: "in_invoice" })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    buildPostedJournalReport({ tenantId }),
  ]);

  const totalRevenue = ledgerReport.income.total;
  const totalExpenses = ledgerReport.expense.total;

  // Monthly aggregation for last 12 months
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const incomeExpenseSeries = await buildPostedIncomeExpenseSeries({
    tenantId,
    startDate: start,
    groupBy: "month",
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
      accountingBasis: "posted_journal_entries",
    },
    recentTransactions: transactions.slice(0, 5),
    recentInvoices: invoices.slice(0, 5),
    monthlyRevenue,
    monthlyExpenses,
  };
}

async function generateResponse(message: string, data: any): Promise<string> {
  try {
    // Create rich context prompt for Gemini
    const contextPrompt = `You are an expert finance AI assistant for an ERP system. 

User Question: "${message}"

Data Category: Finance
Action Type: Analysis & Insights

Available Data:
${JSON.stringify(data, null, 2)}

Instructions:
1. Analyze the user's question carefully
2. Use the provided data to give accurate, specific answers
3. Format currency values with $ and proper thousand separators
4. Provide insights and actionable recommendations
5. Be conversational and helpful
6. If you detect forecast/prediction requests, analyze trends and provide predictions
7. If data is missing, acknowledge it and provide what's available
8. Use bullet points for clarity
9. Add business context and interpretation
10. Keep responses concise but comprehensive

Please provide a detailed, helpful response based on the data and user's question.`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: contextPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024
        }
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!geminiResponse.ok) {
      throw new Error('Gemini API request failed');
    }

    const geminiData = await geminiResponse.json();
    const generatedText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'Sorry, I could not generate a response';

    return generatedText;
  } catch (error) {
    console.error('Error generating Gemini response:', error);
    // Fallback to simple response
    return generateSimpleResponse(message, data);
  }
}

function generateSimpleResponse(message: string, data: any): string {
  const lowerMessage = message.toLowerCase();

  // Check if predictive query
  const isPredictive =
    lowerMessage.includes('next month') ||
    lowerMessage.includes('predict') ||
    lowerMessage.includes('forecast');

  if (isPredictive && data.monthlyRevenue?.length > 0) {
    const prediction = predictNextMonth(data.monthlyRevenue);
    return `Finance forecast for next month:\n\n• Predicted Revenue: ${formatCurrency(
      prediction.predicted
    )}\n• Current Month: ${formatCurrency(
      data.summary.totalRevenue
    )}\n• Expected Change: ${prediction.changePct.toFixed(
      1
    )}%\n\nAnalysis: Based on the last 12 months of data, the model projects ${formatCurrency(
      prediction.predicted
    )} in revenue for next month.`;
  }

  // Default response
  return `Finance Overview:\n\n• Total Revenue: ${formatCurrency(
    data.summary.totalRevenue
  )}\n• Total Expenses: ${formatCurrency(
    data.summary.totalExpenses
  )}\n• Net Income: ${formatCurrency(
    data.summary.netIncome
  )}\n• Transactions: ${data.summary.transactionCount}\n• Invoices: ${
    data.summary.invoiceCount
  }\n• Bills: ${data.summary.billCount}`;
}

function predictNextMonth(monthlyData: any[]) {
  const vals = monthlyData.map((m: any) => m.total || 0);
  const n = vals.length;
  if (n === 0) return { predicted: 0, changePct: 0 };

  const xs = vals.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = vals.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * vals[i], 0);
  const sumXX = xs.reduce((s, x) => s + x * x, 0);

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
  return (
    '$' +
    Number(num || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
  );
}
