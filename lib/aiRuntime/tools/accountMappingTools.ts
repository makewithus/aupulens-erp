import connectDB from "@/lib/db";
import AiAccountMapping from "@/models/ai/AiAccountMapping";
import { AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * The only write path to `models/ai/AiAccountMapping.ts` (docs/ai/BRIEF-08b-FINAL.md 0.2) — lets
 * a human override a heuristic account-role resolution (inventory, suspense/clearing, ...)
 * per tenant. `internal_state`: targets only this one `Ai*` model.
 */

export interface RecordAccountMappingArgs {
  tenantId: string;
  role: string;
  accountIds: string[];
  basis: string;
}
async function recordAccountMappingHandler(args: RecordAccountMappingArgs) {
  await connectDB();
  const doc = await AiAccountMapping.findOneAndUpdate(
    { tenantId: args.tenantId, role: args.role },
    { $set: { accountIds: args.accountIds, source: "configured", basis: args.basis } },
    { upsert: true, new: true },
  );
  return { id: String(doc._id) };
}

export interface GetAccountMappingArgs {
  tenantId: string;
  role: string;
}
async function getAccountMappingHandler(args: GetAccountMappingArgs) {
  await connectDB();
  return AiAccountMapping.findOne({ tenantId: args.tenantId, role: args.role }).lean();
}

export function registerAccountMappingTools(): void {
  registerTool<GetAccountMappingArgs>({
    name: "get_account_mapping",
    description: "Reads models/ai/AiAccountMapping.ts for a role (e.g. \"inventory\", \"suspense_clearing\").",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getAccountMappingHandler,
  });

  registerTool<RecordAccountMappingArgs>({
    name: "record_account_mapping",
    description: "The only write path to models/ai/AiAccountMapping.ts — a human-configured account-role override that beats every heuristic fallback.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: recordAccountMappingHandler,
  });
}
