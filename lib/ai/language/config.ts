/**
 * Multilingual layer configuration. Read from env on every call (cheap) so tests and a
 * key rotation take effect without a restart. Nothing here is ever logged or sent to a client.
 */
export interface SarvamConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

const DEFAULT_BASE_URL = "https://api.sarvam.ai";
const DEFAULT_TIMEOUT_MS = 2000;

export function getSarvamConfig(): SarvamConfig {
  const timeout = Number(process.env.SARVAM_TIMEOUT_MS);
  return {
    enabled: (process.env.SARVAM_ENABLED ?? "true").toLowerCase() !== "false",
    apiKey: (process.env.SARVAM_API_KEY ?? "").trim(),
    baseUrl: (process.env.SARVAM_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

/** True only when the global switch is on AND a key is present. */
export function isSarvamUsable(cfg: SarvamConfig = getSarvamConfig()): boolean {
  return cfg.enabled && cfg.apiKey.length > 0;
}

/**
 * How Roman-script Indian-language text reaches English.
 *  - "direct": one mayura `code-mixed` translate call (default — one round-trip).
 *  - "transliterate_first": Roman -> native script, then translate (two serial calls).
 * Kept switchable because which is more accurate is verified live (docs/sarvam/LIVE_VERIFICATION.md).
 */
export function getRomanStrategy(): "direct" | "transliterate_first" {
  return process.env.SARVAM_ROMAN_STRATEGY === "transliterate_first" ? "transliterate_first" : "direct";
}
