"use client";

import { ShieldAlert, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUPPORT_EMAIL } from "@/lib/config";

export default function SubscriptionInactivePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Subscription Inactive
          </h1>
          <p className="text-muted-foreground">
            Your organization&apos;s trial has ended or its subscription is no
            longer active. Please contact your administrator to renew access.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={`mailto:${SUPPORT_EMAIL}`}>
            <Mail className="h-4 w-4 mr-2" />
            Contact Support
          </a>
        </Button>
      </div>
    </div>
  );
}
