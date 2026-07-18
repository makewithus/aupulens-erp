"use client";

import { Eye, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PayrollActionsProps {
  showContinue: boolean;
  continueLabel?: string;
  canDelete: boolean;
  onView: () => void;
  onContinue?: () => void;
  onDelete?: () => void;
}

export function PayrollActions({
  showContinue,
  continueLabel,
  canDelete,
  onView,
  onContinue,
  onDelete,
}: PayrollActionsProps) {
  return (
<div className="flex items-center justify-between border-t border-border/40">
  <Button
    variant="ghost"
    onClick={onView}
    className="h-10 rounded-none px-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
  >
    <Eye className="mr-2 h-4 w-4" />
    Details
  </Button>

  <div className="flex items-center gap-2">
    {showContinue && (
      <Button
        onClick={onContinue}
        className="none-xl h-10 border border-secondary bg-tertiary px-5 text-primary transition-all hover:bg-muted"
      >
        {continueLabel}
        <Play className="ml-2 h-4 w-4" />
      </Button>
    )}

    {canDelete && (
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 rounded-none text-destructive hover:bg-transparent"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    )}
  </div>
</div>
  );
}