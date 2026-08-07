"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser speech-to-text hook (Web Speech API) — the same native
 * SpeechRecognition the CRM VoiceNotes uses. Zero server/credentials needed and
 * works offline-of-our-backend. `onFinalText` fires with each finalized phrase
 * (so a chat input can append it); `interim` exposes the in-progress phrase for
 * a live preview.
 *
 * (Azure AI Speech can later replace this with server-side transcription for
 * better accuracy / non-Chromium browsers — swap the start()/stop() internals;
 * the hook's public shape stays the same.)
 */
export function useSpeechToText(opts: { lang?: string; onFinalText?: (text: string) => void } = {}) {
  const { lang = "en-IN", onFinalText } = opts;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<any>(null);
  const onFinalRef = useRef(onFinalText);
  onFinalRef.current = onFinalText;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    setSupported(true);

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (event: any) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          const finalText = res[0].transcript.trim();
          if (finalText) onFinalRef.current?.(finalText);
        } else {
          interimText += res[0].transcript;
        }
      }
      setInterim(interimText);
    };
    rec.onend = () => { setListening(false); setInterim(""); };
    rec.onerror = () => { setListening(false); setInterim(""); };

    recognitionRef.current = rec;
    return () => { try { rec.stop(); } catch { /* noop */ } };
  }, [lang]);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || listening) return;
    try { rec.start(); setListening(true); } catch { /* already started */ }
  }, [listening]);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try { rec.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);

  const toggle = useCallback(() => { listening ? stop() : start(); }, [listening, start, stop]);

  return { supported, listening, interim, start, stop, toggle };
}
