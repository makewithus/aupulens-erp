import crypto from "crypto";

/**
 * RFC 6238 TOTP (30s step, 6 digits, SHA-1 — the universally-compatible
 * default every authenticator app supports). Implemented directly on Node's
 * crypto module rather than adding a new npm dependency: the algorithm is
 * small (~40 lines), stable since 2011, and this is exactly the kind of
 * security-sensitive primitive not worth outsourcing to an unaudited/
 * unmaintained package for what amounts to one HMAC-SHA1 + dynamic truncation.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const SECRET_BYTES = 20; // 160 bits, RFC 4226 recommended minimum

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder > 0) {
    const lastChunk = bits.slice(bits.length - remainder).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(lastChunk, 2)];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(SECRET_BYTES));
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binCode % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

export function generateTotpCode(base32Secret: string, at: number = Date.now()): string {
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  return hotp(base32Decode(base32Secret), counter);
}

/**
 * Verifies a submitted code, tolerating one step of clock drift either side
 * (source doc's own posture: MFA must be usable, not just theoretically
 * correct). Returns false on any malformed input rather than throwing —
 * callers must treat every non-true result as "reject the login attempt."
 */
export function verifyTotpCode(
  base32Secret: string,
  submittedCode: string,
  at: number = Date.now(),
  windowSteps = 1,
): boolean {
  if (!/^\d{6}$/.test(submittedCode.trim())) return false;
  const code = submittedCode.trim();
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  const secretBuffer = base32Decode(base32Secret);
  for (let delta = -windowSteps; delta <= windowSteps; delta++) {
    const candidate = hotp(secretBuffer, counter + delta);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(code))) {
      return true;
    }
  }
  return false;
}

export function totpOtpauthUrl(secret: string, email: string): string {
  const label = encodeURIComponent(`Aupulens Global Admin:${email}`);
  const issuer = encodeURIComponent("Aupulens Global Admin");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(5).toString("hex"));
  }
  return codes;
}
