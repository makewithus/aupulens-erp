import crypto from "node:crypto";
import connectDB from "@/lib/db";
import AiToolCall, { AI_TOOL_CALL_STATUS } from "@/models/ai/AiToolCall";
import {
  AI_AUTONOMY_LEVEL_ORDER,
  AI_AUTONOMY_LEVEL,
  AI_TOOL_SIDE_EFFECT,
  type AiAutonomyLevel,
  type AiToolSideEffect,
} from "@/lib/constants/statuses";

/**
 * The permissioned ERP tool registry (Part 2.4) — the ONLY way AI code
 * touches data. `lib/aiRuntime/workflows/**` must never import a Mongoose
 * model directly for a write; it calls a registered tool instead (enforced
 * for real by tests/ai/aiRuntime/safety.test.ts's source-grep test).
 *
 * The tool SET is populated incrementally, per Hard Rule "map to existing
 * service functions where they exist — wrap, don't rewrite." See
 * docs/ai/FOUNDATION-plan.md and docs/ai/BRIEF-02-BATCH-A.md Part C.
 */

export class ToolNotFoundError extends Error {
  constructor(name: string) {
    super(`No AI tool registered with name "${name}"`);
    this.name = "ToolNotFoundError";
  }
}

export class ToolAutonomyExceededError extends Error {
  constructor(toolName: string, requested: AiAutonomyLevel, max: AiAutonomyLevel) {
    super(`Tool "${toolName}" requires autonomy <= ${max}, but was called at ${requested}`);
    this.name = "ToolAutonomyExceededError";
  }
}

export class ToolPermissionDeniedError extends Error {
  constructor(toolName: string, reason: string) {
    super(`Permission denied calling tool "${toolName}": ${reason}`);
    this.name = "ToolPermissionDeniedError";
  }
}

/** Thrown when a second caller hits an idempotency key that's genuinely still executing
 *  (not timed out) — a real concurrent duplicate call, distinct from a safe replay. */
export class ToolCallInProgressError extends Error {
  constructor(toolName: string, idempotencyKey: string) {
    super(`Tool "${toolName}" is already in flight for idempotency key "${idempotencyKey}"`);
    this.name = "ToolCallInProgressError";
  }
}

export interface ToolCallContext {
  tenantId: string;
  runId: string;
  requestedAutonomy: AiAutonomyLevel;
  userId?: string;
}

export interface ToolCallRecord {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  idempotencyKey?: string;
  startedAt: Date;
  durationMs: number;
}

export interface ToolDefinition<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  sideEffect: AiToolSideEffect;
  reversible: boolean;
  /** The ceiling autonomy level a caller may invoke this tool at. */
  maxAutonomyLevel: AiAutonomyLevel;
  /** Required for draft/execute tools — used by check_permission's per-module router (A.2). */
  module?: string;
  /**
   * `"internal_state"` (docs/ai/BRIEF-05-BATCH-D.md Part 0.3) — for tools whose writes target
   * `models/ai/**` only (the AI runtime's own audit/attention/schedule substrate, never a
   * financial record). These tools still register, still audit, still take an idempotency key —
   * they skip only the financial-module RBAC check in `callTool()`, since there is no financial
   * permission to check against AI-native infrastructure. Default (omitted) is the existing
   * behaviour: a financial-module write requiring `check_permission`'s routing.
   * `tests/ai/aiRuntime/safety.test.ts` proves every `internal_state` tool's handler writes only
   * to a model whose name starts with `Ai` — the exact, unbroken naming convention every model
   * under `models/ai/**` already follows.
   */
  category?: "internal_state";
  handler: (args: TArgs, ctx: ToolCallContext) => Promise<TResult>;
}

const registry = new Map<string, ToolDefinition<any, any>>();

/** In-memory fast path in front of the persistent store — avoids a DB round-trip for a
 *  same-process repeat call. The persistent AiToolCall store (A.3) is the real cross-instance
 *  guarantee; this is purely a performance shortcut on top of it. */
const idempotencyCache = new Map<string, unknown>();

/** How long an `in_flight` row is trusted before being treated as abandoned and retried. */
const IN_FLIGHT_TIMEOUT_MS = 60_000;

export function registerTool<TArgs = Record<string, unknown>, TResult = unknown>(
  def: ToolDefinition<TArgs, TResult>,
): void {
  registry.set(def.name, def);
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

export function listTools(): ToolDefinition[] {
  return Array.from(registry.values());
}

function autonomyRank(level: AiAutonomyLevel): number {
  if (level === AI_AUTONOMY_LEVEL.NEVER_AUTONOMOUS) return Number.POSITIVE_INFINITY;
  const idx = AI_AUTONOMY_LEVEL_ORDER.indexOf(level);
  return idx < 0 ? Number.POSITIVE_INFINITY : idx;
}

function hashArgs(args: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(args)).digest("hex");
}

const isWriteEffect = (sideEffect: AiToolSideEffect): boolean =>
  sideEffect === AI_TOOL_SIDE_EFFECT.DRAFT || sideEffect === AI_TOOL_SIDE_EFFECT.EXECUTE;

/** Persistent idempotency lock+execute for write-type tools (A.3). Returns the tool result,
 *  either freshly computed or replayed from a prior `succeeded` row. */
