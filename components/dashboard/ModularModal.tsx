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
}: ModularModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 overflow-hidden flex flex-col gap-0 border-border bg-[#161616] max-w-[80vw] w-full",
          className,
        )}
      >
        <div className="p-6 border-b shrink-0">
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
          <DialogFooter className="p-4 border-t bg-muted/10 shrink-0 sm:justify-between items-center gap-2">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
