"use client";

import { Card, CardContent } from "@/components/ui/card";

import { TransferWorkflow } from "./TransferWorkflow";
import { TransferActions } from "./TransferActions";

interface TransferCardProps {
  reference: string;

  partnerLabel: string;
  partnerName: string;

  scheduledDate: string;

  statusLabel: string;

  workflowSteps: {
    key: string;
    label: string;
  }[];

  currentStep: number;

  nextAction?: string;

  canContinue: boolean;

  onView: () => void;
  onContinue: () => void;
}

export function TransferCard({
  reference,
  partnerLabel,
  partnerName,
  scheduledDate,
  statusLabel,
  workflowSteps,
  currentStep,
  nextAction,
  canContinue,
  onView,
  onContinue,
}: TransferCardProps) {
  return (
    <Card className="group overflow-hidden border-border/40 shadow-none transition-colors hover:bg-muted/20">
      <CardContent className="space-y-6 p-6">
        {/* Header */}

        <div className="flex items-start justify-between gap-8">
          <div>
            <h2 className="text-[28px] font-medium tracking-[-0.04em] transition-opacity duration-500 group-hover:opacity-80">
              {reference}
            </h2>
          </div>

          <div className="text-right">

            <p className="mt-1 text-sm font-medium tracking-wide">
              {statusLabel}
            </p>
          </div>
        </div>

        {/* Workflow */}

        <TransferWorkflow
          currentStep={currentStep}
          steps={workflowSteps}
        />

        {/* Meta */}

        <div className="grid grid-cols-2 gap-10">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/45">
              {partnerLabel}
            </p>

            <p className="mt-2 text-lg font-medium truncate">
              {partnerName}
            </p>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/45">
              Scheduled
            </p>

            <p className="mt-2 text-lg font-medium">
              {new Date(scheduledDate).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Footer */}

        <TransferActions
          showContinue={canContinue}
          continueLabel={nextAction}
          onView={onView}
          onContinue={onContinue}
        />
      </CardContent>
    </Card>
  );
}