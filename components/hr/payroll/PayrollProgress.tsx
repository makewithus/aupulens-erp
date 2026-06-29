"use client";

import { motion } from "framer-motion";

interface PayrollProgressProps {
  current: number;
  total: number;
}

export function PayrollProgress({
  current,
  total,
}: PayrollProgressProps) {
  const progress = (current / total) * 100;

  return (
    <div className="w-60">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground/45">
          Workflow
        </span>

        <span className="text-sm font-medium">
          {current}/{total}
        </span>
      </div>

      <div className="h-[3px] overflow-hidden bg-border/40">
        <motion.div
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4 }}
          className="h-full bg-primary"
        />
      </div>

      <p className="mt-2 text-right font-mono text-[10px] text-muted-foreground/45">
        {Math.round(progress)}% Complete
      </p>
    </div>
  );
}