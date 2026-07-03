"use client";

import { ArrowRight, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ReceiptActionsProps {
  showContinue: boolean;
  continueLabel?: string;
  onView: () => void;
  onContinue: () => void;
}

export function TransferActions({
  showContinue,
  continueLabel,
  onView,
  onContinue,
}: ReceiptActionsProps) {
  return (
    <div className="flex items-center justify-between border-t border-border/40 pt-6">
      <Button
        variant="ghost"
        onClick={onView}
        className="h-10 rounded-none px-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
      >
        <Eye className="mr-2 h-4 w-4" />
        View
      </Button>

      {showContinue && (
        <Button
          onClick={onContinue}
          className="none-xl h-10 border border-secondary bg-tertiary px-5 text-primary transition-all hover:bg-muted"
        >
          {continueLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}