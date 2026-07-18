"use client";

import { Check } from "lucide-react";

interface OnboardingProgressProps {
  currentStep: number;
}

const STEPS = [
  { number: "01", label: "Account" },
  { number: "02", label: "Organization" },
  { number: "03", label: "Business" },
];

export function OnboardingProgress({ currentStep }: OnboardingProgressProps) {
  return (
    <div className="flex items-center justify-between w-full font-mono text-[10px] tracking-wider uppercase border-y border-border/40 py-3 my-2 select-none">
      {STEPS.map((s, idx) => {
        const stepNum = idx + 1;
        const isCompleted = stepNum < currentStep;
        const isActive = stepNum === currentStep;

        return (
          <div key={s.number} className="flex items-center gap-1.5">
            <div className="flex items-center gap-1">
              {isCompleted ? (
                <Check className="h-3 w-3 text-foreground stroke-[3]" />
              ) : (
                <span className={isActive ? "text-foreground font-bold" : "text-muted-foreground/40"}>
                  {s.number}
                </span>
              )}
              <span className={isActive ? "text-foreground font-bold" : "text-muted-foreground/60"}>
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
