"use client";

import * as React from "react";
import { ToastProvider } from "@/components/ui/toast";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

export default function ToastRoot({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <Toaster />
      <SonnerToaster position="top-right" richColors />
    </ToastProvider>
  );
}
