import { auth } from "@/auth";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";

export async function verifyGlobalAdmin(request: Request): Promise<{
  isAuthorized: boolean;
  actor?: any;
  errorStatus?: number;
  message?: string;
}> {
  // Check Platform Admin actor cookie first
  try {
    const actor = await getAdminActorFromRequest(request);
    if (actor) {
      return { isAuthorized: true, actor };
    }
  } catch {
    // Continue to check NextAuth session
  }

  // Check NextAuth session for master-admin role
  try {
    const session = await auth();
    if (session?.user?.role === "master-admin") {
      return {
        isAuthorized: true,
        actor: {
          id: session.user.id,
          email: session.user.email,
          role: "master-admin",
          isMasterAdmin: true,
        },
      };
    }
  } catch {
    // Session check failed
  }

  return {
    isAuthorized: false,
    errorStatus: 403,
    message: "Forbidden: Global Admin authorization required.",
  };
}
