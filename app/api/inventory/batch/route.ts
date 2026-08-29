import { NextRequest, NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import Batch from '@/models/Batch';

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
