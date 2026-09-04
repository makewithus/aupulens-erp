"use client";

import { Card, CardContent } from "@/components/ui/card";

import { ManufacturingWorkflow } from "./ManufacturingWorkflow";
import { ManufacturingActions } from "./ManufacturingActions";

interface ManufacturingCardProps {
  reference: string;
  product: string;
  quantity: number;
  statusLabel: string;

  reworkCount?: number;

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

export function ManufacturingCard({
  reference,
  product,
  quantity,
  statusLabel,
  reworkCount = 0,
  workflowSteps,
  currentStep,
  nextAction,
  canContinue,
  onView,
  onContinue,
}: ManufacturingCardProps) {
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
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/45">
              Status
            </p>

            <p className="mt-1 text-sm font-medium uppercase tracking-wide">
              {statusLabel}
            </p>
          </div>

        </div>

        {/* Meta */}

        <div className="grid grid-cols-3 gap-10">

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/45">
              Product
            </p>

            <p className="mt-2 truncate text-lg font-medium">
              {product}
            </p>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/45">
              Quantity
            </p>

            <p className="mt-2 text-lg font-medium font-sans tabular-nums">
              {quantity}
            </p>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/45">
              Reworks
            </p>

            <p className="mt-2 text-lg font-medium font-sans tabular-nums">
              {reworkCount}
            </p>
          </div>

        </div>

        {/* Workflow */}

        <ManufacturingWorkflow
          currentStep={currentStep}
          steps={workflowSteps}
        />

        {/* Footer */}

        <ManufacturingActions
          showContinue={canContinue}
          continueLabel={nextAction}
          onView={onView}
          onContinue={onContinue}
        />

      </CardContent>
    </Card>
  );
}