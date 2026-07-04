// Clean-interface wrapper around a GST-portal GSTIN lookup, mirroring the
// GspService pattern in lib/einvoice/gspService.ts — the internal flow (route,
// UI wiring, field prefill) is real; only the external GST-portal network call
// is stubbed pending real API access.
// TODO: replace with a real GST portal / GSP GSTIN-lookup API call.

export interface GstinLookupResult {
  ok: boolean;
  error?: string;
  data?: {
    legalName: string;
    tradeName?: string;
    address: { street?: string; city?: string; state?: string; zip?: string };
  };
}

export async function lookupGstin(gstin: string): Promise<GstinLookupResult> {
  if (!gstin || gstin.trim().length !== 15) {
    return { ok: false, error: "Enter a valid 15-character GSTIN" };
  }
  // Stub: derive a plausible state name from the GSTIN's 2-digit state code so the
  // prefill flow is exercised end-to-end without a real GST portal integration.
  const STATE_CODES: Record<string, string> = {
    "27": "Maharashtra",
    "29": "Karnataka",
    "07": "Delhi",
    "33": "Tamil Nadu",
    "24": "Gujarat",
    "06": "Haryana",
  };
  const stateCode = gstin.slice(0, 2);
  return {
    ok: true,
    data: {
      legalName: `Business (${gstin})`,
      address: { state: STATE_CODES[stateCode] || undefined },
    },
  };
}
