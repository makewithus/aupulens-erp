import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requirePermission } from "@/lib/crm/rbac";
import { parseRuleFromNaturalLanguage } from "@/lib/crm/ai/nlToRule";

/**
 * NL-to-rule: parse a plain-English automation description into a structured,
 * validated CrmAutomationRule (Scope D). Returns the rule for the user to
 * REVIEW — it does not save. The user then persists it via POST
 * /api/crm/automations (same permission), keeping a human in the loop.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "manage_workflows");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  const { description } = await req.json();
  const outcome = await parseRuleFromNaturalLanguage(session.user.tenantId, description || "");

  // strictNullChecks is off in this project — narrow on "rule" in outcome.
  if (!("rule" in outcome)) {
    const status = outcome.gated ? 403 : 400;
    return NextResponse.json({ success: false, message: outcome.error, code: outcome.code, gated: outcome.gated }, { status });
  }
  return NextResponse.json({ success: true, data: { rule: outcome.rule, warnings: outcome.warnings } });
}
