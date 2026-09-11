import connectDB from "@/lib/db";
import AdminAccessRequest from "@/models/platform/AdminAccessRequest";
import { ADMIN_ACCESS_REQUEST_STATUS } from "@/lib/constants/statuses";

export interface ActiveAccessGrant {
  requestId: string;
  tenantId: string;
  requestedScope: "read" | "write";
  reason: string;
  expiresAt: string;
}

/**
 * The one function a "you are in an active elevated session" banner reads.
 * Expiry is checked LIVE here (`expiresAt < now`) — correctness never
 * depends on the cron sweep (app/api/cron/platform/access-session-expiry)
 * having run; that cron only tidies the stored `status` field for reporting.
 */
export async function getActiveAccessGrant(
  adminUserId: string,
  tenantId: string,
): Promise<ActiveAccessGrant | null> {
  await connectDB();
  const request = await AdminAccessRequest.findOne({
    adminUserId,
    tenantId,
    status: ADMIN_ACCESS_REQUEST_STATUS.APPROVED,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!request || !request.expiresAt || request.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return {
    requestId: String(request._id),
    tenantId: request.tenantId,
    requestedScope: request.requestedScope,
    reason: request.reason,
    expiresAt: request.expiresAt.toISOString(),
  };
}
