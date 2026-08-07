/**
 * Marketplace package sanitizing + installation (6.12).
 *
 * `sanitize*` functions strip a config down to the SHAREABLE fields (no tenant/
 * user/object ids) — pure, so they're unit-tested. `installPackage` creates
 * fresh, tenant-OWNED records in the installing workspace from a sanitized
 * payload, reusing the same vocabularies/validation the builders use so an
 * installed package behaves exactly like a hand-built one.
 */
import connectDB from "@/lib/db";
import CrmAutomationRule from "@/models/crm/AutomationRule";
import CrmApprovalPolicy from "@/models/crm/ApprovalPolicy";
import { DocumentSettings } from "@/models/DocumentSettings";
import { RULE_TRIGGERS, RULE_ENTITIES, RULE_OPERATORS, RULE_ACTIONS } from "@/lib/crm/automationVocabulary";
import type { MarketplaceCategory } from "@/models/MarketplacePackage";

// ── Sanitizers (pure) ─────────────────────────────────────────────────────────

export function sanitizeWorkflow(rule: any): Record<string, unknown> | null {
  if (!rule) return null;
  const trigger = (RULE_TRIGGERS as readonly string[]).includes(rule.trigger) ? rule.trigger : "record_created";
  const entity = (RULE_ENTITIES as readonly string[]).includes(rule.entity) ? rule.entity : "Lead";
  const conditions = Array.isArray(rule.conditions)
    ? rule.conditions.filter((c: any) => c?.field && (RULE_OPERATORS as readonly string[]).includes(c.operator)).map((c: any) => ({ field: String(c.field), operator: c.operator, value: c.value }))
    : [];
  const actions = Array.isArray(rule.actions)
    ? rule.actions.filter((a: any) => (RULE_ACTIONS as readonly string[]).includes(a.type)).map((a: any) => ({ type: a.type, payload: a.payload && typeof a.payload === "object" ? a.payload : {} }))
    : [];
  if (actions.length === 0) return null;
  return { name: String(rule.name || "Imported workflow"), entity, trigger, conditions, actions };
}

export function sanitizeApprovalPolicy(policy: any): Record<string, unknown> | null {
  if (!policy || !Array.isArray(policy.steps)) return null;
  const steps = policy.steps
    .filter((s: any) => s?.approverRole)
    .map((s: any, i: number) => ({
      order: typeof s.order === "number" ? s.order : i + 1,
      approverRole: String(s.approverRole),
      minAvgDiscountPercent: typeof s.minAvgDiscountPercent === "number" ? s.minAvgDiscountPercent : undefined,
      minAmount: typeof s.minAmount === "number" ? s.minAmount : undefined,
      label: s.label ? String(s.label) : undefined,
    }));
  if (steps.length === 0) return null;
  return { name: String(policy.name || "Imported policy"), entity: policy.entity || "Quote", steps };
}

export function sanitizePrintFormat(settings: any): Record<string, unknown> | null {
  if (!settings) return null;
  const branding = settings.branding || {};
  const display = settings.display || {};
  const layout = settings.layout || {};
  return {
    branding: { accentColor: branding.accentColor, pdfFooterText: branding.pdfFooterText },
    display: { showStripedRows: !!display.showStripedRows, hideHsn: !!display.hideHsn },
    layout: { fontStyle: layout.fontStyle },
  };
}

export function sanitizeForCategory(category: MarketplaceCategory, config: any): Record<string, unknown> | null {
  if (category === "workflow") return sanitizeWorkflow(config);
  if (category === "approval-policy") return sanitizeApprovalPolicy(config);
  if (category === "print-format") return sanitizePrintFormat(config);
  return null;
}

// ── Install (creates tenant-owned records) ────────────────────────────────────

export interface InstallResult { kind: string; refId?: string; message: string }

export async function installPackage(
  category: MarketplaceCategory,
  payload: any,
  tenantId: string,
  userId: string,
): Promise<InstallResult> {
  await connectDB();

  if (category === "workflow") {
    const clean = sanitizeWorkflow(payload);
    if (!clean) throw new Error("This workflow package is invalid or has no supported action.");
    const rule = await CrmAutomationRule.create({ ...clean, enabled: false, tenantId, createdBy: userId });
    return { kind: "workflow", refId: String(rule._id), message: `Installed workflow "${(clean as any).name}" (disabled — enable it from the automation list).` };
  }

  if (category === "approval-policy") {
    const clean = sanitizeApprovalPolicy(payload);
    if (!clean) throw new Error("This approval-policy package is invalid or has no steps.");
    const policy = await CrmApprovalPolicy.create({ ...clean, enabled: false, tenantId, createdBy: userId });
    return { kind: "approval-policy", refId: String(policy._id), message: `Installed approval policy "${(clean as any).name}" (disabled — review then enable it).` };
  }

  if (category === "print-format") {
    const clean = sanitizePrintFormat(payload);
    if (!clean) throw new Error("This print-format package is invalid.");
    await (DocumentSettings as any).findOneAndUpdate(
      { tenantId },
      { $set: { branding: (clean as any).branding, display: (clean as any).display, layout: (clean as any).layout } },
      { upsert: true },
    );
    return { kind: "print-format", message: "Installed print format — it now applies to your invoice PDFs." };
  }

  throw new Error("Unknown package category.");
}
