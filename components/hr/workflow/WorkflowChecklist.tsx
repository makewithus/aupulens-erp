"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

interface WorkflowChecklistProps {
  items: string[];
  checks: boolean[];
  onToggle: (index: number) => void;
}

export function WorkflowChecklist({
  items,
  checks,
  onToggle,
}: WorkflowChecklistProps) {
  const completed = items.filter((_, i) => checks[i]);
  const remaining = items.filter((_, i) => !checks[i]);

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h4 className="font-mono text-[11px] text-muted-foreground/45">
            Completed
          </h4>
        </div>

        <div className="space-y-2">
          {completed.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing completed yet.
            </p>
          ) : (
            completed.map((task) => {
              const index = items.indexOf(task);

              return (
                <motion.button
                  key={task}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onToggle(index)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/30"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </div>

                  <span className="text-sm">{task}</span>
                </motion.button>
              );
            })
          )}
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h4 className="font-mono text-[11px] text-muted-foreground/45">
            Remaining
          </h4>
        </div>

        <div className="space-y-2">
          {remaining.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All tasks completed.
            </p>
          ) : (
            remaining.map((task) => {
              const index = items.indexOf(task);

              return (
                <motion.button
                  key={task}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onToggle(index)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/30"
                >
                  <div className="h-5 w-5 rounded-full border border-border" />

                  <span className="text-sm text-muted-foreground">
                    {task}
                  </span>
                </motion.button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}