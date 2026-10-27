"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { moduleDenialMessage } from "@/lib/entitlements/moduleDenialMessage";

function UnauthorizedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const moduleName = searchParams.get("module") || "this module";
  const tier = searchParams.get("tier") || "your current plan";
  const reason = searchParams.get("reason");
  const message = moduleDenialMessage(moduleName, tier, reason);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <section className="max-w-lg rounded-lg border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Module unavailable</h1>
        <p className="mt-3 text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Go back
        </button>
      </section>
    </div>
  );
}

export default function UnauthorizedPage() {
  return (
    <Suspense>
      <UnauthorizedContent />
    </Suspense>
  );
}
