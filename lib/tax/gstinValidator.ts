/**
 * Canonical GSTIN Syntax & Format Validator
 *
 * Provides deterministic offline validation for Indian Goods and Services Tax
 * Identification Numbers (GSTIN) without external network calls.
 *
 * IMPORTANT:
 * Valid syntax and checksum mathematically prove the GSTIN adheres to the
 * government-specified 15-character Mod-36 format. It DOES NOT prove that
 * the GSTIN is registered, currently active, or has filed returns.
 */

import { GST_STATE_CODES } from "@/lib/constants/indianStates";

export { GST_STATE_CODES };

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const MOD36_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// 4th character of the embedded PAN indicates the entity type
export const PAN_ENTITY_TYPES: Record<string, string> = {
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

export interface GstinValidationResult {
  ok: boolean;
  gstin: string;
  error?: string;
  stateCode?: string;
  stateName?: string;
  pan?: string;
  entityType?: string;
  isCompany?: boolean;
}

/**
 * Calculates and verifies the 15th character checksum of a GSTIN using the official Mod-36 algorithm.
 */
export function isValidGstinChecksum(gstin: string): boolean {
  if (!gstin || gstin.length !== 15) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = MOD36_CHARSET.indexOf(gstin[i]);
    if (v < 0) return false;
    const factor = i % 2 === 0 ? 1 : 2;
    const product = v * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const remainder = sum % 36;
  const checkDigitIndex = (36 - remainder) % 36;
  return MOD36_CHARSET[checkDigitIndex] === gstin[14];
}

/**
 * Validates the full structure of a GSTIN:
 * 1. Non-empty trimmed string of exactly 15 characters
 * 2. Matches regular expression ^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$
 * 3. First two digits correspond to a recognized state or union territory code
 * 4. Verifies the Mod-36 check digit algorithm
 */
export function validateGstin(raw: string): GstinValidationResult {
  const gstin = (raw || "").trim().toUpperCase();
  if (!gstin) {
    return { ok: false, gstin, error: "Please enter a GSTIN." };
  }
  if (gstin.length !== 15) {
    return { ok: false, gstin, error: "A GSTIN must be exactly 15 characters." };
  }
  if (!GSTIN_REGEX.test(gstin)) {
    return { ok: false, gstin, error: "This GSTIN is not in the correct format (e.g. 27AAPFU0939F1ZV)." };
  }

  const stateCode = gstin.slice(0, 2);
  const stateName = GST_STATE_CODES[stateCode];
  if (!stateName) {
    return { ok: false, gstin, error: `The first two digits (${stateCode}) are not a valid state code.` };
  }

  if (!isValidGstinChecksum(gstin)) {
    return { ok: false, gstin, error: "The checksum digit of this GSTIN is invalid. Please double-check for typos." };
  }

  const pan = gstin.slice(2, 12);
  const entityTypeChar = pan[3];
  const entityType = PAN_ENTITY_TYPES[entityTypeChar] || "Other";
  const isCompany = entityTypeChar === "C";

  return {
    ok: true,
    gstin,
    stateCode,
    stateName,
    pan,
    entityType,
    isCompany,
  };
}
