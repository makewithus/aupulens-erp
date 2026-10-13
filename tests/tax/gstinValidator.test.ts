import { describe, it, expect } from "vitest";
import { validateGstin, isValidGstinChecksum, GSTIN_REGEX, GST_STATE_CODES } from "@/lib/tax/gstinValidator";

describe("GSTIN Syntax & Format Validator (Priority 8.A)", () => {
  // Real valid GSTIN samples with known correct check digits
  const VALID_GSTINS = [
    "27AAPFU0939F1ZV", // Maharashtra (27), Firm (F), Z, V
    "32AAVCM0878J1ZX", // Kerala (32), Company (C), Z, X
    "29ABCDE1234F1ZW", // Karnataka (29), Firm (F), Z, W
    "07AAAAA0000A1Z4", // Delhi (07), Association (A), Z, 4
  ];

  it("validates well-formed, valid GSTINs successfully", () => {
    for (const gstin of VALID_GSTINS) {
      const res = validateGstin(gstin);
      expect(res.ok).toBe(true);
      expect(res.gstin).toBe(gstin);
      expect(res.error).toBeUndefined();
      expect(res.stateCode).toBe(gstin.slice(0, 2));
      expect(res.stateName).toBe(GST_STATE_CODES[gstin.slice(0, 2)]);
      expect(res.pan).toBe(gstin.slice(2, 12));
    }
  });

  it("decodes entity type correctly from the 4th PAN character", () => {
    const resCompany = validateGstin("27AAPFU0939F1ZV");
    expect(resCompany.ok).toBe(true);
    expect(resCompany.entityType).toBe("Firm / LLP"); // 'F' is Firm / LLP
    expect(resCompany.isCompany).toBe(false);

    const resKerala = validateGstin("32AAVCM0878J1ZX");
    expect(resKerala.ok).toBe(true);
    expect(resKerala.entityType).toBe("Company"); // 'C' is Company
    expect(resKerala.isCompany).toBe(true);
  });

  it("rejects empty, null, or whitespace-only input", () => {
    expect(validateGstin("").ok).toBe(false);
    expect(validateGstin("   ").ok).toBe(false);
    expect(validateGstin(null as any).ok).toBe(false);
  });

  it("rejects input of invalid length", () => {
    const shortRes = validateGstin("27AAPFU0939F1Z");
    expect(shortRes.ok).toBe(false);
    expect(shortRes.error).toContain("15 characters");

    const longRes = validateGstin("27AAPFU0939F1ZVA");
    expect(longRes.ok).toBe(false);
    expect(longRes.error).toContain("15 characters");
  });

  it("rejects input that fails GSTIN regex pattern", () => {
    // Contains lowercase or invalid characters
    const invalidCharRes = validateGstin("27AAPFU0939F!ZV");
    expect(invalidCharRes.ok).toBe(false);
    expect(invalidCharRes.error).toContain("format");

    // Missing 'Z' in 14th character
    const noZRes = validateGstin("27AAPFU0939F1AV");
    expect(noZRes.ok).toBe(false);
    expect(noZRes.error).toContain("format");
  });

  it("rejects invalid state codes (e.g. 99, 00)", () => {
    // 99 is invalid state code (valid are 01-38, 97)
    const invalidStateRes = validateGstin("99AAPFU0939F1ZV");
    expect(invalidStateRes.ok).toBe(false);
    expect(invalidStateRes.error).toContain("state code");
  });

  it("rejects corrupted check digit (typos in GSTIN)", () => {
    // 27AAPFU0939F1ZV has check digit 'V'. If replaced with 'A':
    const typoRes = validateGstin("27AAPFU0939F1ZA");
    expect(typoRes.ok).toBe(false);
    expect(typoRes.error).toContain("checksum");
    expect(isValidGstinChecksum("27AAPFU0939F1ZA")).toBe(false);
  });

  it("handles case-insensitivity by auto-uppercasing", () => {
    const lowerRes = validateGstin("27aapfu0939f1zv");
    expect(lowerRes.ok).toBe(true);
    expect(lowerRes.gstin).toBe("27AAPFU0939F1ZV");
  });
});
