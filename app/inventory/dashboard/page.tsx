"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Logo } from "@/components/Logo";

export default function InventoryDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/inventory");
    } else if (status === "authenticated") {
      if (
        session?.user?.role !== "inventory" &&
        session?.user?.role !== "admin"
      ) {
        router.push("/auth/inventory");
      } else {
        router.push("/inventory/summary");
      }
    }
  }, [status, router, session]);
  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center justify-center">
        <Logo
          width={250}
          height={250}
          className="opacity-20 animate-pulse"
        />
        <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
