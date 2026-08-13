"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startWavRecording, isWavRecordingSupported, type ActiveRecording } from "@/lib/audio/wavRecorder";

/**
 * Voice-to-text hook backed by Azure (server-side transcription).
 *
 * Records the mic as 16 kHz mono PCM WAV (see lib/audio/wavRecorder.ts) — the
 * exact format Azure AI Speech accepts and the highest-accuracy input — then
 * POSTs it to /api/ai/transcribe, which runs Azure speech-to-text. Works in
 * every modern browser AND in the Electron desktop app, unlike the old browser
 * Web Speech API (which silently failed in Electron / Firefox).
 *
 * Public shape kept compatible with the previous hook: `supported`, `listening`
 * (recording), `interim` (status hint), `start`/`stop`/`toggle`. `transcribing`
 * is true while the server works. `onFinalText` fires once with the recognised
 * text when transcription returns.
 */
export function useSpeechToText(opts: {
  lang?: string;
  onFinalText?: (text: string) => void;
  onError?: (message: string) => void;
} = {}) {
  const { lang = "en-IN", onFinalText, onError } = opts;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [interim, setInterim] = useState("");

  const recordingRef = useRef<ActiveRecording | null>(null);
  const onFinalRef = useRef(onFinalText);
  const onErrorRef = useRef(onError);
  onFinalRef.current = onFinalText;
  onErrorRef.current = onError;

  useEffect(() => {
    setSupported(isWavRecordingSupported());
  }, []);

  const start = useCallback(async () => {
    if (listening || transcribing) return;
    try {
      recordingRef.current = await startWavRecording();
      setListening(true);
      setInterim("Listening…");
    } catch (err: any) {
      recordingRef.current = null;
      setListening(false);
      setInterim("");
      // Only call it a permission problem when the browser actually denied it —
      // otherwise a granted mic would wrongly show "blocked". getUserMedia shows
      // the browser's allow/deny prompt itself when permission isn't set yet.
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
        onErrorRef.current?.("Microphone permission was denied. Click the lock icon in the address bar → allow Microphone, then try again.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        onErrorRef.current?.("No microphone was found on this device.");
      } else if (name === "NotReadableError") {
        onErrorRef.current?.("Your microphone is in use by another app. Close it and try again.");
      } else {
        onErrorRef.current?.("Couldn't start the microphone. Please try again.");
      }
    }
  }, [listening, transcribing]);

  const stop = useCallback(async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) return;
    setListening(false);
    let blob: Blob;
    try {
      blob = await rec.stop();
    } catch {
      setInterim("");
      onErrorRef.current?.("Couldn't capture the audio. Please try again.");
      return;
    }
    if (!blob || blob.size <= 44) { // 44 bytes = empty WAV header only
      setInterim("");
      onErrorRef.current?.("I didn't catch that — please try again.");
      return;
    }
    setTranscribing(true);
    setInterim("Transcribing…");
    try {
      const fd = new FormData();
      fd.append("audio", blob, "speech.wav");
      fd.append("language", lang);
      const res = await fetch("/api/ai/transcribe", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const text = String(data.text || "").trim();
        if (text) onFinalRef.current?.(text);
        else onErrorRef.current?.("I didn't catch that — please try again.");
      } else {
        onErrorRef.current?.(data.message || "Couldn't transcribe the audio.");
      }
    } catch {
      onErrorRef.current?.("Couldn't reach the transcription service.");
    } finally {
      setTranscribing(false);
      setInterim("");
    }
  }, [lang]);

  const toggle = useCallback(() => {
    if (listening) void stop();
    else void start();
  }, [listening, start, stop]);

  // Release the mic if the component unmounts mid-recording.
  useEffect(() => () => { recordingRef.current?.cancel(); recordingRef.current = null; }, []);

  return { supported, listening, transcribing, interim, start, stop, toggle };
}
