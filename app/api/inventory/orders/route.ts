import { NextRequest, NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import InventoryOrder from '@/models/inventory/InventoryOrder';
import { generateInventoryOrderNumber } from '@/lib/inventory/orderNumbering';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || (session.user?.role !== 'inventory' && session.user?.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
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


    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();
    const body = await req.json();

    // Always atomically consume the next number here — never trust a
    // client-supplied orderNumber. The "New Order" form only ever shows a
    // non-consuming preview of this same counter (see next-number/route.ts),
    // so honoring body.orderNumber meant the counter was never actually
    // incremented on submit: every dialog open re-previewed the same
    // number, and the second order ever created always 409'd.
    const order = await InventoryOrder.create({
      ...body,
      orderNumber: await generateInventoryOrderNumber(tenantId),
      createdBy: session.user.id,
      tenantId,
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating order:', error);
    if (error?.name === 'ValidationError') {
      const fieldErrors = Object.values(error.errors || {})
        .map((err: any) => err.message)
        .join(' ');
      return NextResponse.json({ error: fieldErrors || 'Invalid order data' }, { status: 400 });
    }
    if (error?.code === 11000) {
      return NextResponse.json({ error: 'That order number is already in use. Please choose another.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
