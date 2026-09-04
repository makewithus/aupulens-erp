import connectDB from "@/lib/db";
import Customer from "@/models/sales/Customer";
import Employee from "@/models/hr/Employee";
import Vendor from "@/models/admin/Vendor";
import BankAccount from "@/models/finance/BankAccount";
import { snapshotAndDiff, getExtractor } from "@/lib/aiRuntime/masterData/snapshot";
import { findDuplicateEntities, findDuplicateItems, type DuplicatePair } from "@/lib/aiRuntime/masterData/duplicates";
import { findMissingFields, type MissingFieldFinding } from "@/lib/aiRuntime/masterData/gaps";
import { findEmployeeVendorCollisions, type EmployeeCollision } from "@/lib/aiRuntime/masterData/employeeCollision";
import { computeObservedPaymentTerms } from "@/lib/aiRuntime/masterData/paymentTerms";
import { getWorkflowGaps } from "@/lib/aiRuntime/capabilities/registry";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-19 — Master-data intelligence (docs/ai/BRIEF-08a-BATCH-G.md). Watches vendors, customers,
 * items and employees for duplicates, gaps and dangerous changes. **Never merges, never fills a
 * field, never lifts a hold** — every finding lands in `models/ai/AiMasterDataProfile.ts`, never
 * `Vendor`/`Customer`/`Employee`/`Product`/`InventoryItem` (source-grep proves it).
 *
 * Two trigger shapes, same workflow: `master_data.changed` (0.5) reacts to ONE record — snapshots
 * it, diffs against its own prior snapshot, and raises a bank-change alert + hold if a bank field
 * moved. `period.horizon.reached`/`ai.sweep.hourly` runs the population-wide sweeps (duplicates,
 * missing fields, employee collisions, observed payment terms) that don't make sense per-record.
 *
 * **Duplicate detection reuses AI-20's `matchPair()`/`nameSimilarity()` directly** — no second
 * entity-matching implementation exists anywhere in this workflow's own code.
 */

interface Ai19Raw {
  mode: "record_change" | "sweep";
  model?: string;
  recordId?: string;
}

interface Ai19RecordExtracted {
  mode: "record_change";
  model: string;
  recordId: string;
}

interface Ai19SweepExtracted {
  mode: "sweep";
  vendorDuplicates: DuplicatePair[];
  customerDuplicates: DuplicatePair[];
  itemDuplicates: DuplicatePair[];
  vendorGaps: MissingFieldFinding[];
  customerGaps: MissingFieldFinding[];
  collisions: EmployeeCollision[];
  vendorIdsForTerms: string[];
}

type Ai19Extracted = Ai19RecordExtracted | Ai19SweepExtracted;

interface Ai19Proposal {
  duplicates: { records: string[]; similarity: number; matchedOn: string[]; classification: string; proposedSurvivor: string }[];
  missingFields: MissingFieldFinding[];
  bankChangeAlerts: { entityRef: { model: string; id: string }; field: string; oldMasked: string; newMasked: string; riskFactors: string[]; holdPlaced: boolean; holdRef?: string }[];
  employeeCollisions: EmployeeCollision[];
  observedTerms: { vendorId: string; netDays: number; discountPercent?: number; discountDays?: number; sampleSize: number }[];
  checksNotImplemented: { what: string; reason: string }[];
}

// Chunk 9 (0.2): read live from the shared capability registry rather than a local array —
// AI-06's own copy of this exact pattern going stale (docs/ai/OPEN_QUESTIONS.md #36) is why this
// registry exists at all.
const NOT_IMPLEMENTED = getWorkflowGaps("AI-19");

