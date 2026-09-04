import connectDB from "@/lib/db";
import {
  AI_AUTONOMY_LEVEL,
  AI_TOOL_SIDE_EFFECT,
  TRANSACTION_LOCK_MODULE_VALUES,
  type TransactionLockModule,
} from "@/lib/constants/statuses";
import {
  assertTransactionNotLocked,
  TransactionLockError,
} from "@/lib/accounting/transactionLock";
import { registerTool, type ToolCallContext } from "@/lib/aiRuntime/tools/registry";
import { routePermissionCheck } from "@/lib/aiRuntime/tools/rbacRouter";
import { autoResolve } from "@/lib/aiRuntime/attention/attentionEngine";
import { checkSod } from "@/lib/aiRuntime/journalPatterns/sod";

/**
 * The Control tool set (Part 2.4) — the only tools this chunk registers.
 * Every `execute`-type tool the brief describes must call `check_period_lock`
 * (and, once real permission/materiality data exists, the others) before
 * acting; `callTool()` itself does not call these automatically for every
 * tool (it can't know which module/date/permission a given tool's args
 * imply), so each future write tool's own handler is responsible for calling
 * them explicitly, exactly like every existing route already calls
 * `assertTransactionNotLocked` inline (see docs/ai/SYSTEM_INVENTORY.md).
 */

export interface CheckPermissionArgs {
  tenantId: string;
  userId?: string;
  /** e.g. "finance", "crm", "sales" — routes to the real per-module RBAC (A.2). */
  module: string;
  action: string;
}
export interface CheckPermissionResult {
  allowed: boolean;
  reason: string;
}

export interface CheckPolicyArgs {
  tenantId: string;
  actionClass: string;
}
export interface CheckPolicyResult {
  allowed: boolean;
  reason: string;
}

export interface CheckMaterialityArgs {
  tenantId: string;
  workflowId: string;
  amount: number;
  materialityThreshold?: number;
}
export interface CheckMaterialityResult {
  belowMateriality: boolean;
  reason: string;
}

export interface CheckPeriodLockArgs {
  tenantId: string;
  module: Exclude<TransactionLockModule, "all">;
  date: string | Date;
}
export interface CheckPeriodLockResult {
  open: boolean;
  reason: string;
}

export interface CheckSodArgs {
  tenantId: string;
  preparerId?: string;
  approverId?: string;
}
export interface CheckSodResult {
  conflict: boolean;
  reason: string;
}

export interface ResolveTaskArgs {
  tenantId: string;
  dedupeKey: string;
}

export function registerControlTools(): void {
  // `resolve_task` — docs/ai/BRIEF-04-BATCH-C.md A.3 registers no new write tools for this
  // batch, and this is the one deliberate exception, reasoned explicitly rather than added
  // silently: `lib/aiRuntime/attention/attentionEngine.ts::autoResolve()` has existed,
  // documented, unused, since Chunk 1 ("close via autoResolve() once the underlying condition
  // is confirmed cleared") — nothing before AI-24 ever needed to close an item it raised once
  // the condition cleared. Scoped exclusively to the AI-native attention substrate (not ERP
  // business data), same EXECUTE risk class as the already-granted `create_task`, and it can
  // only resolve an item under the SAME `{tenantId, dedupeKey}` a workflow itself created —
  // never an arbitrary attention item. Used by AI-24 to close an evidence-request task once its
  // assertion re-evaluates to verified (docs/ai/OPEN_QUESTIONS.md records this exception).
  registerTool<ResolveTaskArgs>({
    name: "resolve_task",
    description: "Marks an attention-engine item (models/ai/AiAttentionItem.ts) resolved — only the same {tenantId, dedupeKey} a workflow itself created via create_task.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    // internal_state (docs/ai/BRIEF-05-BATCH-D.md Part 0.3) — writes only AiAttentionItem.
    // Approved with this formalisation in the brief itself, confirming Chunk 4's OQ #19 flag.
    category: "internal_state",
    handler: async (args) => {
      await autoResolve(args.tenantId, args.dedupeKey);
      return { tenantId: args.tenantId, dedupeKey: args.dedupeKey };
    },
  });


  registerTool<CheckPermissionArgs, CheckPermissionResult>({
    name: "check_permission",
    description:
      "Checks whether the acting principal has a given ERP permission. Routes to the real " +
      "lib/crm/rbac.ts for module=crm, and to the same role-per-module table middleware.ts " +
      "enforces for every other module (docs/ai/BRIEF-02-BATCH-A.md A.2). Denies by default " +
      "for any module with no mapped check.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: async (args) => {
      if (!args.tenantId || !args.module || !args.action) {
        return { allowed: false, reason: "missing tenantId, module, or action" };
      }
      return routePermissionCheck(args.tenantId, args.userId, args.module, args.action);
    },
  });

  registerTool<CheckPolicyArgs, CheckPolicyResult>({
    name: "check_policy",
    description: "Checks whether tenant policy specifically forbids a proposed action class.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: async (args) => {
      return { allowed: true, reason: `no tenant-level restriction found for action class "${args.actionClass}"` };
    },
  });

  registerTool<CheckMaterialityArgs, CheckMaterialityResult>({
    name: "check_materiality",
    description: "Checks whether an amount falls below the configured materiality threshold.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: async (args) => {
      if (args.materialityThreshold === undefined) {
        return { belowMateriality: true, reason: "no materiality threshold configured" };
      }
      const below = args.amount < args.materialityThreshold;
      return {
        belowMateriality: below,
        reason: `amount ${args.amount} ${below ? "<" : ">="} threshold ${args.materialityThreshold}`,
      };
    },
  });

  registerTool<CheckPeriodLockArgs, CheckPeriodLockResult>({
    name: "check_period_lock",
    description: "Checks whether a transaction date falls within a locked period for a module — wraps the real, already-enforced lib/accounting/transactionLock.ts.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: async (args) => {
      if (!TRANSACTION_LOCK_MODULE_VALUES.includes(args.module)) {
        return { open: false, reason: `unknown module "${args.module}"` };
      }
      await connectDB();
      try {
        await assertTransactionNotLocked(args.tenantId, args.module, args.date);
        return { open: true, reason: "period is open for this module/date" };
      } catch (err) {
        if (err instanceof TransactionLockError) {
          return { open: false, reason: err.message };
        }
        throw err;
      }
    },
  });

  registerTool<CheckSodArgs, CheckSodResult>({
    name: "check_sod",
    description: "Checks preparer/approver segregation of duties (real, docs/ai/BRIEF-07-BATCH-F.md 0.4) — wraps lib/aiRuntime/journalPatterns/sod.ts::checkSod(), the same function AI-23/AI-29 call directly. Permission-conflict SoD is a separate, not_implemented question — see that file.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: async (args) => checkSod(args.preparerId, args.approverId),
  });
}

export type { ToolCallContext };
