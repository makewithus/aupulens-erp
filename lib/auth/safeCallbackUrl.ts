/**
 * Validate a post-login `callbackUrl` (Part 1.2).
 *
 * A user who arrives at the sign-in page from a protected page (e.g.
 * /accept-invite) should be returned there after authenticating. But a
 * callbackUrl is attacker-controllable via the query string, so it must be
 * constrained to a SAME-ORIGIN relative path — otherwise it's an open-redirect
 * (phishing) vector.
 *
 * Returns the safe path, or null when there's no usable/safe callback (caller
 * then falls back to its default destination, leaving normal login unchanged).
 */
export function safeCallbackUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* malformed encoding — fall through with the raw value */
  }
  decoded = decoded.trim();
  // Must be a relative path anchored at the site root.
  if (!decoded.startsWith("/")) return null;
  // Reject protocol-relative ("//evil.com") and backslash tricks ("/\evil.com",
  // "/\\evil.com") that some browsers normalise to an absolute URL.
  if (decoded.startsWith("//")) return null;
  if (/^\/+[\\]/.test(decoded)) return null;
  // Defense in depth: reject anything that still parses as absolute.
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(decoded)) return null;
  return decoded;
}
