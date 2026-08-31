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
    if (status && status !== "all") query.status = status;

    // AI-native "redirect with filters" support — additive: omitting these
    // params leaves every existing caller's behavior unchanged.
    const search = searchParams.get("search")?.trim();
    if (search) {
      const re = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      query.$or = [{ orderNumber: re }, { customerName: re }];
    }
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom || dateTo) {
      query.orderDate = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) query.orderDate.$gte = new Date(dateFrom);
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query.orderDate.$lte = end;
      }
      if (Object.keys(query.orderDate).length === 0) delete query.orderDate;
    }
    const amountMin = searchParams.get("amountMin");
    const amountMax = searchParams.get("amountMax");
    if (amountMin || amountMax) {
      query.totalAmount = {};
      if (amountMin && !isNaN(Number(amountMin))) query.totalAmount.$gte = Number(amountMin);
      if (amountMax && !isNaN(Number(amountMax))) query.totalAmount.$lte = Number(amountMax);
      if (Object.keys(query.totalAmount).length === 0) delete query.totalAmount;
    }

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
