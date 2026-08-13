"use client";

import { Paperclip, X } from "lucide-react";
import type { ChatAttachment } from "@/lib/hooks/useChatAttachments";

/**
 * Renders the row of removable attachment chips plus the hidden file input for a
 * module AI-assistant. Shared so every assistant looks/behaves the same. The
 * attach *button* stays inline in each page (its position varies with the mic /
 * send layout); it just calls `fileInputRef.current?.click()`.
 */
export function ChatAttachmentBar({
  attachments,
  removeAttachment,
  fileInputRef,
  addFiles,
}: {
  attachments: ChatAttachment[];
  removeAttachment: (i: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  addFiles: (files: FileList | File[] | null | undefined) => void;
}) {
  return (
    <>
      {attachments.length > 0 && (
        <div className="mb-2 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
          {attachments.map((att, i) => (
            <span
              key={i}
              title={att.name}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-muted text-[11px] text-foreground/80 shrink-0 max-w-40"
            >
              <Paperclip className="w-3 h-3 shrink-0 text-primary" />
              <span className="truncate">{att.name}</span>
              <button type="button" onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-red-400 shrink-0">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt,.csv"
        className="hidden"
        onChange={(e) => { addFiles(e.target.files); if (e.target) e.target.value = ""; }}
      />
    </>
  );
}
