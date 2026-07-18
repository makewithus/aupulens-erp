"use client";

interface ManufacturingWorkflowProps {
  currentStep: number;
  steps: {
    key: string;
    label: string;
  }[];
}

export function ManufacturingWorkflow({
  currentStep,
  steps,
}: ManufacturingWorkflowProps) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {steps.map((step, index) => {
          const complete = index <= currentStep;

          return (
            <div
              key={step.key}
              className="flex flex-1 items-center gap-2"
            >
              <div
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  complete
                    ? "bg-primary"
                    : "bg-border"
                }`}
              />

              {index !== steps.length - 1 && (
                <div
                  className={`h-[2px] flex-1 transition-colors ${
                    complete
                      ? "bg-primary"
                      : "bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex justify-between">
        {steps.map((step) => (
          <span
            key={step.key}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/45"
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}