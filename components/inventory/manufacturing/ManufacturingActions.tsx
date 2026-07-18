"use client";

import { ArrowRight, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ManufacturingActionsProps {
  showContinue: boolean;
  continueLabel?: string;

  onView: () => void;
  onContinue: () => void;
}

export function ManufacturingActions({
  showContinue,
  continueLabel,
  onView,
  onContinue,
}: ManufacturingActionsProps) {
  return (
    <div className="flex items-center justify-between border-t border-border/40 pt-6">
      <Button
        variant="ghost"
        onClick={onView}
        className="rounded-none px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
      >
        <Eye className="mr-2 h-4 w-4" />
        Details
      </Button>

      {showContinue && (
        <Button
          onClick={onContinue}
          className="rounded-none border border-secondary bg-tertiary px-6 text-primary transition-all hover:bg-muted"
        >
          {continueLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}