async function callWithPersistentIdempotency<TResult>(
  tool: ToolDefinition,
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  idempotencyKey: string,
): Promise<TResult> {
  await connectDB();
  const argsHash = hashArgs(args);

  let lockRow;
  try {
    lockRow = await AiToolCall.create({
      tenantId: ctx.tenantId,
      runId: ctx.runId,
      toolName: tool.name,
      idempotencyKey,
      argsHash,
      status: AI_TOOL_CALL_STATUS.IN_FLIGHT,
    });
  } catch (err: unknown) {
    const isDuplicateKey = (err as { code?: number })?.code === 11000;
    if (!isDuplicateKey) throw err;

    const existing = await AiToolCall.findOne({ tenantId: ctx.tenantId, toolName: tool.name, idempotencyKey });
    if (existing?.status === AI_TOOL_CALL_STATUS.SUCCEEDED) {
      idempotencyCache.set(`${tool.name}::${idempotencyKey}`, existing.result);
      return existing.result as TResult;
    }
    if (existing?.status === AI_TOOL_CALL_STATUS.FAILED) {
      // Allow one retry: reclaim the row.
      existing.status = AI_TOOL_CALL_STATUS.IN_FLIGHT;
      existing.argsHash = argsHash;
      await existing.save();
      lockRow = existing;
    } else if (existing) {
      const ageMs = Date.now() - existing.createdAt.getTime();
      if (ageMs > IN_FLIGHT_TIMEOUT_MS) {
        existing.status = AI_TOOL_CALL_STATUS.IN_FLIGHT;
        existing.createdAt = new Date();
        await existing.save();
        lockRow = existing;
      } else {
        throw new ToolCallInProgressError(tool.name, idempotencyKey);
      }
    } else {
      throw err;
    }
  }

  try {
    const result = await tool.handler(args, ctx);
    lockRow.status = AI_TOOL_CALL_STATUS.SUCCEEDED;
    lockRow.result = (result as unknown as Record<string, unknown>) ?? null;
    lockRow.completedAt = new Date();
    await lockRow.save();
    idempotencyCache.set(`${tool.name}::${idempotencyKey}`, result);
    return result as TResult;
  } catch (err: unknown) {
    lockRow.status = AI_TOOL_CALL_STATUS.FAILED;
    lockRow.error = err instanceof Error ? err.message : String(err);
    lockRow.completedAt = new Date();
    await lockRow.save().catch(() => undefined);
    throw err;
  }
}

export async function callTool<TResult = unknown>(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  opts?: { idempotencyKey?: string },
): Promise<{ result: TResult; record: ToolCallRecord }> {
  const startedAt = new Date();
  const tool = registry.get(toolName);

  if (!tool) {
    throw new ToolNotFoundError(toolName);
  }

  if (autonomyRank(ctx.requestedAutonomy) > autonomyRank(tool.maxAutonomyLevel)) {
    throw new ToolAutonomyExceededError(toolName, ctx.requestedAutonomy, tool.maxAutonomyLevel);
  }

  if (isWriteEffect(tool.sideEffect) && tool.category !== "internal_state") {
    // Structural enforcement (Hard Rule 4): every draft/execute tool call is permission-
    // checked here, inside callTool() itself — not left to each workflow to remember to
    // call check_permission first. A tool with no declared `module` fails closed.
    // `internal_state` tools (docs/ai/BRIEF-05-BATCH-D.md Part 0.3) skip this — there is no
    // financial-module permission to check against a write that only ever targets
    // `models/ai/**`, and `tests/ai/aiRuntime/safety.test.ts` proves that structurally.
    const { routePermissionCheck } = await import("@/lib/aiRuntime/tools/rbacRouter");
    const permission = await routePermissionCheck(ctx.tenantId, ctx.userId, tool.module ?? "", toolName);
    if (!permission.allowed) {
      throw new ToolPermissionDeniedError(toolName, permission.reason);
    }
  }

  const cacheKey = opts?.idempotencyKey ? `${toolName}::${opts.idempotencyKey}` : undefined;
  if (cacheKey && idempotencyCache.has(cacheKey)) {
    const cached = idempotencyCache.get(cacheKey) as TResult;
    return {
      result: cached,
      record: {
        tool: toolName,
        args,
        result: cached as Record<string, unknown>,
        error: null,
        idempotencyKey: opts?.idempotencyKey,
        startedAt,
        durationMs: 0,
      },
    };
  }

  try {
    const result =
      opts?.idempotencyKey && isWriteEffect(tool.sideEffect)
        ? await callWithPersistentIdempotency<TResult>(tool, args, ctx, opts.idempotencyKey)
        : await tool.handler(args, ctx);

    return {
      result,
      record: {
        tool: toolName,
        args,
        result: (result as unknown as Record<string, unknown>) ?? null,
        error: null,
        idempotencyKey: opts?.idempotencyKey,
        startedAt,
        durationMs: Date.now() - startedAt.getTime(),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const record: ToolCallRecord = {
      tool: toolName,
      args,
      result: null,
      error: message,
      idempotencyKey: opts?.idempotencyKey,
      startedAt,
      durationMs: Date.now() - startedAt.getTime(),
    };
    (err as { toolCallRecord?: ToolCallRecord }).toolCallRecord = record;
    throw err;
  }
}

/** Test-only escape hatch — never call from workflow code. */
export function __clearRegistryForTests(): void {
  registry.clear();
  idempotencyCache.clear();
}
