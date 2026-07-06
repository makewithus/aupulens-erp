// Default cap applied to every uploadToCloudinary() call site (QA_GAP_REPORT.md
// item #24) — most call sites had no size enforcement at all here (a few had
// their own separate, ad-hoc client-side check before calling this, which
// still apply and simply run first). This upload flow goes directly from the
// browser to Cloudinary (no Next.js API route in between), so there is no
// server we control to add a second, independent check to — Cloudinary's own
// account-level limit is the real backstop on their side; this is the
// client-side guard for our code.
export const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function uploadToCloudinary(
  file: File,
  maxSizeBytes: number = DEFAULT_MAX_UPLOAD_SIZE_BYTES,
): Promise<string> {
  if (file.size > maxSizeBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const limitMb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
    throw new Error(`"${file.name}" is ${sizeMb}MB, which exceeds the ${limitMb}MB upload limit.`);
  }

  const cloudName = process.env.NEXT_PUBLIC_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary configuration is missing in environment variables.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || "Failed to upload file to Cloudinary.");
  }

  const data = await response.json();
  return data.secure_url;
}
