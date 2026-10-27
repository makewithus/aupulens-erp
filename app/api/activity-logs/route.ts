import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import ActivityLog from '@/models/admin/ActivityLog';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['admin', 'master-admin'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const { searchParams } = new URL(req.url);
    const rawLimit = parseInt(searchParams.get('limit') || '100', 10);
    const limit = isNaN(rawLimit) || rawLimit <= 0 ? 100 : Math.min(rawLimit, 500);
    const rawSkip = parseInt(searchParams.get('skip') || '0', 10);
    const skip = isNaN(rawSkip) || rawSkip < 0 ? 0 : rawSkip;
    const userRole = searchParams.get('role');
    const userId = searchParams.get('userId');

    const query: Record<string, unknown> = { tenantId };
    if (userRole) query.userRole = userRole;
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return NextResponse.json({ error: 'Invalid userId parameter' }, { status: 400 });
      }
      query.userId = userId;
    }

    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    if (dateFrom || dateTo) {
      const range: any = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) range.$gte = new Date(dateFrom);
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      if (Object.keys(range).length > 0) query.timestamp = range;
    }

    const logs = await ActivityLog.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const total = await ActivityLog.countDocuments(query);

    return NextResponse.json({ logs, total }, { status: 200 });
  } catch (error: unknown) {
    console.error('Get activity logs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity logs' },
      { status: 500 }
    );
  }
}
