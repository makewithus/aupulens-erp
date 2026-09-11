import mongoose from "mongoose";
import connectDB from "@/lib/db";
import AdminAccessRequest from "@/models/platform/AdminAccessRequest";
import {
  ADMIN_ACCESS_REQUEST_STATUS,
  ADMIN_ACCESS_SCOPE,
  ADMIN_CAPABILITY,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
  type AdminAccessScope,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { hasCapability, requireCapability } from "@/lib/platform/auth/adminRbac";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

export class AccessRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "AccessRequestError";
  }
}

const SESSION_HOURS = 4;

/**
 * Source doc §26. `write` scope requires IMPERSONATE_WRITE — checked here,
 * not just left to the approver's judgement, so a SUPPORT_ADMIN/
 * READ_ONLY_ADMIN can never even file a write request (Part 2.7: "not
 * available to SUPPORT_ADMIN or READ_ONLY_ADMIN").
 */
export async function requestOrgAccess(
  actor: AdminActor,
  tenantId: string,
  reason: string,
  requestedScope: AdminAccessScope,
): Promise<string> {
  await requireCapability(actor, ADMIN_CAPABILITY.REQUEST_ORG_ACCESS);
  if (!reason || !reason.trim()) {
    throw new AccessRequestError("A reason is required to request organisation access.", 400);
  }
  if (requestedScope === ADMIN_ACCESS_SCOPE.WRITE && !(await hasCapability(actor, ADMIN_CAPABILITY.IMPERSONATE_WRITE))) {
    throw new AccessRequestError("This role cannot request write access.", 403);
  }

  await connectDB();
  const request = await AdminAccessRequest.create({
    adminUserId: actor.id,
    tenantId,
    reason,
    requestedScope,
    status: ADMIN_ACCESS_REQUEST_STATUS.PENDING,
  });

  await emitPlatformAuditEvent({
    actor,
    tenantId,
    eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY,
    eventType: PLATFORM_EVENT_TYPE.ORG_ACCESS_REQUESTED,
    severity: PLATFORM_SEVERITY.INFO,
    entityType: "AdminAccessRequest",
    entityId: String(request._id),
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason, requestedScope },
  });

  return String(request._id);
}

export async function approveOrgAccess(actor: AdminActor, requestId: string): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.APPROVE_ORG_ACCESS);
  await connectDB();
  const request = await AdminAccessRequest.findById(requestId);
  if (!request) throw new AccessRequestError("Access request not found.", 404);
  if (request.status !== ADMIN_ACCESS_REQUEST_STATUS.PENDING) {
    throw new AccessRequestError(`Request is already ${request.status}.`, 409);
  }

  const now = new Date();
  request.status = ADMIN_ACCESS_REQUEST_STATUS.APPROVED;
  request.approvedBy = new mongoose.Types.ObjectId(actor.id);
  request.grantedAt = now;
  request.expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000); // never open-ended
  await request.save();

  await emitPlatformAuditEvent({
    actor,
    tenantId: request.tenantId,
    eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY,
    eventType: PLATFORM_EVENT_TYPE.ORG_ACCESS_APPROVED,
    severity: PLATFORM_SEVERITY.WARNING,
    entityType: "AdminAccessRequest",
    entityId: String(request._id),
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    metadata: { requestedScope: request.requestedScope, expiresAt: request.expiresAt.toISOString(), requestingAdminId: String(request.adminUserId) },
  });
  await emitPlatformAuditEvent({
    actor: { id: String(request.adminUserId), role: "admin", sessionId: undefined },
    tenantId: request.tenantId,
    eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY,
    eventType: PLATFORM_EVENT_TYPE.ORG_ACCESS_SESSION_STARTED,
    severity: PLATFORM_SEVERITY.WARNING,
    entityType: "AdminAccessRequest",
    entityId: String(request._id),
    metadata: { requestedScope: request.requestedScope, expiresAt: request.expiresAt.toISOString(), approvedBy: actor.id },
  });
}

export async function denyOrgAccess(actor: AdminActor, requestId: string, reason: string): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.APPROVE_ORG_ACCESS);
  await connectDB();
  const request = await AdminAccessRequest.findById(requestId);
  if (!request) throw new AccessRequestError("Access request not found.", 404);
  if (request.status !== ADMIN_ACCESS_REQUEST_STATUS.PENDING) {
    throw new AccessRequestError(`Request is already ${request.status}.`, 409);
  }

  request.status = ADMIN_ACCESS_REQUEST_STATUS.DENIED;
  request.deniedReason = reason;
  await request.save();

  await emitPlatformAuditEvent({
    actor,
    tenantId: request.tenantId,
    eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY,
    eventType: PLATFORM_EVENT_TYPE.ORG_ACCESS_DENIED,
    severity: PLATFORM_SEVERITY.INFO,
    entityType: "AdminAccessRequest",
    entityId: String(request._id),
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason },
  });
}

/** Either the granted admin themselves, or an approver, can end a session early. */
export async function endOrgAccessSession(actor: AdminActor, requestId: string): Promise<void> {
  await connectDB();
  const request = await AdminAccessRequest.findById(requestId);
  if (!request) throw new AccessRequestError("Access request not found.", 404);
  if (request.status !== ADMIN_ACCESS_REQUEST_STATUS.APPROVED) {
    throw new AccessRequestError(`Request is not an active session (status: ${request.status}).`, 409);
  }
  const isOwnSession = String(request.adminUserId) === actor.id;
  if (!isOwnSession) {
    await requireCapability(actor, ADMIN_CAPABILITY.APPROVE_ORG_ACCESS);
  }

  request.status = ADMIN_ACCESS_REQUEST_STATUS.ENDED;
  request.endedAt = new Date();
  await request.save();

  await emitPlatformAuditEvent({
    actor,
    tenantId: request.tenantId,
    eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY,
    eventType: PLATFORM_EVENT_TYPE.ORG_ACCESS_SESSION_ENDED,
    severity: PLATFORM_SEVERITY.INFO,
    entityType: "AdminAccessRequest",
    entityId: String(request._id),
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    metadata: { endedBySelf: isOwnSession },
  });
}

export async function listAccessRequests(status?: string) {
  await connectDB();
  const filter = status ? { status } : {};
  const requests = await AdminAccessRequest.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  return requests.map((r) => ({
    id: String(r._id),
    adminUserId: String(r.adminUserId),
    tenantId: r.tenantId,
    reason: r.reason,
    requestedScope: r.requestedScope,
    status: r.status,
    grantedAt: r.grantedAt?.toISOString(),
    expiresAt: r.expiresAt?.toISOString(),
    endedAt: r.endedAt?.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
}
