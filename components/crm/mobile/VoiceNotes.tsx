'use client';

import { Mic, Square, Save, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { OfflineQueue } from "@/lib/crm/mobile/offlineQueue";

interface VoiceNotesProps {
  onComplete: () => void;
  /** Optional record to link the note to. Without it the note is saved as an unlinked general note. */
  recordId?: string;
  recordType?: string;
}

/**
 * Real client-side voice transcription (no server model needed) — replaces
 * the previous hardcoded "Voice note transcribed (Pending API integration)"
 * placeholder. Uses the browser's native SpeechRecognition (the same pattern
 * as components/dashboard/CommandCenterInput) alongside the audio recording,
 * and saves the actual transcript (editable before save).
 */
export default function VoiceNotes({ onComplete, recordId, recordType = "Lead" }: VoiceNotesProps) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [speechSupported, setSpeechSupported] = useState(true);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (event: any) => {
        let finalText = "";
        for (let i = 0; i < event.results.length; i++) {
          finalText += event.results[i][0].transcript;
        }
        setTranscript(finalText);
      };
      rec.onerror = (event: any) => {
        // 'no-speech'/'aborted' are normal; only surface real failures.
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.error("Speech recognition error", event.error);
        }
      };
      recognitionRef.current = rec;
    } else {
      setSpeechSupported(false);
    }
    return () => {
      try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];
      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };
      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        setAudioUrl(URL.createObjectURL(audioBlob));
        audioChunks.current = [];
      };
      mediaRecorder.current.start();
      setTranscript("");
      try { recognitionRef.current?.start(); } catch { /* transcription is best-effort */ }
      setRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(t => t.stop());
    }
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    setRecording(false);
  };

  const handleSave = () => {
    if (!audioUrl) return;
    const message = transcript.trim() || "(Voice note — no speech could be transcribed)";
    OfflineQueue.enqueue({
      url: "/api/crm/communications",
      method: "POST",
      payload: {
        ...(recordId ? { recordId, recordType } : {}),
        channel: "Meeting Note",
        direction: "internal",
        message,
        attachments: [audioUrl],
      },
      type: "Activity"
    });
    toast.success("Voice note saved");
    onComplete();
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-8 py-10">
      <h2 className="text-xl font-bold">Record Voice Note</h2>

      {!speechSupported && (
        <p className="text-xs text-amber-400 text-center max-w-xs">
          Live transcription isn&apos;t supported in this browser — the recording will still be saved, without a transcript.
        </p>
      )}

      {!audioUrl ? (
        <div className="flex flex-col items-center gap-4">
          <button
            className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
              recording ? 'bg-red-500/20 border-4 border-red-500 animate-pulse' : 'bg-accent border-4 border-border'
            }`}
            onClick={recording ? stopRecording : startRecording}
          >
            {recording ? <Square className="w-12 h-12 text-red-500 fill-current" /> : <Mic className="w-12 h-12 text-muted-foreground" />}
          </button>
          <p className="text-sm text-muted-foreground">{recording ? "Tap to stop..." : "Tap to start recording"}</p>
          {recording && transcript && (
            <p className="text-sm text-foreground max-w-xs text-center italic">&ldquo;{transcript}&rdquo;</p>
          )}
        </div>
      ) : (
        <div className="w-full flex flex-col items-center space-y-6">
          <audio src={audioUrl} controls className="w-full max-w-[250px]" />
          <div className="w-full max-w-[300px]">
            <label className="text-xs text-muted-foreground">Transcript (editable)</label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={3}
              placeholder="Transcript will appear here…"
              className="w-full mt-1 bg-card border border-border rounded p-2 text-sm text-foreground"
            />
          </div>
          <div className="flex gap-4 w-full px-4">
            <Button variant="outline" className="flex-1 border-red-900/50 text-red-400" onClick={() => { setAudioUrl(null); setTranscript(""); }}>
              <Trash2 className="w-4 h-4 mr-2" /> Discard
            </Button>
            <Button className="flex-1 bg-primary text-primary-foreground" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" /> Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
