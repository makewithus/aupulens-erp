import connectDB from "@/lib/db";
import AiHold from "@/models/ai/AiHold";
import AiMasterDataProfile from "@/models/ai/AiMasterDataProfile";
import { AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * AI-19/AI-27's shared tools (docs/ai/BRIEF-08a-BATCH-G.md A.1). `place_hold` is the only write
 * path to `AiHold` anywhere in the registry — **there is no `release_hold` tool at any autonomy
 * level**, asserted directly in tests. A human clears a hold outside the AI tool layer entirely.
 */

export interface PlaceHoldArgs {
  tenantId: string;
  subjectModel: string;
  subjectId: string;
  reason: string;
  placedByWorkflow: string;
}
async function placeHoldHandler(args: PlaceHoldArgs) {
  await connectDB();
  const existing = await AiHold.findOne({ tenantId: args.tenantId, "subjectRef.model": args.subjectModel, "subjectRef.id": args.subjectId, status: "open" }).lean();
  if (existing) return { holdId: String(existing._id), alreadyOpen: true };
  const hold = await AiHold.create({
    tenantId: args.tenantId,
    subjectRef: { model: args.subjectModel, id: args.subjectId },
    reason: args.reason,
    placedByWorkflow: args.placedByWorkflow,
    placedAt: new Date(),
    status: "open",
  });
  return { holdId: String(hold._id), alreadyOpen: false };
}

export interface GetActiveHoldArgs {
  tenantId: string;
  subjectModel: string;
  subjectId: string;
}
async function getActiveHoldHandler(args: GetActiveHoldArgs) {
  await connectDB();
  const hold = await AiHold.findOne({ tenantId: args.tenantId, "subjectRef.model": args.subjectModel, "subjectRef.id": args.subjectId, status: "open" }).lean();
  return { hold };
}

export interface RecordMasterDataProfileArgs {
  tenantId: string;
  model: string;
  recordId: string;
  missingFields?: string[];
  duplicateCandidates?: unknown[];
  bankChangeAlerts?: unknown[];
  employeeCollisions?: unknown[];
  observedPaymentTerms?: unknown;
  expiringDocuments?: unknown[];
}
async function recordMasterDataProfileHandler(args: RecordMasterDataProfileArgs) {
  await connectDB();
  const doc = await AiMasterDataProfile.findOneAndUpdate(
    { tenantId: args.tenantId, entityModel: args.model, recordId: args.recordId },
    {
      $set: {
        missingFields: args.missingFields ?? [],
        duplicateCandidates: args.duplicateCandidates ?? [],
        bankChangeAlerts: args.bankChangeAlerts ?? [],
        employeeCollisions: args.employeeCollisions ?? [],
        observedPaymentTerms: args.observedPaymentTerms,
        expiringDocuments: args.expiringDocuments ?? [],
        lastEvaluatedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );
  return { profileId: String(doc._id) };
}

export function registerMasterDataReadTools(): void {
  registerTool<GetActiveHoldArgs>({
    name: "get_active_hold",
    description: "Reads models/ai/AiHold.ts for a subject — whether a hold is currently open.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getActiveHoldHandler,
  });
}

export function registerMasterDataWriteTools(): void {
  registerTool<PlaceHoldArgs>({
    name: "place_hold",
    description: "Places a durable hold on a vendor/bill (models/ai/AiHold.ts). No release_hold tool exists anywhere — only a human clears a hold.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    category: "internal_state",
    handler: placeHoldHandler,
  });

  registerTool<RecordMasterDataProfileArgs>({
    name: "record_master_data_profile",
    description: "Persists AI-19's observed master-data intelligence to models/ai/AiMasterDataProfile.ts. Never writes Vendor/Customer/Employee/Product/InventoryItem.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: recordMasterDataProfileHandler,
  });
}
