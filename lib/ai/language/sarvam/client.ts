/**
 * Thin typed Sarvam client. Contract: NEVER throws into the caller — every method resolves to
 * `{ ok: true, data }` or `{ ok: false, error }` so the pipeline can degrade (fail open).
 * Endpoints/limits per docs.sarvam.ai (read 2026-09-19, see docs/sarvam/DISCOVERY.md):
 *   POST /text-lid       {input<=1000}                      -> {language_code, script_code}
 *   POST /translate      {input, source_language_code|auto, target_language_code, model, mode, output_script, numerals_format}
 *   POST /transliterate  {input<=1000, source_language_code, target_language_code, numerals_format}
 * Auth header: `api-subscription-key`. The key is never logged or included in error text.
 */
import { getSarvamConfig, isSarvamUsable, type SarvamConfig } from "../config";
import type { SarvamError, SarvamResult } from "../types";

export type TranslateModel = "mayura:v1" | "sarvam-translate:v1";
export type TranslateMode = "formal" | "modern-colloquial" | "classic-colloquial" | "code-mixed";

export interface TranslateRequest {
  input: string;
  source: string; // BCP-47 code or "auto"
  target: string;
  model?: TranslateModel;
  mode?: TranslateMode;
  outputScript?: "roman" | "fully-native" | "spoken-form-in-native"; // mayura only
}
export interface TranslateData { translatedText: string; sourceLanguage: string }
export interface DetectData { language: string; script: string }
export interface TransliterateData { text: string }

export const MODEL_LIMITS: Record<TranslateModel, number> = { "mayura:v1": 1000, "sarvam-translate:v1": 2000 };

/** Speech interfaces — designed now, built later (docs/sarvam/VOICE_READINESS.md). */
export interface AsrRequest { audio: Blob | ArrayBuffer; languageCode?: string; mimeType?: string }
export interface AsrData { transcript: string; language?: string }
export interface TtsRequest { text: string; languageCode: string; speaker?: string }
export interface TtsData { audio: ArrayBuffer; mimeType: string }
export interface SarvamSpeech {
  transcribe(req: AsrRequest): Promise<SarvamResult<AsrData>>;
  synthesize(req: TtsRequest): Promise<SarvamResult<TtsData>>;
}

type FetchFn = typeof fetch;

const fail = (error: SarvamError, started: number, characters: number): SarvamResult<never> => ({
  ok: false, error, latencyMs: Date.now() - started, characters,
});

async function post<T>(
  path: string,
  body: Record<string, unknown>,
  characters: number,
  parse: (json: any) => T | null,
  cfg: SarvamConfig,
  fetchFn: FetchFn,
): Promise<SarvamResult<T>> {
  const started = Date.now();
  if (!cfg.enabled) return fail({ kind: "disabled", message: "Sarvam is disabled" }, started, characters);
  if (!isSarvamUsable(cfg)) return fail({ kind: "not_configured", message: "SARVAM_API_KEY is not set" }, started, characters);

  let lastError: SarvamError = { kind: "network", message: "unknown" };
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = cfg.timeoutMs - (Date.now() - started);
    // One retry, only if it can still fit inside the hard overall timeout.
    if (attempt > 0 && remaining < 300) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(remaining, 1));
    try {
      const res = await fetchFn(`${cfg.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-subscription-key": cfg.apiKey },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        lastError = { kind: "http", status: res.status, message: `Sarvam ${path} returned HTTP ${res.status}` };
        // Transient only: 429 / 5xx. 4xx (bad key, bad request, too long) is final.
        if (res.status === 429 || res.status >= 500) continue;
        break;
      }
      let json: unknown;
      try { json = await res.json(); } catch { json = null; }
      const data = json ? parse(json) : null;
      if (data === null) {
        lastError = { kind: "bad_response", message: `Sarvam ${path} returned an unexpected body` };
        break;
      }
      return { ok: true, data, latencyMs: Date.now() - started, characters };
    } catch (err) {
      const aborted = ctrl.signal.aborted || (err as { name?: string })?.name === "AbortError";
      lastError = aborted
        ? { kind: "timeout", message: `Sarvam ${path} timed out after ${cfg.timeoutMs}ms` }
        : { kind: "network", message: `Sarvam ${path} network error` };
      if (aborted) break; // budget is spent
    } finally {
      clearTimeout(timer);
    }
  }
  return fail(lastError, started, characters);
}

export function createSarvamClient(opts: { fetchFn?: FetchFn; config?: () => SarvamConfig } = {}) {
  const fetchFn = opts.fetchFn ?? ((...a: Parameters<FetchFn>) => fetch(...a));
  const cfg = () => (opts.config ? opts.config() : getSarvamConfig());

  return {
    detect(input: string): Promise<SarvamResult<DetectData>> {
      const text = input.slice(0, 1000);
      return post("/text-lid", { input: text }, text.length,
        (j) => (typeof j.language_code === "string" ? { language: j.language_code, script: String(j.script_code ?? "") } : null),
        cfg(), fetchFn);
    },
    translate(req: TranslateRequest): Promise<SarvamResult<TranslateData>> {
      const model = req.model ?? "mayura:v1";
      if (req.input.length > MODEL_LIMITS[model]) {
        return Promise.resolve(fail({ kind: "http", status: 422, message: `input exceeds ${MODEL_LIMITS[model]} chars for ${model}` }, Date.now(), req.input.length));
      }
      const body: Record<string, unknown> = {
        input: req.input,
        source_language_code: req.source,
        target_language_code: req.target,
        model,
        numerals_format: "international",
      };
      if (model === "mayura:v1") {
        if (req.mode) body.mode = req.mode;
        if (req.outputScript) body.output_script = req.outputScript;
      }
      return post("/translate", body, req.input.length,
        (j) => (typeof j.translated_text === "string" ? { translatedText: j.translated_text, sourceLanguage: String(j.source_language_code ?? "") } : null),
        cfg(), fetchFn);
    },
    transliterate(input: string, source: string, target: string): Promise<SarvamResult<TransliterateData>> {
      const text = input.slice(0, 1000);
      return post("/transliterate", { input: text, source_language_code: source, target_language_code: target, numerals_format: "international" }, text.length,
        (j) => (typeof j.transliterated_text === "string" ? { text: j.transliterated_text } : null),
        cfg(), fetchFn);
    },
    speech: <SarvamSpeech>{
      transcribe: async () => fail({ kind: "not_implemented", message: "ASR not built in this pass" }, Date.now(), 0),
      synthesize: async () => fail({ kind: "not_implemented", message: "TTS not built in this pass" }, Date.now(), 0),
    },
  };
}

export type SarvamClient = ReturnType<typeof createSarvamClient>;

let shared: SarvamClient | null = null;
/** Process-wide client. Tests replace it with setSarvamClientForTests(mock). */
export function getSarvamClient(): SarvamClient {
  return (shared ??= createSarvamClient());
}
export function setSarvamClientForTests(c: SarvamClient | null): void {
  shared = c;
}
