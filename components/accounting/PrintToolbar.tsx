"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintToolbar() {
  return (
    <Button onClick={() => typeof window !== "undefined" && window.print()}>
      <Printer className="mr-2 h-4 w-4" /> Print / Save as PDF
    </Button>
  );
}
