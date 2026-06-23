"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { if (process.env.NODE_ENV === "development") console.error(error); }, [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-destructive/10 p-3">
        <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold">Something went wrong</h2>
      <p className="max-w-xs text-sm text-muted-foreground">An error occurred in this section. Other parts of the app are unaffected.</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => (window.location.href = "/")}>Home</Button>
        <Button size="sm" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
