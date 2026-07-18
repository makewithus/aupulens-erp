"use client";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { SignInForm } from "@/components/auth/SignInForm";

export default function AuthPage() {
  return (
    <AuthLayout>
      <div className="space-y-6 animate-fade-in">
        <AuthHeader
          title="Welcome back."
          subtitle="Continue to your workspace."
        />

        <SignInForm />
      </div>
    </AuthLayout>
  );
}