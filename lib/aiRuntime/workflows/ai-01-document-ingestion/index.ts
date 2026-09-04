import connectDB from "@/lib/db";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import Vendor from "@/models/admin/Vendor";
import TaxRate from "@/models/finance/TaxRate";
import {
  AI_AUTONOMY_LEVEL,
  AI_FINDING_TYPE,
  AI_FINDING_SEVERITY,
  type AiFindingSeverity,
} from "@/lib/constants/statuses";
import { DOC_INTEL_TYPE, DOC_INTEL_STATUS, type VendorBillExtraction } from "@/lib/docIntel/extractionSchemas";
import type {
  WorkflowDefinition,
  ObservedResult,
  ReasonResult,
  ActResult,
  VerifyResult,
} from "@/lib/aiRuntime/workflows/types";
import { runDuplicateScanHandler } from "@/lib/aiRuntime/tools/financeReadTools";

/**
 * AI-01 — Document ingestion & accounting extraction (docs/ai/BRIEF-02-BATCH-A.md).
 *
 * **Extends `lib/docIntel/`, does not duplicate it** (Part 9 item 1's exact failure mode):
 * `extractor.ts`, `textExtract.ts`, `extractionSchemas.ts` keep doing what they already do
 * unchanged. This workflow is the runtime wrapper that reacts to `document.received` (instead
 * of requiring a human confirm click), adds the autonomy gate, the decision trace, and calls
 * `billCreate.ts::createDraftBill` through the tool layer (`draft_bill`) instead of only from
 * the manual confirm route.
 *
 * The existing manual upload → confirm flow (`app/api/document-intelligence/**`) is completely
 * unchanged and still works byte-identically — this workflow only adds a second, automatic path
 * that reaches the exact same `createDraftBill` function.
 *
 * Tax handling (A.6): `Invoice.invoiceLines[].taxIds: number[]` was found to be vestigial —
 * always `[]` in every real create path, disconnected from `TaxRate` entirely. So this workflow
 * treats "select a TaxRate" as **proposal/evidence metadata** (recorded on the finding, for a
 * human or a later workflow to act on), not a field it writes onto the Invoice — writing to a
 * field nothing else reads would be worse than not writing it at all.
 */

interface Ai01Raw {
  extractedDocumentId: string;
  actingUserId?: string;
}

interface Ai01Extracted {
  extractedDocumentId: string;
  actingUserId?: string;
  docType: string;
  extraction: VendorBillExtraction;
  fileHash?: string;
  arithmeticValid: boolean;
  isNonInr: boolean;
  vendorMatchId: string | null;
  duplicate: { isDuplicate: boolean; matches: { id: string; reason: string }[] };
  candidateTaxRate: { id: string; ratePercent: number; impliedTax: number; withinTolerance: boolean } | null;
}

interface Ai01Proposal {
  extraction: VendorBillExtraction | null;
  vendorMatchId: string | null;
  candidateTaxRateId: string | null;
  blockReason: string | null;
}

function arithmeticOk(ext: VendorBillExtraction): boolean {
  const tolerance = 1; // ₹1 / 1 unit tolerance for rounding
  const lineSum = (ext.lineItems ?? []).reduce((s, l) => s + (l.amount ?? 0), 0);
  const subtotalOk = ext.lineItems.length === 0 || Math.abs(lineSum - ext.subtotal) <= tolerance;
  const totalOk = Math.abs(ext.subtotal + ext.taxAmount - ext.totalAmount) <= tolerance;
  return subtotalOk && totalOk;
}

