"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ShimmerSkeleton } from "@/components/ui/loading-skeletons";

export default function Home() {
  const router = useRouter();

  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "authenticated") {
      const role = session?.user?.role;
      if (role === "master-admin") router.push("/master-admin");
      else if (role === "admin") router.push("/admin/dashboard");
      else if (role === "finance") router.push("/finance/summary");
      else if (role === "sales") router.push("/sales/summary");
      else if (role === "inventory") router.push("/inventory/dashboard");
      else if (role === "manufacturing")
        router.push("/manufacturing/dashboard");
      else router.push("/auth");
    } else if (status === "unauthenticated") {
      router.push("/auth");
    }
  }, [status, session, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="space-y-4 w-full max-w-md px-6">
        <ShimmerSkeleton className="h-12 w-3/4 mx-auto" />
        <ShimmerSkeleton className="h-10 w-1/2 mx-auto" />
        <div className="grid grid-cols-2 gap-4 mt-6">
          <ShimmerSkeleton className="h-24" />
          <ShimmerSkeleton className="h-24" />
        </div>
      </div>
    </div>
  );
}
