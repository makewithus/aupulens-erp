import { extractAttachment } from "@/lib/ai/extractFile";

/**
 * Split AI-chat attachments from a request body into image data-URLs (forwarded
 * to gpt-4o vision) and extracted document text (PDF/DOCX/TXT/CSV → text). Shared
 * by every module's ai-assistant route so voice + attachments behave identically.
 * Best-effort: an unreadable file is skipped. Caps at 8 attachments.
 */
export async function processChatAttachments(
  body: any
): Promise<{ imageDataUrls: string[]; docTexts: string[] }> {
  const rawAtts: Array<{ name?: string; type: string; dataUrl: string }> =
    Array.isArray(body?.attachments) ? body.attachments : (body?.attachment ? [body.attachment] : []);
  const imageDataUrls: string[] = [];
  const docTexts: string[] = [];
  for (const a of rawAtts.filter((x) => x?.dataUrl && x?.type).slice(0, 8)) {
    if (String(a.type).startsWith("image/")) { imageDataUrls.push(a.dataUrl); continue; }
    try {
      const base64 = a.dataUrl.includes(",") ? a.dataUrl.split(",")[1] : a.dataUrl;
      const extracted = await extractAttachment(Buffer.from(base64, "base64"), a.type, a.name || "");
      if (extracted.kind === "text" && (extracted as any).text) {
        docTexts.push(`=== ${a.name || "document"} ===\n${(extracted as any).text}`);
      }
    } catch {
      /* unreadable file — skip, others may still have content */
    }
  }
  return { imageDataUrls, docTexts };
}

/** Prompt fragment appended when documents/images are attached. */
export function attachmentsPromptBlock(imageDataUrls: string[], docTexts: string[]): string {
  const docsBlock = docTexts.length
    ? `\n\nAttached document content (use it to answer):\n${docTexts.join("\n\n").slice(0, 12000)}`
    : "";
  const imgNote = imageDataUrls.length ? `\n\n(${imageDataUrls.length} image(s) are attached — read them.)` : "";
  return docsBlock + imgNote;
}
