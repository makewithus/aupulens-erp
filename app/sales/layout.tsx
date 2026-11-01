"use client";

import React from "react";
import { SalesRouteDataPrefetcher } from "@/components/sales/SalesRouteDataPrefetcher";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SalesRouteDataPrefetcher />
      {children}
    </>
  );
}
