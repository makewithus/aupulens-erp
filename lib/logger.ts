import { auth } from '@/auth';
import ActivityLog from '@/models/admin/ActivityLog';
import connectDB from '@/lib/db';

interface LogActivityParams {
  activity: string;
  details?: string;
  req?: Request;
}

export async function logActivity({ activity, details, req }: LogActivityParams) {
  try {
    const session = await auth();
    if (!session?.user) return;

    await connectDB();

    const ipAddress = req?.headers.get('x-forwarded-for') || req?.headers.get('x-real-ip') || 'unknown';
    const userAgent = req?.headers.get('user-agent') || 'unknown';

    await ActivityLog.create({
      // Never misattribute an activity log to the shared default-tenant bucket
      // when the session lacks a tenant — record it as "unknown" so it's
      // visibly anomalous rather than silently folded into a real tenant.
      tenantId: (session.user as any).tenantId || "unknown",
      userId: session.user.id,
      userName: session.user.name,
      userEmail: session.user.email,
      userRole: session.user.role,
      activity,
      details,
      ipAddress,
      userAgent,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}
