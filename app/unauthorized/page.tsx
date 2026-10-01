"use client";

import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function UnauthorizedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const moduleName = searchParams.get("module") || "this module";
  const tier = searchParams.get("tier") || "your current plan";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Access Denied
          </h1>
          <p className="text-muted-foreground">
            The <span className="font-semibold text-foreground capitalize">{moduleName}</span> module is not available on {tier === "your current plan" ? tier : <><span className="font-semibold text-foreground capitalize">{tier}</span> plan</>}.
            <br />
            <br />
            If you believe this is an error, please contact your administrator or upgrade your subscription.
          </p>
        </div>
        <Button onClick={() => router.push("/")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
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
