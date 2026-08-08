/**
 * Text/image extraction from an uploaded document.
 *
 * - PDF (with a text layer) → pdf-parse
 * - DOCX → mammoth
 * - TXT/CSV → raw UTF-8
 * - PNG/JPG/WEBP → returned as a data URL for the vision model (real OCR)
 *
 * For a scanned (image-only) PDF, pdf-parse returns little/no text; we surface
 * that honestly so the user can upload an image page instead, rather than
 * silently feeding an empty string to the LLM.
 */

const IMAGE_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export interface ExtractedContent {
  /** Plain text when available (PDF/DOCX/TXT). */
  text: string;
  /** data: URL when the source is an image — sent to the vision model. */
  imageDataUrl?: string;
  kind: "text" | "image";
}

const ALLOWED = ["pdf", "docx", "txt", "csv", ...Object.keys(IMAGE_EXT)];

export function validateDocument(fileName: string): string | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED.includes(ext)) {
    return `Unsupported document. Allowed: ${ALLOWED.map((e) => "." + e).join(", ")}.`;
  }
  return null;
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return (result?.text ?? "").trim();
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return (result?.value ?? "").trim();
}

export async function extractContent(fileName: string, buffer: Buffer): Promise<ExtractedContent> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (ext in IMAGE_EXT) {
    const dataUrl = `data:${IMAGE_EXT[ext]};base64,${buffer.toString("base64")}`;
    return { text: "", imageDataUrl: dataUrl, kind: "image" };
  }

  if (ext === "pdf") {
    const text = await extractPdf(buffer);
    if (text.length < 20) {
      throw new Error(
        "This PDF has little or no selectable text (it may be a scan). Upload an image (PNG/JPG) of the page so it can be read with vision OCR.",
      );
    }
    return { text, kind: "text" };
  }

  if (ext === "docx") return { text: await extractDocx(buffer), kind: "text" };

  if (ext === "txt" || ext === "csv") return { text: buffer.toString("utf-8").trim(), kind: "text" };

  throw new Error("Unsupported document type.");
}