export const ai01DocumentIngestion: WorkflowDefinition<Ai01Raw, Ai01Extracted, Ai01Proposal> = {
  id: "AI-01",
  version: "1.0.0",
  eventKeys: ["document.received"],
  actionClass: "document_ingestion",
  defaultAutonomy: AI_AUTONOMY_LEVEL.DRAFT,

  async observe(event): Promise<ObservedResult<Ai01Raw>> {
    const extractedDocumentId = String(event.payload.extractedDocumentId);
    const actingUserId = event.payload.actingUserId ? String(event.payload.actingUserId) : undefined;
    return {
      entityId: extractedDocumentId,
      subjectRef: { model: "ExtractedDocument", id: extractedDocumentId },
      raw: { extractedDocumentId, actingUserId },
    };
  },

  async extract(observed, ctx): Promise<Ai01Extracted> {
    await connectDB();
    const doc = await ExtractedDocument.findById(observed.raw.extractedDocumentId).lean();
    if (!doc) throw new Error(`ExtractedDocument ${observed.raw.extractedDocumentId} not found`);

    const extraction = doc.extraction as unknown as VendorBillExtraction;
    const isNonInr = Boolean(extraction.currency) && extraction.currency.toUpperCase() !== "INR";

    let vendorMatchId: string | null = null;
    if (extraction.vendorName) {
      const vendor = await Vendor.findOne({ tenantId: ctx.tenantId, name: { $regex: `^${extraction.vendorName.trim()}$`, $options: "i" } }).lean();
      vendorMatchId = vendor ? String(vendor._id) : null;
    }

    const duplicate = (await runDuplicateScanHandler({
      tenantId: ctx.tenantId,
      candidate: {
        vendorName: extraction.vendorName,
        billNumber: extraction.billNumber,
        totalAmount: extraction.totalAmount,
        fileHash: doc.fileHash,
        poReference: extraction.poReference,
      },
    })) as { isDuplicate: boolean; matches: { id: string; reason: string }[] };

    let candidateTaxRate: Ai01Extracted["candidateTaxRate"] = null;
    if (extraction.taxAmount > 0) {
      const rates = await TaxRate.find({ tenantId: ctx.tenantId, status: "active", appliesTo: { $in: ["purchase", "both"] } }).lean();
      let best: { id: string; ratePercent: number; impliedTax: number } | null = null;
      let bestDiff = Infinity;
      for (const rate of rates) {
        const implied = extraction.subtotal * (rate.ratePercent / 100);
        const diff = Math.abs(implied - extraction.taxAmount);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = { id: String(rate._id), ratePercent: rate.ratePercent, impliedTax: implied };
        }
      }
      if (best) {
        const tolerance = Math.max(1, extraction.subtotal * 0.01);
        candidateTaxRate = { ...best, withinTolerance: bestDiff <= tolerance };
      }
    }

    return {
      extractedDocumentId: observed.raw.extractedDocumentId,
      actingUserId: observed.raw.actingUserId,
      docType: doc.docType,
      extraction,
      fileHash: doc.fileHash,
      arithmeticValid: arithmeticOk(extraction),
      isNonInr,
      vendorMatchId,
      duplicate,
      candidateTaxRate,
    };
  },

  async reason(extracted): Promise<ReasonResult<Ai01Proposal>> {
    const reasonChain: string[] = [];
    const nullProposal = (blockReason: string): Ai01Proposal => ({
      extraction: null,
      vendorMatchId: null,
      candidateTaxRateId: null,
      blockReason,
    });
    const escalationFinding = (title: string, detail: string, severity: AiFindingSeverity = AI_FINDING_SEVERITY.HIGH) => [
      {
        id: `ai01-${extracted.extractedDocumentId}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity,
        title,
        detail,
        confidence: 0,
        subjectRefs: [{ model: "ExtractedDocument", id: extracted.extractedDocumentId }],
        evidence: [],
        reasonChain: [],
      },
    ];

    if (extracted.docType !== DOC_INTEL_TYPE.VENDOR_BILL) {
      reasonChain.push(`docType "${extracted.docType}" is not vendor_bill — out of scope for AI-01 in this batch`);
      return { proposal: nullProposal("unsupported_doc_type"), confidence: 0, findings: [], reasonChain };
    }

    if (extracted.duplicate.isDuplicate) {
      reasonChain.push(`duplicate detected: ${extracted.duplicate.matches.map((m) => m.reason).join("; ")}`);
      return {
        proposal: nullProposal("duplicate"),
        confidence: 0,
        findings: escalationFinding("Possible duplicate bill", extracted.duplicate.matches.map((m) => m.reason).join("; "), AI_FINDING_SEVERITY.CRITICAL),
        reasonChain,
      };
    }

    if (!extracted.arithmeticValid) {
      reasonChain.push("line items / subtotal / tax / total do not reconcile");
      return {
        proposal: nullProposal("arithmetic_invalid"),
        confidence: 0,
        findings: escalationFinding("Amounts don't reconcile", "Line items, subtotal, tax and total are inconsistent"),
        reasonChain,
      };
    }

    if (extracted.isNonInr) {
      reasonChain.push(`currency "${extracted.extraction.currency}" is not INR — no FX rate source exists (A.6/GLOSSARY.md), escalating rather than guessing`);
      return {
        proposal: nullProposal("non_inr"),
        confidence: 0,
        findings: escalationFinding("Non-INR document", `Currency: ${extracted.extraction.currency}`),
        reasonChain,
      };
    }

    if (!extracted.vendorMatchId) {
      reasonChain.push(`vendor "${extracted.extraction.vendorName}" not found in the Vendor directory — proposing, not creating (AI-19 owns master data)`);
      return {
        proposal: nullProposal("unknown_vendor"),
        confidence: 0,
        findings: escalationFinding("Unknown vendor", `"${extracted.extraction.vendorName}" has no matching Vendor record — review and create if legitimate`, AI_FINDING_SEVERITY.MEDIUM),
        reasonChain,
      };
    }

    if (extracted.candidateTaxRate && !extracted.candidateTaxRate.withinTolerance) {
      reasonChain.push(
        `stated tax ${extracted.extraction.taxAmount} disagrees with the best-matching TaxRate's implied tax ${extracted.candidateTaxRate.impliedTax.toFixed(2)}`,
      );
      return {
        proposal: nullProposal("tax_mismatch"),
        confidence: 0,
        findings: escalationFinding("Tax amount disagrees with any known tax rate", `Stated: ${extracted.extraction.taxAmount}, closest rate implies: ${extracted.candidateTaxRate.impliedTax.toFixed(2)}`),
        reasonChain,
      };
    }

    reasonChain.push("all checks passed — proposing a draft bill");
    const confidence = Math.max(0, Math.min(1, (extracted.extraction.confidence ?? 0) / 100));

    return {
      proposal: {
        extraction: extracted.extraction,
        vendorMatchId: extracted.vendorMatchId,
        candidateTaxRateId: extracted.candidateTaxRate?.id ?? null,
        blockReason: null,
      },
      confidence,
      confidenceComponents: { extraction_confidence: confidence },
      findings: [
        {
          id: `ai01-${extracted.extractedDocumentId}`,
          type: AI_FINDING_TYPE.PROPOSAL,
          severity: AI_FINDING_SEVERITY.INFO,
          title: `Vendor bill ready to draft: ${extracted.extraction.vendorName}`,
          detail: `Total ${extracted.extraction.totalAmount} ${extracted.extraction.currency || "INR"}`,
          amount: extracted.extraction.totalAmount,
          currency: extracted.extraction.currency || "INR",
          confidence,
          subjectRefs: [{ model: "ExtractedDocument", id: extracted.extractedDocumentId }],
          evidence: [{ kind: "document", ref: extracted.extractedDocumentId, label: "Source document" }],
          reasonChain: [],
        },
      ],
      reasonChain,
      gateOverrides: {
        amount: extracted.extraction.totalAmount,
        periodOpen: true,
        permissionOk: Boolean(extracted.actingUserId),
      },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    // All deterministic gates (duplicate/arithmetic/currency/vendor/tax) already ran in
    // reason() above — nothing left to veto.
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    if (!reasoned.proposal.extraction || decision.autonomyApplied !== AI_AUTONOMY_LEVEL.DRAFT) {
      return { findings: [], actionsTaken: [] };
    }

    let invoiceId: string;
    try {
      const result = await rt.callTool<{ invoiceId: string; partnerId: string; name: string }>(
        "draft_bill",
        { tenantId: ctx.tenantId, userId: extracted.actingUserId, extraction: reasoned.proposal.extraction },
        { requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, idempotencyKey: `ai-01:${extracted.extractedDocumentId}` },
      );
      invoiceId = result.invoiceId;
    } catch {
      // No acting user, or permission denied — fall back to propose-only.
      return { findings: [], actionsTaken: [] };
    }

    await rt.callTool(
      "link_evidence",
      {
        tenantId: ctx.tenantId,
        extractedDocumentId: extracted.extractedDocumentId,
        targetModel: "Invoice",
        targetId: invoiceId,
        markStatus: DOC_INTEL_STATUS.CONFIRMED,
      },
      { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE, idempotencyKey: `ai-01-evidence:${extracted.extractedDocumentId}` },
    );

    return {
      findings: [],
      actionsTaken: [
        { tool: "draft_bill", args: { extractedDocumentId: extracted.extractedDocumentId, invoiceId }, reversible: true },
        { tool: "link_evidence", args: { extractedDocumentId: extracted.extractedDocumentId, invoiceId }, reversible: true },
      ],
      metrics: { scanned: 1, autoActioned: 1 },
    };
  },

  async verify(actResult, ctx): Promise<VerifyResult> {
    if (actResult.actionsTaken.length === 0) return { ok: true };
    const draftAction = actResult.actionsTaken.find((a) => a.tool === "draft_bill");
    const invoiceId = draftAction?.args.invoiceId as string | undefined;
    if (!invoiceId) return { ok: false, detail: "draft_bill action recorded with no invoiceId" };
    await connectDB();
    const Invoice = (await import("@/models/finance/Invoice")).default;
    const invoice = await Invoice.findOne({ _id: invoiceId, tenantId: ctx.tenantId }).lean();
    return invoice ? { ok: true } : { ok: false, detail: `Invoice ${invoiceId} not found after draft_bill` };
  },
};

export type { Ai01Raw, Ai01Extracted, Ai01Proposal };
