import { AzureOpenAI, toFile } from "openai";

/**
 * Server-side speech-to-text via Azure — so voice input works in EVERY browser
 * and in the Electron desktop app (the old browser Web Speech API silently
 * failed in Electron / Firefox). Audio is recorded client-side (MediaRecorder →
 * webm/opus) and POSTed to /api/ai/transcribe, which calls this.
 *
 * Two Azure backends are supported; the first that is configured wins:
 *  1. Azure OpenAI Whisper (RECOMMENDED) — set AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT
 *     to a whisper deployment on your existing Azure OpenAI resource. Reuses
 *     AZURE_OPENAI_API_KEY / _ENDPOINT / _API_VERSION. Handles browser webm/opus
 *     audio natively, which is why it's preferred.
 *  2. Azure AI Speech (Speech-to-Text) — set AZURE_SPEECH_KEY + AZURE_SPEECH_REGION.
 *     Uses the short-audio REST endpoint. Note the audio content-type must be one
 *     Azure Speech accepts (wav / ogg-opus); webm is passed through as-is.
 */

export function isSpeechConfigured(): boolean {
  return Boolean(
    process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT ||
      (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION)
  );
}

let _client: AzureOpenAI | null = null;
function getTranscribeClient(): AzureOpenAI {
  if (!_client) {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    // Whisper audio needs a reasonably recent api-version; fall back to one that
    // supports the audio endpoint if the chat api-version is older.
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-06-01";
    if (!apiKey || !endpoint) {
      throw new Error("Azure OpenAI is not configured (AZURE_OPENAI_API_KEY / AZURE_OPENAI_ENDPOINT).");
    }
    _client = new AzureOpenAI({ apiKey, endpoint, apiVersion });
  }
  return _client;
}

/**
 * Transcribe an audio buffer to text. `contentType`/`filename` come from the
 * uploaded blob so the provider can decode it. `language` is a BCP-47/ISO hint
 * (e.g. "en", "en-IN"). Returns the recognised text (may be empty for silence).
 */
export async function transcribeAudio(
  audio: Buffer,
  opts: { contentType?: string; filename?: string; language?: string } = {}
): Promise<string> {
  const { contentType = "audio/webm", filename = "audio.webm", language = "en" } = opts;

  // ── Path 1: Azure OpenAI Whisper (preferred) ────────────────────────────────
  const whisperDeployment = process.env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT;
  if (whisperDeployment) {
    const client = getTranscribeClient();
    const file = await toFile(audio, filename, { type: contentType });
    const res = await client.audio.transcriptions.create({
      model: whisperDeployment,
      file,
      // Whisper takes a 2-letter language code; strip any region ("en-IN" → "en").
      language: language.slice(0, 2),
    });
    return (res.text || "").trim();
  }

  // ── Path 2: Azure AI Speech (Speech-to-Text) short-audio REST ───────────────
  const speechKey = process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.AZURE_SPEECH_REGION;
  if (speechKey && speechRegion) {
    // The client sends 16 kHz mono PCM WAV; declare that precise codec so Azure
    // decodes it correctly. ogg-opus is also passed through if that's what came.
    const isWav = /wav/i.test(contentType);
    const azureContentType = isWav
      ? "audio/wav; codecs=audio/pcm; samplerate=16000"
      : contentType;
    const url =
      `https://${speechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
      `?language=${encodeURIComponent(language.includes("-") ? language : "en-IN")}&format=detailed&profanity=raw`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": speechKey,
        "Content-Type": azureContentType,
        Accept: "application/json",
      },
      body: new Uint8Array(audio),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Azure Speech returned ${res.status}.${detail ? ` ${detail.slice(0, 200)}` : ""} ` +
          `Ensure the audio is 16 kHz mono PCM WAV.`
      );
    }
    const data: any = await res.json().catch(() => ({}));
    if (data?.RecognitionStatus && data.RecognitionStatus !== "Success") {
      // e.g. "NoMatch" (silence / unintelligible) — return empty so the UI can
      // prompt a retry rather than surfacing a scary error.
      return "";
    }
    return String(data?.DisplayText || data?.NBest?.[0]?.Display || "").trim();
  }

  throw new Error(
    "Voice-to-text is not configured. Set AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT (recommended) " +
      "or AZURE_SPEECH_KEY + AZURE_SPEECH_REGION."
  );
}
