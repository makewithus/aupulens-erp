import { AdminRoleType } from "@/lib/constants/statuses";

/** The authenticated Global Admin identity, resolved from a verified admin
 * session. Passed explicitly to every cross-tenant gateway call and every
 * audit emission — never inferred implicitly from ambient request state. */
export interface AdminActor {
  id: string;
  email: string;
  name: string;
  role: AdminRoleType;
  sessionId: string;
  ip?: string;
  userAgent?: string;
}
