import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ModularModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /**
   * When true, a click outside the modal (or Escape) is ignored instead of
   * closing it — for forms with real unsaved input, where a stray click
   * (including one that lands on a nested Select/Popover portal, which Radix
   * treats as "outside" the Dialog) must never silently discard the user's
   * work. Defaults to false to preserve existing dismiss-on-outside-click
   * behavior for simple/confirmation modals.
   */
  preventOutsideClose?: boolean;
}

export function ModularModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  contentClassName,
  preventOutsideClose = false,
}: ModularModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onInteractOutside={(e) => { if (preventOutsideClose) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (preventOutsideClose) e.preventDefault(); }}
        className={cn(
          "p-0 overflow-hidden flex flex-col gap-0 border-border bg-card max-w-[80vw] w-full",
          className,
        )}
      >
        <div className="p-6 border-b border-border/40 shrink-0">
          <DialogHeader className="text-left">
            <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
            {description && (
              <DialogDescription className="text-muted-foreground">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>
        </div>

        <div
          className={cn(
            "flex-1 overflow-y-auto p-6 youtube-scrollbar",
            contentClassName,
          )}
        >
          {children}
        </div>

        {footer && (
          <DialogFooter className="p-4 border-t border-border/40 bg-card shrink-0 sm:justify-between items-center gap-2">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
