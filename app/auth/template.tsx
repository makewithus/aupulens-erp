"use client";

import { useEffect } from "react";
import { clearAllStores } from "@/store/authStore";

export default function AuthTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Clear all stores, localStorage, and session data when entering any auth page
    clearAllStores();
  }, []);

  return <>{children}</>;
}
