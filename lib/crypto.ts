import crypto from "crypto";

// AES-256-GCM at-rest encryption for reversible secrets (e.g. GSP/NIC portal
// credentials) that cannot use one-way bcrypt hashing like user passwords do.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("Please define the ENCRYPTION_KEY environment variable (32-byte, base64 or hex encoded)");
  }
  const key = secret.length === 64 ? Buffer.from(secret, "hex") : Buffer.from(secret, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes (base64 or hex)");
  }
  return key;
}

// Returns "iv:authTag:ciphertext", all base64, colon-joined for storage in a single string field.
export function encrypt(plainText: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = payload.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Invalid encrypted payload format");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
