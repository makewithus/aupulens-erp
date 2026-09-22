// GSTIN lookup for the "Prefill from GST portal" action on the customer form.
//
// Two layers:
//  1. Offline decode (always available): validates the 15-char format +
//     checksum and derives state, PAN and entity type straight from the GSTIN.
//  2. Live taxpayer lookup (legal/trade name, address, status) through a GST
//     API provider. The GST portal itself is captcha-protected and has no
//     public API, so this needs a provider key: set GST_API_KEY (Appyflow —
//     https://appyflow.in) and optionally GST_API_URL to override the endpoint.
//     Without a key the offline-decoded fields are still returned, flagged
//     `live: false`, so the form fills what it honestly can.

export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

// 4th character of the PAN = holder type.
const PAN_ENTITY: Record<string, string> = {
  C: "Company",
  P: "Individual",
  H: "HUF",
  F: "Firm / LLP",
  A: "Association of Persons",
  B: "Body of Individuals",
  G: "Government",
  J: "Artificial Juridical Person",
  L: "Local Authority",
  T: "Trust",
};

export interface GstinLookupResult {
  ok: boolean;
  error?: string;
  /** true when the taxpayer name/address came from the live GST API */
  live?: boolean;
  message?: string;
  data?: {
    gstin: string;
    pan: string;
    entityType?: string;
    isCompany: boolean;
    legalName?: string;
    tradeName?: string;
    status?: string;
    address: { street?: string; street2?: string; city?: string; state?: string; zip?: string };
  };
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function isValidGstinChecksum(gstin: string): boolean {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARSET.indexOf(gstin[i]);
    if (v < 0) return false;
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36] === gstin[14];
}

export function validateGstin(raw: string): { ok: boolean; gstin: string; error?: string } {
  const gstin = (raw || "").trim().toUpperCase();
  if (!gstin) return { ok: false, gstin, error: "Please enter a GSTIN." };
  if (gstin.length !== 15) return { ok: false, gstin, error: "A GSTIN must be exactly 15 characters." };
  if (!GSTIN_RE.test(gstin)) {
    return { ok: false, gstin, error: "This GSTIN is not in the correct format (e.g. 27AAPFU0939F1ZV)." };
  }
  if (!GST_STATE_CODES[gstin.slice(0, 2)]) {
    return { ok: false, gstin, error: "The first two digits of this GSTIN are not a valid state code." };
  }
  if (!isValidGstinChecksum(gstin)) {
    return { ok: false, gstin, error: "This GSTIN looks mistyped (check digit doesn't match). Please re-check it." };
  }
  return { ok: true, gstin };
}

function titleCase(s?: string) {
  return (s || "").toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

async function fetchLiveTaxpayer(gstin: string): Promise<Partial<NonNullable<GstinLookupResult["data"]>> | null> {
  const key = process.env.GST_API_KEY;
  if (!key) return null;
  const base = process.env.GST_API_URL || "https://appyflow.in/api/verifyGST";
  const url = `${base}?gstNo=${encodeURIComponent(gstin)}&key_secret=${encodeURIComponent(key)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    const json: any = await res.json();
    const info = json?.taxpayerInfo;
    if (json?.error || !info) return null;
    const addr = info.pradr?.addr || {};
    const street = [addr.bno, addr.bnm, addr.flno, addr.st].filter(Boolean).join(", ");
    return {
      legalName: info.lgnm ? titleCase(info.lgnm) : undefined,
      tradeName: info.tradeNam ? titleCase(info.tradeNam) : undefined,
      status: info.sts,
      address: {
        street: street || undefined,
        street2: addr.loc || undefined,
        city: addr.dst || addr.city || undefined,
        state: addr.stcd || undefined,
        zip: addr.pncd || undefined,
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupGstin(input: string): Promise<GstinLookupResult> {
  const v = validateGstin(input);
  if (!v.ok) return { ok: false, error: v.error };
  const { gstin } = v;

  const pan = gstin.slice(2, 12);
  const entityType = PAN_ENTITY[pan[3]];
  const state = GST_STATE_CODES[gstin.slice(0, 2)];
  const base = {
    gstin,
    pan,
    entityType,
    isCompany: pan[3] !== "P",
    address: { state } as NonNullable<GstinLookupResult["data"]>["address"],
  };

  const live = await fetchLiveTaxpayer(gstin);
  if (live) {
    return {
      ok: true,
      live: true,
      data: { ...base, ...live, address: { ...live.address, state: live.address?.state || state } },
    };
  }
  return {
    ok: true,
    live: false,
    message: process.env.GST_API_KEY
      ? "The GST service didn't respond, so only the state, PAN and business type were filled. Please enter the name and address manually."
      : "State, PAN and business type were filled from the GSTIN. Company name and address need a GST API key to be configured (GST_API_KEY).",
    data: base,
  };
}
