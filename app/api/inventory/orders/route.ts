import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import InventoryOrder from '@/models/InventoryOrder';
import { generateInventoryOrderNumber } from '@/lib/inventory/orderNumbering';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || (session.user?.role !== 'inventory' && session.user?.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    await connectDB();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const skip = (page - 1) * limit;

    const query: any = { tenantId };
    const status = searchParams.get("status");
    if (status) query.status = status;

    const [total, orders] = await Promise.all([
      InventoryOrder.countDocuments(query),
      InventoryOrder.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);

    return NextResponse.json({ orders, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || (session.user?.role !== 'inventory' && session.user?.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    const tenantId = (session.user as any).tenantId || "default-tenant";
    await connectDB();
    const body = await req.json();

    const order = await InventoryOrder.create({
      ...body,
      orderNumber: body.orderNumber?.trim() || (await generateInventoryOrderNumber(tenantId)),
      createdBy: session.user.id,
      tenantId,
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
