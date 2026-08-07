import { NextRequest, NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import ActivityLog from '@/models/ActivityLog';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session || !session.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const skip = parseInt(searchParams.get('skip') || '0');
    const userRole = searchParams.get('role');
    const userId = searchParams.get('userId');

    const query: Record<string, unknown> = { tenantId };
    if (userRole) query.userRole = userRole;
    if (userId) query.userId = userId;

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
      { error: (error as Error).message || 'Something went wrong' },
      { status: 500 }
    );
  }
}
