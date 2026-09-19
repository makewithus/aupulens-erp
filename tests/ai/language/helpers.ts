import { vi } from "vitest";
import type { SarvamClient } from "@/lib/ai/language/sarvam/client";

type TranslateImpl = (req: any) => { text: string; source?: string } | { fail: string };

/** A mock SarvamClient — CI never makes a live call (Rule 11). */
export function fakeClient(translate: TranslateImpl): SarvamClient & { translateSpy: ReturnType<typeof vi.fn> } {
  const translateSpy = vi.fn(async (req: any) => {
    const r = translate(req);
    if ("fail" in r) return { ok: false as const, error: { kind: r.fail as any, message: r.fail }, latencyMs: 5, characters: req.input.length };
    return { ok: true as const, data: { translatedText: r.text, sourceLanguage: r.source ?? "hi-IN" }, latencyMs: 5, characters: req.input.length };
  });
  return {
    translateSpy,
    translate: translateSpy,
    detect: vi.fn(async (i: string) => ({ ok: true as const, data: { language: "hi-IN", script: "Latn" }, latencyMs: 1, characters: i.length })),
    transliterate: vi.fn(async (i: string) => ({ ok: true as const, data: { text: i }, latencyMs: 1, characters: i.length })),
    speech: {} as any,
  } as any;
}

export function setSarvamEnv(on = true) {
  process.env.SARVAM_ENABLED = "true";
  if (on) process.env.SARVAM_API_KEY = "test-key-not-real";
  else delete process.env.SARVAM_API_KEY;
}
