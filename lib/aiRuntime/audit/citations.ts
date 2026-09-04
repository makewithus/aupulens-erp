/**
 * AI-18's citation rule (docs/ai/BRIEF-07-BATCH-F.md A.2) — "every factual claim in an output
 * must carry at least one {model, id} reference. A sentence with no citation must not be
 * emitted." Implemented structurally, not by prompting: `makeClaim()` is the ONLY way to produce
 * a `Claim`, and it throws if `citations` is empty — an uncited claim cannot be constructed, and
 * a test asserts exactly that.
 *
 * "No evidence found for X" is itself a claim citing the *absence* — a `query` citation
 * (`{model: "Query", id: <a description of what was searched>}`), never a bare narrative
 * sentence with nothing behind it.
 */

export interface Citation {
  model: string;
  id: string;
  label: string;
  url?: string;
}

export interface Claim {
  claim_text: string;
  citations: Citation[];
}

export function makeClaim(claim_text: string, citations: Citation[]): Claim {
  if (citations.length === 0) {
    throw new Error(`Uncited claim rejected: "${claim_text}" — every claim must carry at least one {model, id} citation, even a claim of absence must cite the query performed`);
  }
  return { claim_text, citations };
}

/** The one legitimate way to say "nothing was found" — cites the search itself, never a bare
 *  narrative sentence. `searchDescription` is a human-readable description of what was queried. */
export function makeNotFoundClaim(claim_text: string, searchDescription: string): Claim {
  return makeClaim(claim_text, [{ model: "Query", id: searchDescription, label: "search performed" }]);
}
