"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error(error);
    }
    toast.error("Something went wrong. Please try again.");
    // Go back or go to home to avoid getting stuck on an error page
    router.back();
  }, [error, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <p className="text-muted-foreground animate-pulse">Redirecting...</p>
    </div>
  );
}
