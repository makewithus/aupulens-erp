/**
 * Segregation of duties (docs/ai/BRIEF-07-BATCH-F.md 0.4). `check_sod` (the registered tool,
 * `lib/aiRuntime/tools/control.ts`) wraps this exact function — extracted so AI-23 and AI-29 can
 * call the identical real check directly rather than re-deriving it or going through a tool call
 * from inside another tool's handler (which the registry doesn't support).
 *
 * **Buildable now**: preparer ≠ approver on a `JournalEntry`, using `createdBy`/
 * `approvalDetails.approvedBy` — the only two identity fields this codebase actually carries per
 * transaction.
 *
 * **Not buildable**: conflicting *permission combinations* held by one user (e.g. "can both create
 * vendors and approve payments") — `lib/org/rbac.ts` has no role hierarchy or permission-matrix
 * concept, only `canManageOrg()`-style admin gates (confirmed, not assumed — see
 * `docs/ai/OPEN_QUESTIONS.md`). A real check would need a role→permission matrix naming which
 * permission pairs are mutually exclusive (e.g. "vendor master maintenance" + "payment approval")
 * — declared `not_implemented` rather than guessed from the two roles this codebase does have.
 */

export interface SodVerdict {
  conflict: boolean;
  reason: string;
}

export function checkSod(preparerId?: string, approverId?: string): SodVerdict {
  const conflict = Boolean(preparerId) && preparerId === approverId;
  return {
    conflict,
    reason: conflict ? "preparer and approver are the same user" : "no same-user conflict detected",
  };
}

export const SOD_PERMISSION_CONFLICT_NOT_IMPLEMENTED_REASON =
  "no role-permission matrix exists anywhere in this codebase (lib/org/rbac.ts has only admin-gate functions, no permission taxonomy) — checking whether one user holds two conflicting permissions would require inventing which permission pairs are mutually exclusive, which this batch does not do";
