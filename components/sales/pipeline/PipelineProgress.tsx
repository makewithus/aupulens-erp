import {
  Q2C_FLOW_STEPS,
  Q2C_STATUS_LABELS,
  type Q2CStatus,
} from "@/lib/constants/statuses";

interface PipelineProgressProps {
  currentStage: Q2CStatus;
}

export function PipelineProgress({ currentStage }: PipelineProgressProps) {
  const currentIdx = Q2C_FLOW_STEPS.indexOf(currentStage);

  return (
    <div className="flex items-center gap-1 mb-2">
      {Q2C_FLOW_STEPS.map((s, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-none ${
              isCompleted
                ? "bg-[#8AE06C]" // Brand Green
                : isCurrent
                  ? "bg-[#6CADF5]" // Brand Blue
                  : "bg-muted-foreground/20"
            }`}
            title={Q2C_STATUS_LABELS[s]}
          />
        );
      })}
    </div>
  );
}

