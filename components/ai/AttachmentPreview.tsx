"use client";

import { X, Download, FileText } from "lucide-react";

/**
 * Click-to-preview modal for an attached file in the AI assistant input.
 * Images render inline, PDFs render in an embedded viewer, and anything else
 * shows its name with a download link. Fully self-contained + theme-aware.
 */
export function AttachmentPreview({
  attachment,
  onClose,
}: {
  attachment: { name: string; type: string; dataUrl: string };
  onClose: () => void;
}) {
  const isImage = attachment.type.startsWith("image/");
  const isPdf = attachment.type.includes("pdf") || attachment.name.toLowerCase().endsWith(".pdf");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-lg border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 shrink-0">
          <FileText className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-foreground truncate flex-1" title={attachment.name}>{attachment.name}</span>
          <a
            href={attachment.dataUrl}
            download={attachment.name}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Download"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto bg-muted/30 flex items-center justify-center p-4">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attachment.dataUrl} alt={attachment.name} className="max-w-full max-h-[70vh] object-contain rounded" />
          ) : isPdf ? (
            <iframe src={attachment.dataUrl} title={attachment.name} className="w-full h-[70vh] rounded border border-border bg-white" />
          ) : (
            <div className="text-center py-10">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-foreground font-medium">{attachment.name}</p>
              <p className="text-xs text-muted-foreground mt-1">Inline preview isn&apos;t available for this file type.</p>
              <a
                href={attachment.dataUrl}
                download={attachment.name}
                className="inline-flex items-center gap-1.5 mt-4 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="h-4 w-4" /> Download to view
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AttachmentPreview;
