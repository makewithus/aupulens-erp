import { auth } from '@/auth';
import ActivityLog from '@/models/ActivityLog';
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
      tenantId: (session.user as any).tenantId || "default-tenant",
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
