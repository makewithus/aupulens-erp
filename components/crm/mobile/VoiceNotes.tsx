'use client';

import { Mic, Square, Save, Trash2 } from "lucide-react";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { OfflineQueue } from "@/lib/crm/mobile/offlineQueue";

export default function VoiceNotes({ onComplete }: { onComplete: () => void }) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };
      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        audioChunks.current = [];
      };
      mediaRecorder.current.start();
      setRecording(true);
    } catch (err) {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(t => t.stop());
      setRecording(false);
    }
  };

  const handleSave = () => {
    if (!audioUrl) return;
    // In reality, upload Blob to S3/Cloudinary first, get URL, then save
    OfflineQueue.enqueue({
      url: "/api/crm/communications",
      method: "POST",
      payload: {
        recordId: "mock_id",
        recordType: "Lead",
        channel: "Meeting Note",
        direction: "internal",
        message: "Voice note transcribed (Pending API integration)",
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
      
      {!audioUrl ? (
        <div className="flex flex-col items-center gap-4">
          <button 
            className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
              recording ? 'bg-red-500/20 border-4 border-red-500 animate-pulse' : 'bg-neutral-800 border-4 border-neutral-700'
            }`}
            onClick={recording ? stopRecording : startRecording}
          >
            {recording ? <Square className="w-12 h-12 text-red-500 fill-current" /> : <Mic className="w-12 h-12 text-neutral-400" />}
          </button>
          <p className="text-sm text-neutral-400">{recording ? "Tap to stop..." : "Tap to start recording"}</p>
        </div>
      ) : (
        <div className="w-full flex flex-col items-center space-y-6">
          <audio src={audioUrl} controls className="w-full max-w-[250px]" />
          <div className="flex gap-4 w-full px-4">
            <Button variant="outline" className="flex-1 border-red-900/50 text-red-400" onClick={() => setAudioUrl(null)}>
              <Trash2 className="w-4 h-4 mr-2" /> Discard
            </Button>
            <Button className="flex-1 bg-primary text-white" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" /> Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
