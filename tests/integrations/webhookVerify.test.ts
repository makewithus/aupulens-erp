/**
 * Security tests for inbound webhook signature verification — the boundary that
 * decides whether an external request is trusted. Covers each scheme's happy
 * path plus forgery/tamper/replay rejection.
 */

import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyWebhookSignature, signForScheme, digestPayload } from "@/lib/integrations/webhookVerify";
import { listConnectors, getConnector, connectorCatalog } from "@/lib/integrations/registry";

const SECRET = "whsec_test_secret_key";
const BODY = JSON.stringify({ event: "payment.captured", amount: 5000 });

describe("verifyWebhookSignature — hmac_sha256_hex (Razorpay/generic)", () => {
  it("accepts a correct signature", () => {
    const sig = signForScheme("hmac_sha256_hex", BODY, SECRET);
    expect(verifyWebhookSignature("hmac_sha256_hex", BODY, sig, SECRET).valid).toBe(true);
  });
  it("rejects a forged signature", () => {
    const sig = signForScheme("hmac_sha256_hex", BODY, "wrong_secret");
    expect(verifyWebhookSignature("hmac_sha256_hex", BODY, sig, SECRET).valid).toBe(false);
  });
  it("rejects a tampered body", () => {
    const sig = signForScheme("hmac_sha256_hex", BODY, SECRET);
    expect(verifyWebhookSignature("hmac_sha256_hex", BODY + "x", sig, SECRET).valid).toBe(false);
  });
  it("rejects a missing header", () => {
    expect(verifyWebhookSignature("hmac_sha256_hex", BODY, null, SECRET).valid).toBe(false);
  });
  it("rejects when no secret configured", () => {
    const sig = signForScheme("hmac_sha256_hex", BODY, SECRET);
    expect(verifyWebhookSignature("hmac_sha256_hex", BODY, sig, "").valid).toBe(false);
  });
});

describe("verifyWebhookSignature — hmac_sha256_base64 (Shopify)", () => {
  it("accepts a correct base64 signature", () => {
    const sig = signForScheme("hmac_sha256_base64", BODY, SECRET);
    expect(verifyWebhookSignature("hmac_sha256_base64", BODY, sig, SECRET).valid).toBe(true);
  });
  it("rejects a hex signature under the base64 scheme", () => {
    const hex = signForScheme("hmac_sha256_hex", BODY, SECRET);
    expect(verifyWebhookSignature("hmac_sha256_base64", BODY, hex, SECRET).valid).toBe(false);
  });
});

describe("verifyWebhookSignature — github_sha256 (WhatsApp/Meta)", () => {
  it("accepts a correct sha256=<hex> header", () => {
    const sig = signForScheme("github_sha256", BODY, SECRET);
    expect(sig.startsWith("sha256=")).toBe(true);
    expect(verifyWebhookSignature("github_sha256", BODY, sig, SECRET).valid).toBe(true);
  });
  it("rejects a malformed header", () => {
    expect(verifyWebhookSignature("github_sha256", BODY, "sha1=abc", SECRET).valid).toBe(false);
  });
});

describe("verifyWebhookSignature — stripe", () => {
  it("accepts a fresh, correctly-signed event", () => {
    const sig = signForScheme("stripe", BODY, SECRET);
    expect(verifyWebhookSignature("stripe", BODY, sig, SECRET).valid).toBe(true);
  });
  it("rejects a replayed (stale) timestamp", () => {
    const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 min old
    const sig = signForScheme("stripe", BODY, SECRET, oldTs);
    const res = verifyWebhookSignature("stripe", BODY, sig, SECRET);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/tolerance/);
  });
  it("rejects a tampered v1 signature", () => {
    const t = Math.floor(Date.now() / 1000);
    const forged = `t=${t},v1=${crypto.randomBytes(32).toString("hex")}`;
    expect(verifyWebhookSignature("stripe", BODY, forged, SECRET).valid).toBe(false);
  });
});

describe("digestPayload", () => {
  it("is deterministic and truncated", () => {
    const d = digestPayload(BODY);
    expect(d).toBe(digestPayload(BODY));
    expect(d).toHaveLength(32);
  });
});

describe("registry", () => {
  it("every webhook connector's secretField exists in its credentials", () => {
    for (const c of listConnectors()) {
      if (!c.webhook) continue;
      expect(c.credentials.some((f) => f.key === c.webhook!.secretField)).toBe(true);
    }
  });
  it("catalog view carries credential field DEFINITIONS only, never values", () => {
    const cat = connectorCatalog();
    const razorpay = cat.find((c) => c.id === "razorpay")!;
    expect(razorpay.hasWebhook).toBe(true);
    // Every credential entry is a {key,label,secret,placeholder?} definition —
    // it must never carry a `value` (which would mean a stored secret leaked).
    for (const c of cat) {
      for (const f of c.credentials) {
        expect(f).not.toHaveProperty("value");
        expect(typeof f.key).toBe("string");
      }
    }
  });
  it("getConnector returns null for unknown ids", () => {
    expect(getConnector("nope")).toBeNull();
  });
});
