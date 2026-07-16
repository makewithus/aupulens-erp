"use client";

import { PayrollBatchCard } from "./PayrollBatchCard";

interface PayrollListProps {
  payrolls: any[];
  workflowSteps: any[];
  statusConfig: any;
  nextStatusMap: Record<string, string>;
  nextActionLabels: Record<string, string>;
  getStepIndex: (status: string) => number;
  onView: (payroll: any) => void;
  onContinue: (payroll: any) => void;
  onDelete: (id: string) => void;
}

export function PayrollList({
  payrolls,
  workflowSteps,
  statusConfig,
  nextStatusMap,
  nextActionLabels,
  getStepIndex,
  onView,
  onContinue,
  onDelete,
}: PayrollListProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

      {payrolls.map((payroll) => {

        const currentStep = getStepIndex(payroll.status);

        return (
          <PayrollBatchCard
            key={payroll._id}
            payroll={payroll}
            currentStep={currentStep}
            totalSteps={workflowSteps.length}
            statusLabel={
              statusConfig[payroll.status]?.label ??
              payroll.status
            }
            nextAction={
              nextActionLabels[payroll.status]
            }
            canContinue={Boolean(
              nextStatusMap[payroll.status]
            )}
            canDelete={payroll.status === "draft"}
            onView={() => onView(payroll)}
            onContinue={() => onContinue(payroll)}
            onDelete={() => onDelete(payroll._id)}
          />
        );
      })}
    </div>
  );
}