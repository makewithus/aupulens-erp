import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import InventoryItem from '@/models/InventoryItem';
import Batch from '@/models/Batch';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user?.role !== 'inventory') {
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

    const data = await fetchInventoryData(tenantId);
    const response = await generateResponse(message, data);

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Inventory AI Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

async function fetchInventoryData(tenantId: string) {
  const items = await (InventoryItem as any).find({ tenantId }).lean();

  const totalItems = items.length;
  const lowStockItems = items.filter(
    (item: any) => item.quantity <= (item.reorderPoint || 10)
  );
  const outOfStock = items.filter((item: any) => item.quantity === 0);

  const totalValue = items.reduce(
    (sum: number, item: any) =>
      sum + (item.quantity || 0) * (item.unitPrice || 0),
    0
  );

  return {
    summary: {
      totalItems,
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStock.length,
      totalValue,
    },
    lowStockItems: lowStockItems.slice(0, 10),
    recentItems: items.slice(0, 5),
  };
}

async function generateResponse(message: string, data: any): Promise<string> {
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes('low stock') ||
    lowerMessage.includes('reorder') ||
    lowerMessage.includes('alert')
  ) {
    let response = `Low Stock Alert:\n\n• Items Low in Stock: ${data.summary.lowStockCount}\n• Out of Stock: ${data.summary.outOfStockCount}`;

    if (data.lowStockItems?.length > 0) {
      response += `\n\nItems Needing Attention:\n${data.lowStockItems
        .slice(0, 5)
        .map(
          (item: any) =>
            `• ${item.name || item.sku || 'Unknown'}: ${item.quantity || 0} units`
        )
        .join('\n')}`;
    }

    return response;
  }

  return `Inventory Overview:\n\n• Total Items: ${
    data.summary.totalItems
  }\n• Low Stock Items: ${data.summary.lowStockCount}\n• Out of Stock: ${
    data.summary.outOfStockCount
  }\n• Total Inventory Value: ${formatCurrency(data.summary.totalValue)}`;
}

function formatCurrency(num: number) {
  return (
    '$' +
    Number(num || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
  );
}
