import type {
  LanguageCode,
  LanguageDegradedReason,
  SarvamCallType,
} from "@/lib/constants/statuses";

export type ScriptKind =
  | "Latn" | "Deva" | "Beng" | "Gujr" | "Knda" | "Mlym" | "Orya" | "Guru" | "Taml" | "Telu"
  | "Other" | "None";

/** How the text relates to English. Drives whether any provider is touched. */
export type InputKind =
  | "english" // plain English -> short-circuit, no provider
  | "none" // digits/punctuation/emoji only -> nothing to translate
  | "native" // Indic script
  | "romanised" // Indian language typed in Latin script
  | "mixed" // code-mixed / several scripts
  | "unsupported"; // a script Sarvam's list here does not cover

export interface Detection {
  language: LanguageCode | "und";
  script: ScriptKind;
  kind: InputKind;
  confidence: number; // 0..1
  /** Devanagari could be Hindi or Marathi etc — let the provider decide (`auto`). */
  ambiguous: boolean;
}

export type EntityType =
  | "quoted" | "email" | "url" | "gstin" | "pan" | "tan" | "phone" | "date" | "code" | "name" | "label";

export interface ProtectedEntity {
  type: EntityType;
  value: string;
  placeholder: string;
}

export interface ProviderCall {
  provider: "sarvam";
  type: SarvamCallType;
  model?: string;
  characters: number;
  latencyMs: number;
  ok: boolean;
  error?: string;
}

/** Everything a support engineer needs to see what the user typed vs what the model got. */
export interface LanguageTrace {
  original: string;
  detectedLanguage: LanguageCode | "und";
  script: ScriptKind;
  kind: InputKind;
  confidence: number;
  /** Deterministically cleaned text (entities restored). */
  normalised: string;
  /** English text after translation (entities restored); equals `normalised` when not translated. */
  translated: string;
  /** What the model receives. */
  modelText: string;
  entitiesProtected: { type: EntityType; value: string }[];
  /** Number/typo/word-number rewrites the user should be able to see. */
  rewrites: string[];
  providerCalls: ProviderCall[];
  totalLatencyMs: number;
  degraded: boolean;
  degradedReason?: LanguageDegradedReason;
  cacheHit: boolean;
  /** Meaning may differ from what was typed (translation, typo/number rewrites). */
  changedMaterially: boolean;
  /** Callers that create/change records must ASK, not act, when this is true. */
  lowConfidence: boolean;
  /** "I understood this as: …" text, present only when changedMaterially. */
  interpretation?: string;
}

export type SarvamErrorKind =
  | "not_configured" | "disabled" | "timeout" | "network" | "http" | "bad_response" | "not_implemented";

export interface SarvamError {
  kind: SarvamErrorKind;
  status?: number;
  message: string;
}

export type SarvamResult<T> =
  | { ok: true; data: T; latencyMs: number; characters: number }
  | { ok: false; error: SarvamError; latencyMs: number; characters: number };
