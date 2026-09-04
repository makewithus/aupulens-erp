import connectDB from "@/lib/db";
import AiInventoryFinding from "@/models/ai/AiInventoryFinding";
import { resolveInventoryAccountMapping } from "@/lib/aiRuntime/inventory/accountMapping";
import { AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * AI-11's tools (docs/ai/BRIEF-08a-BATCH-G.md, AI-11). `get_inventory_account_mapping` composes
 * `lib/accounting/inventory.ts`'s own real account resolution — never a second, disagreeing
 * answer. `record_inventory_findings` is the only write, `internal_state`, targets only
 * `AiInventoryFinding`.
 */

export interface GetInventoryAccountMappingArgs {
  tenantId: string;
}
async function getInventoryAccountMappingHandler(args: GetInventoryAccountMappingArgs) {
  return resolveInventoryAccountMapping(args.tenantId);
}

export interface RecordInventoryFindingsArgs {
  tenantId: string;
  period: string;
  accountMapping: unknown;
  subledgerToGl: unknown;
  negativeStock: unknown[];
  countVariances: unknown[];
  valuationAnomalies: unknown[];
  slowMoving: unknown[];
  marginAlerts: unknown[];
}
async function recordInventoryFindingsHandler(args: RecordInventoryFindingsArgs) {
  await connectDB();
  const doc = await AiInventoryFinding.findOneAndUpdate(
    { tenantId: args.tenantId, period: args.period },
    {
      $set: {
        accountMapping: args.accountMapping,
        subledgerToGl: args.subledgerToGl,
        negativeStock: args.negativeStock,
        countVariances: args.countVariances,
        valuationAnomalies: args.valuationAnomalies,
        slowMoving: args.slowMoving,
        marginAlerts: args.marginAlerts,
        evaluatedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );
  return { id: String(doc._id) };
}

export function registerInventoryReadTools(): void {
  registerTool<GetInventoryAccountMappingArgs>({
    name: "get_inventory_account_mapping",
    description: "Resolves which GL account(s) constitute inventory — reuses lib/accounting/inventory.ts's own real posting-account resolution.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getInventoryAccountMappingHandler,
  });
}

export function registerInventoryWriteTools(): void {
  registerTool<RecordInventoryFindingsArgs>({
    name: "record_inventory_findings",
    description: "Persists AI-11's inventory/COGS findings to models/ai/AiInventoryFinding.ts. Never writes Product/InventoryItem/Stock/StockMove.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: recordInventoryFindingsHandler,
  });
}
