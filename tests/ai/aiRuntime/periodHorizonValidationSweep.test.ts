import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Chunk 10 (P0.1) — the permanent regression sweep for the exact defect class that hit AI-12
 * three times over: `observe()` trusting an unvalidated `event.payload.period`/`periodEnd` on
 * `period.horizon.reached`, which reaches a Date constructor and eventually `.toISOString()`
 * uncaught. Two occurrences (AI-07/AI-09's month-length variant, then the cross-workflow
 * consolidation) was a bug; a THIRD — AI-12's own verification record calling this "not
 * applicable" when the code was still vulnerable — was a process failure: documentation that can
 * silently contradict the code. This file makes that specific contradiction structurally
 * impossible to reintroduce without a test failure, for any workflow, present or future.
 *
 * Two checks:
 * 1. CODE: every workflow subscribing to `period.horizon.reached` either validates the payload
 *    (via `PERIOD_PATTERN` or `isValidIsoInstant`, the two helpers already in use across the 13
 *    fixed workflows) or is on the `STRUCTURALLY_INERT` allowlist below — and every allowlisted
 *    entry's OWN inertness claim is itself re-checked by source-grep here, not just asserted.
 * 2. DOCS: no workflow's own verification record calls the period-boundary defect class "not
 *    applicable" while its code is NOT on the validated/inert list above — the exact contradiction
 *    that made AI-12's record wrong.
 */

const WORKFLOWS_DIR = path.join(__dirname, "..", "..", "..", "lib", "aiRuntime", "workflows");
const VERIFICATION_DIR = path.join(__dirname, "..", "..", "..", "docs", "ai", "verification");

/** Workflows confirmed, by direct source reading (not assumption), to never construct a Date
 *  from an event-payload-supplied period/periodEnd at all — so there is nothing to validate.
 *  Adding an entry here requires the same source-grep proof this file's own tests perform (see
 *  the two dedicated "inertness claim holds" tests below, one per entry). */
const STRUCTURALLY_INERT: Record<string, { file: string; reason: string }> = {
  "ai-19-master-data": {
    file: "ai-19-master-data/index.ts",
    reason: "observe() never reads event.payload.period/periodEnd at all for period.horizon.reached — its own raw shape has no period field.",
  },
  "ai-20-related-party-detection": {
    file: "ai-20-related-party-detection/index.ts",
    reason: "period is stored on raw but never read again anywhere in extract()/reason()/act() — confirmed inert, not just unvalidated.",
  },
};

function findWorkflowFiles(): { dir: string; file: string; source: string }[] {
  const dirs = fs.readdirSync(WORKFLOWS_DIR).filter((d) => fs.statSync(path.join(WORKFLOWS_DIR, d)).isDirectory());
  return dirs
    .map((dir) => ({ dir, file: path.join(WORKFLOWS_DIR, dir, "index.ts") }))
    .filter((w) => fs.existsSync(w.file))
    .map((w) => ({ ...w, source: fs.readFileSync(w.file, "utf8") }));
}

function subscribesToPeriodHorizon(source: string): boolean {
  return /period\.horizon\.reached/.test(source);
}

function hasValidatedDerivation(source: string): boolean {
  return /\bPERIOD_PATTERN\b/.test(source) || /\bisValidIsoInstant\b/.test(source);
}

describe("period.horizon.reached validation sweep (Chunk 10, P0.1 — the permanent AI-12-class regression net)", () => {
  const workflows = findWorkflowFiles().filter((w) => subscribesToPeriodHorizon(w.source));

  it("found at least the 15 workflows known to use period.horizon.reached — this sweep is not accidentally scanning zero files", () => {
    expect(workflows.length).toBeGreaterThanOrEqual(15);
  });

  it.each(workflows.map((w) => [w.dir, w] as const))(
    "%s: validates period/periodEnd, or is on the source-verified structurally-inert allowlist",
    (dir, w) => {
      if (hasValidatedDerivation(w.source)) return; // fixed the standard way — done

      const inert = STRUCTURALLY_INERT[dir];
      expect(inert, `${dir} subscribes to period.horizon.reached, has no PERIOD_PATTERN/isValidIsoInstant validation, and is not on the STRUCTURALLY_INERT allowlist — this is the exact AI-12 crash shape. Either add validation or, if genuinely inert, add a justified, source-verified allowlist entry.`).toBeDefined();
    },
  );

  it("ai-19-master-data's inertness claim holds: event.payload.period/periodEnd is never read", () => {
    const w = workflows.find((x) => x.dir === "ai-19-master-data");
    expect(w, "ai-19-master-data must still subscribe to period.horizon.reached for this check to mean anything").toBeDefined();
    expect(/event\.payload\.period(End)?\b/.test(w!.source), "ai-19-master-data now reads event.payload.period/periodEnd — re-verify whether it's still inert before trusting this allowlist entry").toBe(false);
  });

  it("ai-20-related-party-detection's inertness claim holds: 'period' is stored on raw but read nowhere downstream (extract()/reason()/act())", () => {
    const w = workflows.find((x) => x.dir === "ai-20-related-party-detection");
    expect(w).toBeDefined();
    // The real inertness claim is about DOWNSTREAM reads — observed.raw.period / extracted.period
    // — not the observe()-internal event.payload.period truthy-check-then-assign, which
    // legitimately mentions "period" twice on one line (the condition and the value).
    const downstreamReads = w!.source.match(/\b(observed\.raw|extracted)\.period\b/g) ?? [];
    expect(downstreamReads, "ai-20-related-party-detection now reads observed.raw.period/extracted.period somewhere downstream — re-verify whether it's still inert before trusting this allowlist entry").toHaveLength(0);
  });

  // ── DOCS: the actual "report right, code wrong" contradiction check ───────────────────────
  it.each(workflows.map((w) => [w.dir, w] as const))(
    "%s's own verification record never calls the period-boundary defect class 'not applicable' while the code is unvalidated and un-allowlisted",
    (dir, w) => {
      const codeIsSafe = hasValidatedDerivation(w.source) || Boolean(STRUCTURALLY_INERT[dir]);
      if (codeIsSafe) return; // nothing to contradict

      const workflowId = dir.match(/^ai-(\d+)-/)?.[1];
      if (!workflowId) return;
      const docPath = path.join(VERIFICATION_DIR, `AI-${workflowId}.md`);
      if (!fs.existsSync(docPath)) return; // no record yet — a different gap, not this one

      const doc = fs.readFileSync(docPath, "utf8");
      // Look for a line that both mentions "not applicable" AND references the period-boundary
      // class (period/periodEnd/horizon) — the specific shape of AI-12's original false claim.
      const contradiction = doc
        .split("\n")
        .some((line) => /not applicable/i.test(line) && /period|periodend|horizon/i.test(line) && !/covered|fixed|see section 9/i.test(line));

      expect(contradiction, `${dir}'s verification record (docs/ai/verification/AI-${workflowId}.md) calls the period-boundary defect class "not applicable" while the code itself has no validated derivation and isn't on the structurally-inert allowlist — this is the exact contradiction AI-12's own record had. Fix the code (preferred) or correct the record to match reality.`).toBe(false);
    },
  );
});
