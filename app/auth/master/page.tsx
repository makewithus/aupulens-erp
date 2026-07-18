"use client";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { SignInForm } from "@/components/auth/SignInForm";

export default function MasterAuthPage() {
  return (
    <AuthLayout>
      <div className="space-y-8 animate-fade-in">
        <AuthHeader
          title="Master Portal"
          subtitle="Global system administration access."
        />
        
        <SignInForm />
      </div>
    </AuthLayout>
  );
}