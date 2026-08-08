/**
 * Inbound webhook signature verification — the security boundary of Aupulens
 * Connect. Every inbound webhook is authenticated by re-computing the provider's
 * HMAC over the RAW request body and comparing it, in constant time, to the
 * signature header.
 *
 * Pure (only node:crypto) so it is fully unit-testable with no DB/network. This
 * is deliberately the most-tested part of the iPaaS layer: a mistake here would
 * let a forged request create financial records.
 */

import crypto from "node:crypto";
import type { SignatureScheme } from "@/lib/integrations/registry";

/** Constant-time compare of two hex/base64 strings of possibly different length. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * @param scheme    signature scheme from the connector definition
 * @param rawBody   the exact bytes of the request body (never re-serialized JSON)
 * @param header    the value of the connector's signature header
 * @param secret    the decrypted signing secret
 */
export function verifyWebhookSignature(
  scheme: SignatureScheme,
  rawBody: string,
  header: string | null | undefined,
  secret: string,
): VerifyResult {
  if (!secret) return { valid: false, reason: "No signing secret configured" };
  if (!header) return { valid: false, reason: "Missing signature header" };

  switch (scheme) {
    case "hmac_sha256_hex": {
      const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
      return safeEqual(expected, header.trim())
        ? { valid: true }
        : { valid: false, reason: "Signature mismatch" };
    }

    case "hmac_sha256_base64": {
      const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
      return safeEqual(expected, header.trim())
        ? { valid: true }
        : { valid: false, reason: "Signature mismatch" };
    }

    case "github_sha256": {
      // Header format: "sha256=<hex>"
      const [algo, hex] = header.split("=");
      if (algo !== "sha256" || !hex) return { valid: false, reason: "Malformed sha256 header" };
      const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
      return safeEqual(expected, hex.trim())
        ? { valid: true }
        : { valid: false, reason: "Signature mismatch" };
    }

    case "stripe": {
      // Header format: "t=<unix>,v1=<hex>[,v1=<hex>...]"
      const parts = Object.fromEntries(
        header.split(",").map((kv) => {
          const [k, ...rest] = kv.split("=");
          return [k.trim(), rest.join("=").trim()];
        }),
      );
      const t = parts["t"];
      const v1 = parts["v1"];
      if (!t || !v1) return { valid: false, reason: "Malformed Stripe signature header" };
      const signedPayload = `${t}.${rawBody}`;
      const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
      if (!safeEqual(expected, v1)) return { valid: false, reason: "Signature mismatch" };
      // Reject events older than 5 minutes (replay protection).
      const ageSec = Math.abs(Date.now() / 1000 - Number(t));
      if (Number.isNaN(ageSec) || ageSec > 300) return { valid: false, reason: "Timestamp outside tolerance" };
      return { valid: true };
    }

    default:
      return { valid: false, reason: `Unsupported scheme: ${scheme}` };
  }
}

/** Helper used by tests/tools to produce a valid signature for a given scheme. */
export function signForScheme(scheme: SignatureScheme, rawBody: string, secret: string, ts?: number): string {
  switch (scheme) {
    case "hmac_sha256_hex":
      return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    case "hmac_sha256_base64":
      return crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
    case "github_sha256":
      return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    case "stripe": {
      const t = ts ?? Math.floor(Date.now() / 1000);
      const v1 = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
      return `t=${t},v1=${v1}`;
    }
    default:
      return "";
  }
}

export function digestPayload(rawBody: string): string {
  return crypto.createHash("sha256").update(rawBody).digest("hex").slice(0, 32);
}
