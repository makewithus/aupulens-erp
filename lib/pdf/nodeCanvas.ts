/**
 * pdf.js expects canvas geometry globals when it is bundled by a server
 * framework. pdf-parse normally installs these itself in plain Node, but the
 * bundled Next.js route can bypass that Node-specific initialization.
 */
export async function installPdfCanvasGlobals(): Promise<void> {
  // The canvas implementations intentionally have slightly different TS
  // shapes from the browser DOM declarations, but are runtime-compatible here.
  const globals = globalThis as any;

  if (globals.DOMMatrix && globals.ImageData && globals.Path2D) return;

  const canvas = await import("@napi-rs/canvas");
  globals.DOMMatrix ??= canvas.DOMMatrix;
  globals.ImageData ??= canvas.ImageData;
  globals.Path2D ??= canvas.Path2D;
}
