/**
 * Escapes regex metacharacters in user-supplied input before it's interpolated
 * into a `RegExp`/`$regex` query. Without this, unanchored user input built
 * directly into `new RegExp(input)` can throw on malformed patterns (e.g. an
 * unbalanced `(`) and is a ReDoS vector for a crafted catastrophic-backtracking
 * pattern, since Node's regex engine is single-threaded and blocking.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