export const ai19MasterData: WorkflowDefinition<Ai19Raw, Ai19Extracted, Ai19Proposal> = {
  id: "AI-19",
  version: "1.0.0",
  eventKeys: ["master_data.changed", "period.horizon.reached", "ai.sweep.hourly"],
  actionClass: "master_data_intelligence",
  defaultAutonomy: AI_AUTONOMY_LEVEL.RECOMMEND,

  subscriptionFilter(): boolean {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai19Raw>> {
    if (event.eventKey === "master_data.changed") {
      const model = String(event.payload.model);
      const recordId = String(event.payload.id);
      return { entityId: `${model}:${recordId}`, raw: { mode: "record_change", model, recordId } };
    }
    return { entityId: event.tenantId, raw: { mode: "sweep" } };
  },

  async extract(observed, ctx): Promise<Ai19Extracted> {
    await connectDB();
    if (observed.raw.mode === "record_change") {
      return { mode: "record_change", model: observed.raw.model!, recordId: observed.raw.recordId! };
    }

    const [vendorDuplicates, customerDuplicates, itemDuplicates, vendorGaps, customerGaps, collisions] = await Promise.all([
      findDuplicateEntities(ctx.tenantId, "vendor"),
      findDuplicateEntities(ctx.tenantId, "customer"),
      findDuplicateItems(ctx.tenantId),
      findMissingFields(ctx.tenantId, "vendor"),
      findMissingFields(ctx.tenantId, "customer"),
      findEmployeeVendorCollisions(ctx.tenantId),
    ]);
    const Invoice = (await import("@/models/finance/Invoice")).default;
    const vendorIdsForTerms = (await Invoice.distinct("partnerId", { tenantId: ctx.tenantId, moveType: "in_invoice" })).map(String).slice(0, 50);

    return { mode: "sweep", vendorDuplicates, customerDuplicates, itemDuplicates, vendorGaps, customerGaps, collisions, vendorIdsForTerms };
  },

  async reason(extracted): Promise<ReasonResult<Ai19Proposal>> {
    const findings: ReasonResult<Ai19Proposal>["findings"] = [];
    const reasonChain: string[] = [];

    const proposal: Ai19Proposal = {
      duplicates: [],
      missingFields: [],
      bankChangeAlerts: [],
      employeeCollisions: [],
      observedTerms: [],
      checksNotImplemented: NOT_IMPLEMENTED,
    };

    if (extracted.mode === "sweep") {
      const allDuplicates = [...extracted.vendorDuplicates, ...extracted.customerDuplicates, ...extracted.itemDuplicates];
      proposal.duplicates = allDuplicates.map((d) => ({ records: [d.aId, d.bId], similarity: d.score, matchedOn: d.matchedOn, classification: d.classification, proposedSurvivor: d.proposedSurvivor }));
      proposal.missingFields = [...extracted.vendorGaps, ...extracted.customerGaps];
      proposal.employeeCollisions = extracted.collisions;

      for (const d of allDuplicates) {
        findings.push({
          id: `ai19-duplicate-${d.aId}-${d.bId}`,
          type: AI_FINDING_TYPE.ANOMALY,
          severity: d.classification === "certain" ? AI_FINDING_SEVERITY.HIGH : d.classification === "probable" ? AI_FINDING_SEVERITY.MEDIUM : AI_FINDING_SEVERITY.LOW,
          title: `Possible duplicate record (${d.classification}): matched on ${d.matchedOn.join(", ")}`,
          detail: `proposed survivor ${d.proposedSurvivor}`,
          confidence: d.score,
          subjectRefs: [{ model: "Customer", id: d.aId }, { model: "Customer", id: d.bId }],
          evidence: [],
          reasonChain: [],
        });
      }
      for (const c of extracted.collisions) {
        findings.push({
          id: `ai19-collision-${c.vendorId}-${c.employeeId}`,
          type: AI_FINDING_TYPE.ANOMALY,
          severity: AI_FINDING_SEVERITY.HIGH,
          title: `Vendor record matches an employee (${c.matchedOn.join(", ")})`,
          detail: `vendor ${c.vendorId} / employee ${c.employeeId}`,
          confidence: 1,
          subjectRefs: [{ model: "Customer", id: c.vendorId }, { model: "Employee", id: c.employeeId }],
          evidence: [],
          reasonChain: [],
        });
      }
      reasonChain.push(`${allDuplicates.length} duplicate candidate(s), ${proposal.missingFields.length} missing-field gap(s), ${extracted.collisions.length} employee collision(s)`);
    } else {
      reasonChain.push(`reacting to a master_data.changed event for ${extracted.model} ${extracted.recordId}`);
    }

    return { proposal, confidence: 1, findings, reasonChain };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    const tenantId = ctx.tenantId;
    const findings: ActResult["findings"] = [];

    if (extracted.mode === "record_change") {
      const extractor = getExtractor(extracted.model);
      if (!extractor) return { findings: [], actionsTaken: [] };

      const ModelMap: Record<string, unknown> = { Vendor, Customer, Employee, BankAccount };
      const Model = ModelMap[extracted.model] as { findOne: (q: Record<string, unknown>) => { lean: () => Promise<Record<string, unknown> | null> } } | undefined;
      const rawDoc = Model ? await Model.findOne({ _id: extracted.recordId, tenantId }).lean() : null;
      if (!rawDoc) return { findings: [], actionsTaken: [] };

      const diffResult = await snapshotAndDiff(tenantId, extracted.model, extracted.recordId, rawDoc as Record<string, unknown>);
      const bankDiffs = diffResult.diffs.filter((d) => d.isBankField);

      const alerts: Ai19Proposal["bankChangeAlerts"] = [];
      for (const d of bankDiffs) {
        const riskFactors: string[] = [];
        if (diffResult.isFirstSnapshot) continue; // no baseline to compare against yet — never a false alarm on first sight

        const holdResult = await rt.callTool<{ holdId: string; alreadyOpen: boolean }>(
          "place_hold",
          { tenantId, subjectModel: extracted.model, subjectId: extracted.recordId, reason: `Bank detail changed: ${d.field}`, placedByWorkflow: "AI-19" },
          { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS },
        );

        alerts.push({ entityRef: { model: extracted.model, id: extracted.recordId }, field: d.field, oldMasked: d.oldMasked, newMasked: d.newMasked, riskFactors, holdPlaced: true, holdRef: holdResult.holdId });

        findings.push({
          id: `ai19-bank-change-${extracted.recordId}-${d.field}-${Date.now()}`,
          type: AI_FINDING_TYPE.EXCEPTION,
          severity: AI_FINDING_SEVERITY.CRITICAL,
          title: `Bank detail changed: ${extracted.model} ${extracted.recordId}`,
          detail: `${d.field} changed from ${d.oldMasked} to ${d.newMasked} — hold placed, requires out-of-band verification`,
          confidence: 1,
          subjectRefs: [{ model: extracted.model, id: extracted.recordId }],
          evidence: [],
          reasonChain: [],
        });
      }

      if (alerts.length > 0) {
        await rt.callTool(
          "record_master_data_profile",
          { tenantId, model: extracted.model, recordId: extracted.recordId, bankChangeAlerts: alerts },
          { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
        );
      }

      reasoned.proposal.bankChangeAlerts = alerts;
      return { findings, actionsTaken: [] };
    }

    // ── sweep mode ──
    const observedTerms: Ai19Proposal["observedTerms"] = [];
    for (const vendorId of extracted.vendorIdsForTerms) {
      const terms = await computeObservedPaymentTerms(tenantId, vendorId);
      if (!terms) continue;
      observedTerms.push({ vendorId: terms.vendorId, netDays: terms.netDays, discountPercent: terms.discountPercent, discountDays: terms.discountDays, sampleSize: terms.sampleSize });
      await rt.callTool(
        "record_master_data_profile",
        { tenantId, model: "Customer", recordId: vendorId, observedPaymentTerms: terms, missingFields: extracted.vendorGaps.find((g) => g.recordId === vendorId)?.missing ?? [] },
        { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
      );
    }

    reasoned.proposal.observedTerms = observedTerms;
    return { findings: [], actionsTaken: [] };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
