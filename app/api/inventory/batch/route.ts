import { NextRequest, NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import Batch from '@/models/inventory/Batch';

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
    const query: any = { tenantId };

    const status = searchParams.get('status');
    if (status && status !== 'all') query.status = status;

    const search = searchParams.get('search')?.trim();
    if (search) {
      const re = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      query.$or = [{ batchNumber: re }, { lotNumber: re }, { itemName: re }, { itemCode: re }];
    }

    // AI-native "redirect with filters" support — a date range on
    // expiryDate (the most common "batch" question is expiry-driven) and a
    // quantity range. Additive: omitting these params leaves every existing
    // caller's behavior unchanged.
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    if (dateFrom || dateTo) {
      query.expiryDate = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) query.expiryDate.$gte = new Date(dateFrom);
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query.expiryDate.$lte = end;
      }
      if (Object.keys(query.expiryDate).length === 0) delete query.expiryDate;
    }
    const quantityMin = searchParams.get('quantityMin');
    const quantityMax = searchParams.get('quantityMax');
    if (quantityMin || quantityMax) {
      query.quantity = {};
      if (quantityMin && !isNaN(Number(quantityMin))) query.quantity.$gte = Number(quantityMin);
      if (quantityMax && !isNaN(Number(quantityMax))) query.quantity.$lte = Number(quantityMax);
      if (Object.keys(query.quantity).length === 0) delete query.quantity;
    }

    const baseQuery = Batch.find(query).sort({ createdAt: -1 });

    // Pagination is opt-in via `page` — Analytics and Reports need the full
    // matching set to compute aging/compliance figures, so omitting `page`
    // must keep returning everything exactly as before.
    const pageParam = searchParams.get('page');
    if (!pageParam) {
      const batches = await baseQuery.lean();
      return NextResponse.json({ batches, total: batches.length, page: 1, totalPages: 1 });
    }

    const page = Math.max(1, parseInt(pageParam));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10')));
    const skip = (page - 1) * limit;

    const [total, batches] = await Promise.all([
      Batch.countDocuments(query),
      baseQuery.skip(skip).limit(limit).lean(),
    ]);

    return NextResponse.json({ batches, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    console.error('Error fetching batches:', error);
    return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 500 });
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

    const batch = await Batch.create({
      ...body,
      createdBy: session.user.id,
    
    tenantId,
    });

    return NextResponse.json({ batch }, { status: 201 });
  } catch (error) {
    console.error('Error creating batch:', error);
    return NextResponse.json({ error: 'Failed to create batch' }, { status: 500 });
  }
}
