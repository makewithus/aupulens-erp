import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import SalesOrder from '@/models/SalesOrder';
import SalesQuotation from '@/models/SalesQuotation';
import DeliveryChallan from '@/models/DeliveryChallan';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user?.role !== 'sales') {
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

    const data = await fetchSalesData(tenantId);
    const response = await generateResponse(message, data);

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Sales AI Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

async function fetchSalesData(tenantId: string) {
  const orders = await (SalesOrder as any)
    .find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce(
    (sum: number, order: any) => sum + (order.total || 0),
    0
  );

  const productCounts: { [key: string]: number } = {};
  orders.forEach((order: any) => {
    order.items?.forEach((item: any) => {
      const name = item.productName || item.description || 'Unknown';
      productCounts[name] = (productCounts[name] || 0) + (item.quantity || 1);
    });
  });

  const topProducts = Object.entries(productCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Monthly aggregation
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const monthlyAgg = await (SalesOrder as any)
    .aggregate([
      { $match: { tenantId, createdAt: { $gte: start } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          total: { $sum: { $ifNull: ['$total', 0] } },
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

async function generateResponse(message: string, data: any): Promise<string> {
  const lowerMessage = message.toLowerCase();

  const isPredictive =
    lowerMessage.includes('next month') ||
    lowerMessage.includes('predict') ||
    lowerMessage.includes('forecast');

  if (isPredictive && data.monthlyTotals?.length > 0) {
    const prediction = predictNextMonth(data.monthlyTotals);
    return `Sales forecast for next month:\n\n• Predicted Sales: ${formatCurrency(
      prediction.predicted
    )}\n• Current Revenue: ${formatCurrency(
      data.summary.totalRevenue
    )}\n• Expected Change: ${prediction.changePct.toFixed(
      1
    )}%\n\nTop Products:\n${data.topProducts
      .map((p: any) => `• ${p.name}: ${p.count} units`)
      .join('\n')}`;
  }

  let response = `Sales Overview:\n\n• Total Orders: ${
    data.summary.totalOrders
  }\n• Total Revenue: ${formatCurrency(
    data.summary.totalRevenue
  )}\n• Average Order Value: ${formatCurrency(
    data.summary.averageOrderValue
  )}`;

  if (data.topProducts?.length > 0) {
    response += `\n\nTop Products:\n${data.topProducts
      .map((p: any) => `• ${p.name}: ${p.count} units`)
      .join('\n')}`;
  }

  return response;
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
