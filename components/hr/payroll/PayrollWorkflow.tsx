"use client";

interface Step {
  key: string;
  label: string;
}

interface PayrollWorkflowProps {
  currentStep: number;
  steps: Step[];
}

export function PayrollWorkflow({
  currentStep,
  steps,
}: PayrollWorkflowProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center">
        {steps.map((step, index) => {
          const complete = index <= currentStep;

          return (
            <div
              key={step.key}
              className="flex flex-1 items-center"
            >
              <div
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all ${
                  complete
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background"
                }`}
              >
                {complete ? (
                  <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                )}
              </div>

              {index !== steps.length - 1 && (
                <div
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
            className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground/55"
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}