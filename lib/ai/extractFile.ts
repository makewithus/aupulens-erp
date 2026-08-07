/**
 * Extract text from an uploaded attachment for the AI chat.
 *
 * - PDF  → text via pdf-parse
 * - DOCX → text via mammoth
 * - Images (png/jpg/webp/gif) → NOT text-extracted here; the caller passes the
 *   image straight to gpt-4o's vision input instead (see lib/ai/claude.ts).
 *
 * Returns `{ kind: "text", text }` for documents, `{ kind: "image" }` for
 * images (the route forwards the data URL to the model), or `{ kind:
 * "unsupported" }`. Text is truncated so a huge document can't blow the prompt.
 */
export type ExtractResult =
  | { kind: "text"; text: string }
  | { kind: "image" }
  | { kind: "unsupported"; reason: string };

const MAX_CHARS = 12000; // keep the prompt bounded

export const SUPPORTED_ATTACHMENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export async function extractAttachment(buffer: Buffer, mime: string, filename = ""): Promise<ExtractResult> {
  const lower = (mime || "").toLowerCase();

  if (isImageMime(lower)) return { kind: "image" };

  if (lower === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      const text = (result.text || "").trim();
      if (!text) return { kind: "unsupported", reason: "The PDF has no extractable text (it may be a scanned image)." };
      return { kind: "text", text: text.slice(0, MAX_CHARS) };
    } catch (e: any) {
      return { kind: "unsupported", reason: `Could not read the PDF: ${e?.message || "parse error"}.` };
    }
  }

  if (
    lower === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.toLowerCase().endsWith(".docx")
  ) {
    try {
      const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
      const result = await (mammoth as any).extractRawText({ buffer });
      const text = (result.value || "").trim();
      if (!text) return { kind: "unsupported", reason: "The document appears to be empty." };
      return { kind: "text", text: text.slice(0, MAX_CHARS) };
    } catch (e: any) {
      return { kind: "unsupported", reason: `Could not read the document: ${e?.message || "parse error"}.` };
    }
  }

  return { kind: "unsupported", reason: "Unsupported file type. Attach a PDF, Word (.docx), or image." };
}
