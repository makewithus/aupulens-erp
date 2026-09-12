import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import AiLimit from "@/models/platform/AiLimit";
import AiOverageConfig from "@/models/platform/AiOverageConfig";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { hasCapability, AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { ADMIN_CAPABILITY } from "@/lib/constants/statuses";
import { setAiLimit, setAiOverageConfig, ManageAiLimitError } from "@/lib/platform/ai/manageLimits";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  // VIEW_AI_USAGE, not MANAGE_AI_LIMITS — every role that can see AI usage
  // can see what limits are configured; only AI_ADMIN/GLOBAL_SUPER_ADMIN can
  // change them (enforced in PATCH below).
  if (!(await hasCapability(actor, ADMIN_CAPABILITY.VIEW_AI_USAGE))) {
    return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
  }

  const { id: subdomain } = await params;
  await connectDB();
  const [limit, overage] = await Promise.all([
    AiLimit.findOne({ tenantId: subdomain }).lean(),
    AiOverageConfig.findOne({ tenantId: subdomain }).lean(),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      limit: limit
        ? {
            monthlyCreditsUsd: limit.monthlyCreditsUsd ?? null,
            dailyCreditsUsd: limit.dailyCreditsUsd ?? null,
            maxRequestsPerMonth: limit.maxRequestsPerMonth ?? null,
            maxTokensPerMonth: limit.maxTokensPerMonth ?? null,
            maxCostUsdPerMonth: limit.maxCostUsdPerMonth ?? null,
            atLimitBehavior: limit.atLimitBehavior,
          }
        : null, // absent row = exactly pre-Phase-4 behaviour (BLOCK at the tier cap)
      overage: overage
        ? {
            enabled: overage.enabled,
            ratePerCreditUsd: overage.ratePerCreditUsd,
            softLimitUsd: overage.softLimitUsd,
            hardLimitUsd: overage.hardLimitUsd,
            alertThresholds: overage.alertThresholds,
          }
        : null,
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const { id: subdomain } = await params;
  const body = await request.json();

  try {
    if (body.limit) {
      await setAiLimit(actor, subdomain, body.limit, body.reason);
    }
    if (body.overage) {
      await setAiOverageConfig(actor, subdomain, body.overage, body.reason);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    if (err instanceof ManageAiLimitError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    throw err;
  }
}
