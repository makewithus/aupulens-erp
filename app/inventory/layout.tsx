"use client";

import React from "react";
import { InventoryRouteDataPrefetcher } from "@/components/inventory/InventoryRouteDataPrefetcher";

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <InventoryRouteDataPrefetcher />
      {children}
    </>
  );
}
