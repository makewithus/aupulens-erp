// Shared subdomain → tenantId resolution.
// Must stay pure (no Node.js-only imports) so it can be used from both
// middleware (Edge runtime) and Node.js route handlers / auth callbacks.
export function getTenantFromHost(hostname: string): string | null {
  const hostParts = hostname.split(".");

  // companyx.aupulens.online  →  "companyx"
  if (hostParts.length >= 3) {
    if (
      hostParts[0] !== "www" &&
      hostParts[0] !== "localhost" &&
      hostParts[0] !== "aupulens-erp"
    ) {
      return hostParts[0];
    }
  }

  // companyx.localhost:3000  →  "companyx"  (local multi-tenant dev)
  if (hostname.includes("localhost") && hostParts.length >= 2) {
    if (hostParts[0] !== "localhost") {
      return hostParts[0];
    }
  }

  return null;
}
