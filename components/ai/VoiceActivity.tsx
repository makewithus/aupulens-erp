"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function VoiceActivity({ listening, transcribing, levels = [], className }: {
  listening: boolean;
  transcribing: boolean;
  levels?: number[];
  className?: string;
}) {
  if (!listening && !transcribing) return null;
  return (
    <div role="status" className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      {listening ? (
        <span aria-hidden="true" className="inline-flex h-6 items-center gap-[3px] text-foreground/75">
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} className="w-[2px] rounded-full bg-current transition-[height] duration-100 motion-reduce:transition-none"
              style={{ height: `${2 + Math.min(1, Math.max(0, levels[i] || 0)) * 22}px` }} />
          ))}
        </span>
      ) : <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
      <span>{listening ? "Listening…" : "Transcribing…"}</span>
    </div>
  );
}
