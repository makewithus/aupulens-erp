import { afterEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockTranscribeAudio, mockIsSpeechConfigured, mockRecordSarvamUsage } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockTranscribeAudio: vi.fn(),
  mockIsSpeechConfigured: vi.fn(),
  mockRecordSarvamUsage: vi.fn(async () => undefined),
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/ai/speechToText", () => ({
  transcribeAudio: mockTranscribeAudio,
  isSpeechConfigured: mockIsSpeechConfigured,
}));
vi.mock("@/lib/platform/ai/instrumentation", () => ({ recordSarvamUsage: mockRecordSarvamUsage }));

import { setSarvamClientForTests } from "@/lib/ai/language/sarvam/client";
import { SARVAM_CALL_TYPE } from "@/lib/constants/statuses";

function audioRequest() {
  const fd = new FormData();
  fd.append("audio", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }), "speech.webm");
  return new Request("http://localhost/api/ai/transcribe", { method: "POST", body: fd }) as any;
}

describe("/api/ai/transcribe provider routing", () => {
  afterEach(() => {
    setSarvamClientForTests(null);
    mockAuth.mockReset();
    mockTranscribeAudio.mockReset();
    mockIsSpeechConfigured.mockReset();
    mockRecordSarvamUsage.mockReset();
    delete process.env.SARVAM_API_KEY;
    process.env.SARVAM_ENABLED = "true";
  });

  it("uses Sarvam ASR when Sarvam is configured and records sarvam-asr usage", async () => {
    process.env.SARVAM_ENABLED = "true";
    process.env.SARVAM_API_KEY = "test-key-not-real";
    mockAuth.mockResolvedValue({ user: { id: "u1", tenantId: "tenant-a", role: "admin" } });
    mockIsSpeechConfigured.mockReturnValue(true);
    const sarvamClient = {
      translate: vi.fn(),
      detect: vi.fn(),
      transliterate: vi.fn(),
      speech: {
        transcribe: vi.fn(async () => ({ ok: true, data: { transcript: "तमिल invoice command", language: "ta-IN" }, latencyMs: 25, characters: 0 })),
        synthesize: vi.fn(),
      },
    } as any;
    setSarvamClientForTests(sarvamClient);
    const { POST } = await import("@/app/api/ai/transcribe/route");

    const res = await POST(audioRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, text: "तमिल invoice command" });
    expect(sarvamClient.speech.transcribe).toHaveBeenCalledWith(expect.objectContaining({ languageCode: "unknown", mimeType: "audio/webm" }));
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
    expect(mockRecordSarvamUsage).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a",
      call: expect.objectContaining({ provider: "sarvam", type: SARVAM_CALL_TYPE.ASR, model: "speech-to-text", ok: true, latencyMs: 25 }),
    }));
  });

  it("falls back to Azure speech only when Sarvam is not usable", async () => {
    delete process.env.SARVAM_API_KEY;
    process.env.SARVAM_ENABLED = "true";
    mockAuth.mockResolvedValue({ user: { id: "u1", tenantId: "tenant-a", role: "admin" } });
    mockIsSpeechConfigured.mockReturnValue(true);
    mockTranscribeAudio.mockResolvedValue("english transcript");
    const { POST } = await import("@/app/api/ai/transcribe/route");

    const res = await POST(audioRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, text: "english transcript" });
    expect(mockTranscribeAudio).toHaveBeenCalled();
    expect(mockRecordSarvamUsage).not.toHaveBeenCalled();
  });
});
