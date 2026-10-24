"use client";

import * as React from "react";
import { ToastProvider } from "@/components/ui/toast";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { friendlyError, isAbortError } from "@/lib/errors/friendlyError";

// App-wide safety net: every toast.error(...) in the app passes through
// friendlyError so raw backend text (Mongoose paths, BSON casts, driver
// errors, "Internal server error") is replaced with a plain-language message.
// Patched once, at module load, on the shared sonner instance.
const patched = toast as typeof toast & { __friendly?: boolean };
if (typeof window !== "undefined" && !patched.__friendly) {
  const original = toast.error.bind(toast);
  patched.error = ((message: any, data?: any) => {
    if (isAbortError(message) || (data && isAbortError(data))) {
      return;
    }
    const raw = typeof message === "string" ? message : message?.message || message;
    const friendly = friendlyError(raw);
    if (!friendly) return;
    return original(friendly, data);
  }) as typeof toast.error;
  patched.__friendly = true;
}

export default function ToastRoot({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <Toaster />
      <SonnerToaster position="top-right" richColors />
    </ToastProvider>
  );
}
