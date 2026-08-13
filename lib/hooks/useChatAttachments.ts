"use client";

import { useRef, useState } from "react";

export type ChatAttachment = { name: string; type: string; dataUrl: string };

/**
 * Shared attachment logic for the module AI-assistant pages: pick files (up to 8,
 * 8 MB each), paste images/files, read as data URLs, remove, and clear. The UI
 * (attach button, chips) stays per-page for theming; this owns the state + logic
 * so every assistant behaves identically. `onError` surfaces a too-large message
 * via whatever toast the page uses.
 */
export function useChatAttachments(opts?: { onError?: (msg: string) => void }) {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_ATTACHMENTS = 8;

  const addFiles = (files: FileList | File[] | null | undefined) => {
    for (const file of files ? Array.from(files) : []) {
      if (!file) continue;
      if (file.size > MAX_FILE_BYTES) { opts?.onError?.(`"${file.name || "A file"}" is too large (max 8 MB).`); continue; }
      const name = file.name || (file.type.startsWith("image/") ? `pasted-image.${file.type.split("/")[1] || "png"}` : "pasted-file");
      const reader = new FileReader();
      reader.onload = () => setAttachments((prev) => (prev.length >= MAX_ATTACHMENTS ? prev : [...prev, { name, type: file.type, dataUrl: reader.result as string }]));
      reader.readAsDataURL(file);
    }
  };

  const removeAttachment = (i: number) => setAttachments((prev) => prev.filter((_, idx) => idx !== i));

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") { const f = it.getAsFile(); if (f) files.push(f); }
    }
    if (files.length) { e.preventDefault(); addFiles(files); }
  };

  const clear = () => setAttachments([]);

  return { attachments, setAttachments, addFiles, removeAttachment, handlePaste, fileInputRef, clear };
}
