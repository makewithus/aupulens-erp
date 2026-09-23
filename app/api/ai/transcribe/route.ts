import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { transcribeAudio, isSpeechConfigured } from "@/lib/ai/speechToText";
import { getSarvamClient } from "@/lib/ai/language/sarvam/client";
import { getSarvamConfig, isSarvamUsable } from "@/lib/ai/language/config";

// Node runtime — the Azure OpenAI SDK / file handling isn't Edge-compatible.
export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB — ~a few minutes of opus audio

/**
 * POST /api/ai/transcribe
 * Body: multipart/form-data with an `audio` file (Blob from MediaRecorder),
 * optional `language` field (e.g. "en-IN"). Returns { success, text }.
 *
 * Session-gated. Never throws to the client — a failure returns a clear message
 * so the mic UI can toast it instead of leaving the user stuck.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const sarvamCfg = getSarvamConfig();
    const useSarvam = sarvamCfg.enabled && isSarvamUsable(sarvamCfg);

    if (!useSarvam && !isSpeechConfigured()) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Voice input isn't set up yet. Ask your admin to configure Azure speech-to-text or Sarvam AI.",
        },
        { status: 501 }
      );
    }

    const form = await req.formData();
    const audio = form.get("audio");
    const language = (form.get("language") as string) || "en-IN";

    if (!audio || typeof audio === "string") {
      return NextResponse.json({ success: false, message: "No audio provided." }, { status: 400 });
    }
    const blob = audio as Blob;
    if (blob.size === 0) {
      return NextResponse.json({ success: false, message: "The recording was empty." }, { status: 400 });
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ success: false, message: "Recording too long (max ~20 MB)." }, { status: 413 });
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const contentType = blob.type || "audio/webm";
    const filename = (blob as any).name || `audio.${contentType.includes("ogg") ? "ogg" : "webm"}`;

    let text = "";
    if (useSarvam) {
      const client = getSarvamClient();
      const result = await client.speech.transcribe({
        audio: blob,
        languageCode: language,
        mimeType: contentType,
      });
      if (result.ok === false) {
        throw new Error((result as any).error?.message || "Sarvam ASR failed.");
      }
      text = (result as any).data?.transcript || "";
    } else {
      text = await transcribeAudio(buffer, { contentType, filename, language });
    }
    return NextResponse.json({ success: true, text });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Transcription failed. Please try again." },
      { status: 500 }
    );
  }
}
