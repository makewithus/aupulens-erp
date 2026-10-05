"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

function UnauthorizedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const moduleName = searchParams.get("module") || "this module";
  const tier = searchParams.get("tier") || "your current plan";

  useEffect(() => {
    toast.error(`The ${moduleName} module is not available on ${tier === "your current plan" ? tier : `your ${tier} plan`}.`);
    // Go back to the previous page
    router.back();
  }, [moduleName, tier, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <p className="text-muted-foreground animate-pulse">Redirecting...</p>
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
