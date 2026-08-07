import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import { randomUUID } from 'crypto';
import SaleOrder from '@/models/SaleOrder';
import SalesQuotation from '@/models/SalesQuotation';
import DeliveryChallan from '@/models/DeliveryChallan';
import { type ChatTurn } from '@/lib/ai/claude';
import { resolveTenantAiSettings, callClaudeForTenant } from '@/lib/ai/tenantAi';
import { safeContextJson } from '@/lib/ai/sanitizeContext';
import ChatHistory from '@/models/ChatHistory';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user?.role !== 'sales') {
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

    const data = await fetchSalesData(tenantId);
    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
    const genResult = await generateResponse(message, data, priorTurns, tenantId, tier, aiSettings);
    // strictNullChecks is off project-wide, which breaks discriminated-union
    // narrowing on `genResult.gated` — narrowing on `"text" in genResult`
    // instead works either way (see lib/ai/claude.ts migration notes).
    if (!("text" in genResult)) {
      return NextResponse.json(
        {
          error: genResult.error,
          code: genResult.code,
          currentTier: genResult.currentTier,
          requiredAction: genResult.requiredAction,
        },
        { status: 403 }
      );
    }
    const response = genResult.text;

    // Persist both turns to ChatHistory (upsert by tenantId + conversationId)
    const now = new Date();
    await ChatHistory.findOneAndUpdate(
      { tenantId, conversationId },
      {
        $setOnInsert: {
          tenantId,
          conversationId,
          userId,
          module: 'sales',
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
    console.error('Sales AI Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

async function fetchSalesData(tenantId: string) {
  const orders = await (SaleOrder as any)
    .find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce(
    (sum: number, order: any) => sum + (order.totals?.amountTotal || 0),
    0
  );

  const productCounts: { [key: string]: number } = {};
  orders.forEach((order: any) => {
    order.orderLines?.forEach((item: any) => {
      const name = item.name || 'Unknown';
      productCounts[name] = (productCounts[name] || 0) + (item.productQty || 1);
    });
  });

  const topProducts = Object.entries(productCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const monthlyAgg = await (SaleOrder as any)
    .aggregate([
      { $match: { tenantId, createdAt: { $gte: start } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          total: { $sum: { $ifNull: ['$totals.amountTotal', 0] } },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ])
    .exec();

  return {
    summary: {
      totalOrders,
      totalRevenue,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    },
    topProducts,
    recentOrders: orders.slice(0, 5),
    monthlyTotals: monthlyAgg,
  };
}

type GenerateResult =
  | { gated: false; text: string }
  | { gated: true; error: string; code: string; currentTier?: string; requiredAction?: string };

async function generateResponse(
  message: string,
  data: any,
  priorTurns: ChatTurn[],
  tenantId: string,
  tier: string,
  aiSettings: Parameters<typeof callClaudeForTenant>[2]
): Promise<GenerateResult> {
  const prompt = `You are an expert sales AI assistant for an ERP system.

User Question: "${message}"

Available Sales Data:
${safeContextJson(data, { maxArray: 6 })}

Instructions:
1. Answer using the provided data only. Do not invent numbers.
2. Format currency values with ₹ (Indian ERP).
3. If the user asks for forecasts or predictions, analyze monthly trends and extrapolate.
4. Use bullet points for clarity. Be concise but complete.
5. If data is missing or insufficient, say so clearly.`;

  const opts = {
    systemPrompt: "You are a precise sales analytics assistant. For DATA questions use only the figures given (never invent numbers); for HOW-TO questions give clear step-by-step app guidance and do NOT reference raw data. NEVER print internal database IDs (partner/customer/order IDs) or raw JSON — refer to things by their human name/number. Reply organised and concise.",
    maxTokens: 1024,
  };

  try {
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, {
      ...opts,
      history: priorTurns,
    });
    if ("text" in result) {
      return { gated: false, text: result.text };
    }
    return {
      gated: true,
      error: result.error,
      code: result.code,
      currentTier: result.currentTier,
      requiredAction: result.requiredAction,
    };
  } catch {
    return { gated: false, text: generateSimpleResponse(message, data) };
  }
}

function generateSimpleResponse(message: string, data: any): string {
  const lowerMessage = message.toLowerCase();

  const isPredictive =
    lowerMessage.includes('next month') ||
    lowerMessage.includes('predict') ||
    lowerMessage.includes('forecast');

  if (isPredictive && data.monthlyTotals?.length > 0) {
    const prediction = predictNextMonth(data.monthlyTotals);
    return (
      `Sales forecast for next month:\n\n` +
      `• Predicted Sales: ${formatCurrency(prediction.predicted)}\n` +
      `• Current Revenue: ${formatCurrency(data.summary.totalRevenue)}\n` +
      `• Expected Change: ${prediction.changePct.toFixed(1)}%\n\n` +
      `Top Products:\n${data.topProducts.map((p: any) => `• ${p.name}: ${p.count} units`).join('\n')}`
    );
  }

  let response =
    `Sales Overview:\n\n` +
    `• Total Orders: ${data.summary.totalOrders}\n` +
    `• Total Revenue: ${formatCurrency(data.summary.totalRevenue)}\n` +
    `• Average Order Value: ${formatCurrency(data.summary.averageOrderValue)}`;

  if (data.topProducts?.length > 0) {
    response += `\n\nTop Products:\n${data.topProducts.map((p: any) => `• ${p.name}: ${p.count} units`).join('\n')}`;
  }

  return response;
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
