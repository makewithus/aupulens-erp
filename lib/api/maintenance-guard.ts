import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function requireMaintenanceAccess({
  allowedRoles = ["admin"],
}: {
  allowedRoles?: string[];
} = {}) {
  const enabled =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_MAINTENANCE_ROUTES === "true";

  if (!enabled) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
      session: null,
    };
  }

  const session = await auth();
  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      session: null,
    };
  }

  if (!allowedRoles.includes(session.user.role)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      session: null,
    };
  }

  return { error: null, session };
}
