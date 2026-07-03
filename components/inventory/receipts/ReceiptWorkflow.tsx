"use client";

import { motion } from "framer-motion";

interface Step {
  key: string;
  label: string;
}

interface ReceiptWorkflowProps {
  currentStep: number;
  steps: Step[];
}

export function ReceiptWorkflow({
  currentStep,
  steps,
}: ReceiptWorkflowProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center">
        {steps.map((step, index) => {
          const completed = index < currentStep;
          const current = index === currentStep;

          return (
            <div
              key={step.key}
              className="flex flex-1 items-center"
            >
              <motion.div
                layout
                className={`
                  relative z-10
                  h-3.5 w-3.5 rounded-full border
                  transition-all duration-300
                  ${
                    completed
                      ? "border-primary bg-primary"
                      : current
                        ? "border-primary bg-background ring-2 ring-primary/30"
                        : "border-border bg-background"
                  }
                `}
              />

              {index !== steps.length - 1 && (
                <motion.div
                  layout
                  className={`h-px flex-1 ${
                    index < currentStep
                      ? "bg-primary"
                      : "bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between">
        {steps.map((step) => (
          <span
            key={step.key}
            className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/45"
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}