"use client";

import { Logo } from "@/components/Logo";

/**
 * Neutral full-screen splash shown while auth is being confirmed or while an
 * unauthenticated/unauthorized user is being redirected to login. Deliberately
 * NOT the dashboard chrome (no sidebar/header) so a broken or expired session
 * never flashes "the dashboard" before bouncing to login.
 */
export function AuthSplash({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background">
      <Logo width={140} height={36} priority className="h-9 w-auto object-contain opacity-90" />
      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/40 border-t-transparent animate-spin" />
      {message ? <p className="text-xs font-mono text-muted-foreground/60">{message}</p> : null}
    </div>
  );
}

export default AuthSplash;
