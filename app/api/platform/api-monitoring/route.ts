import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import ApiKey from "@/models/platform/ApiKey";
import ApiUsage from "@/models/platform/ApiUsage";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { hasCapability } from "@/lib/platform/auth/adminRbac";
import { ADMIN_CAPABILITY } from "@/lib/constants/statuses";

/**
 * Source doc §29. Confirmed: no external API/API-key concept exists
 * anywhere in this codebase (docs/admin/SYSTEM_INVENTORY_DELTA.md,
 * PHASE-6-plan.md) — every /api/** route is browser-session-authenticated.
 * Returns real (currently zero) counts and an honest explanation, never
 * fabricated traffic.
 */
export async function GET(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  if (!(await hasCapability(actor, ADMIN_CAPABILITY.VIEW_API_MONITORING))) {
    return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
  }

  await connectDB();
  const [apiKeyCount, apiUsageCount] = await Promise.all([
    ApiKey.countDocuments({}),
    ApiUsage.countDocuments({}),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      apiKeyCount,
      apiUsageCount,
      hasExternalApi: apiKeyCount > 0,
      note:
        apiKeyCount === 0
          ? "This platform has no external, key-authenticated API surface yet — every /api/** route is browser-session-authenticated. No API keys have ever been issued."
          : undefined,
    },
  });
}
