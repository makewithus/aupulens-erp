# VOICE_READINESS — what remains to add voice

Speech produces **text**, and text enters the same pipeline (`lib/ai/language`) → the language layer, normalisation, entity
protection, value-checked numbers, fail-open behaviour, explain/do/ask classifier and guided slot filling all work for voice
with **no changes**. Only the audio edges are missing.

## Already in place
* `SarvamSpeech` interface in `lib/ai/language/sarvam/client.ts` — `transcribe({audio, languageCode?, mimeType?})` and
  `synthesize({text, languageCode, speaker?})`, both returning the same `SarvamResult` (never throws). Today both return
  `not_implemented`.
* `SARVAM_CALL_TYPE.ASR` / `TTS` exist, so metering, cost rates (`AiCostRate` rows `sarvam-asr`, `sarvam-tts`) and the
  provider split on the dashboards need no schema work.
* The repo already has Azure speech-to-text (`lib/ai/speechToText.ts`, `AZURE_SPEECH_*`) — a working reference for the
  browser capture → upload → text flow and for how the assistant UIs consume a transcript.

## What remains (scoped, in build order)
1. **ASR client** (½ day). Implement `transcribe` against Sarvam's speech-to-text endpoint (verify the current model name and
   limits on the dashboard — not guessed here); accept `audio/webm`/`ogg`/`wav`; enforce a max duration/size; same timeout +
   single-retry + fail-open contract. Add an `/api/ai/transcribe` route mirroring the existing speech route (auth, tenant AI
   gates, metering). Mock in tests.
2. **Capture UI** (1 day). A mic button in `AiSidebar` and the seven assistant pages using `MediaRecorder`; press-and-hold or
   tap-to-toggle; visible recording/processing/error states; the transcript is **placed in the input box for the user to send
   or edit** (never auto-sent — same "never act on a guess" rule). Show the original transcript, never the normalised copy.
3. **Permissions** (¼ day). `getUserMedia` denial and "no microphone" paths with a clear message and a typed fallback;
   HTTPS-only note for non-localhost; per-tenant switch (reuse `settings.ai` — e.g. `voiceDisabled`).
4. **Streaming** (optional, 1–2 days). Chunked/streaming ASR for live captions; not needed for a v1 that records then sends.
5. **TTS playback** (1 day). `synthesize` + an audio player on assistant replies, language taken from the pipeline's
   `detectedLanguage`; cache by `(language, text-hash)` like `respond.ts`'s reply cache; never speak protected entities
   in a translated voice (read numbers/ids as-is); a mute preference stored per user.
6. **Voice-specific normalisation** (½ day). Spoken numbers ("पैंतालीस हज़ार", "forty five thousand rupees") are already
   handled by value-checked number normalisation; add a live test pass with real transcripts — ASR punctuation is sparse, so
   re-check the comma-splitting in `taskFlow/engine.ts` multi-answer parsing against unpunctuated transcripts.
7. **Live QA on real audio** in all 11 languages; accent/noise checks; confirm the 2 s timeout is right for audio upload
   (probably needs its own `SARVAM_ASR_TIMEOUT_MS`).

Estimated total for a usable v1 (record → transcript → existing flow, plus TTS on replies): **≈ 4–5 engineering days**.
