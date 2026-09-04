import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import { bootstrapAiRuntime } from "@/lib/aiRuntime/bootstrap";
import { listWorkflows } from "@/lib/aiRuntime/runtime/registry";
import { computeAndPersistTenantMetrics } from "@/lib/aiRuntime/metrics/computeMetrics";
import { checkDrift } from "@/lib/aiRuntime/metrics/drift";

/**
 * The nightly metric-snapshot sweep (docs/ai/BRIEF-08b-FINAL.md C.1/C.4). Same bearer-secret
 * shape and per-tenant iteration as `app/api/cron/ai/runtime-sweep/route.ts` — a separate route
 * (not folded into the hourly sweep) because this is genuinely nightly cadence, per C.1's own
 * instruction, not another `ai.sweep.hourly` consumer.
 */
async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  bootstrapAiRuntime();
  await connectDB();
  const orgs = await Organization.find({ isActive: true }, "subdomain").lean();
  const workflowIds = listWorkflows().map((w) => w.id);

  let tenantsProcessed = 0;
  let driftFindings = 0;
  for (const org of orgs) {
    const tenantId = (org as { subdomain: string }).subdomain;
    await computeAndPersistTenantMetrics(tenantId);
    for (const workflowId of workflowIds) {
      const findings = await checkDrift(tenantId, workflowId);
      driftFindings += findings.length;
    }
    tenantsProcessed++;
  }

  return NextResponse.json({ success: true, tenantsProcessed, workflowsPerTenant: workflowIds.length, driftFindings });
}

export { handler as GET, handler as POST };
