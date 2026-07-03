"use client";

import { Card, CardContent } from "@/components/ui/card";

import { ReceiptWorkflow } from "./ReceiptWorkflow";
import { ReceiptActions } from "./ReceiptActions";

interface InventoryTransfer {
  _id: string;
  status: string;
  qcStatus?: string;

  header: {
    name: string;
    scheduledDate: string;
    partnerName?: string;

    partnerId?: {
      name?: string;

      header?: {
        name?: string;
      };
    };
  };
}

interface ReceiptCardProps {
  transfer: InventoryTransfer;

  currentStep: number;

  workflowSteps: {
    key: string;
    label: string;
  }[];

  statusLabel: string;

  nextAction?: string;

  canContinue: boolean;

  onView: () => void;

  onContinue: () => void;
}

export function ReceiptCard({
  transfer,
  currentStep,
  workflowSteps,
  statusLabel,
  nextAction,
  canContinue,
  onView,
  onContinue,
}: ReceiptCardProps) {
  const vendor =
    transfer.header.partnerId?.header?.name ||
    transfer.header.partnerId?.name ||
    transfer.header.partnerName ||
    "Unknown Vendor";

  return (
    <Card className="group overflow-hidden border-border/40 shadow-none transition-colors hover:bg-muted/20">
      <CardContent className="space-y-6 p-6">

        {/* Header */}

        <div className="flex items-start justify-between gap-8">

          <div>

            <h2 className="text-[28px] font-medium tracking-[-0.04em] transition-opacity duration-500 group-hover:opacity-80">
              {transfer.header.name}
            </h2>

          </div>

          <div className="text-right">

            <p className="font-mono text-[10px] text-muted-foreground/45">
              Status
            </p>

            <p className="mt-1 text-sm uppercase">
              {statusLabel}
            </p>

          </div>

        </div>

        {/* Meta */}

        <div className="grid grid-cols-2 gap-10">

          <div>

            <p className="font-mono text-[10px] text-muted-foreground/45">
              Vendor
            </p>

            <p className="mt-2 text-lg font-medium">
              {vendor}
            </p>

          </div>

          <div>

            <p className="font-mono text-[10px] text-muted-foreground/45">
              Scheduled
            </p>

            <p className="mt-2 text-lg font-medium">
              {new Date(
                transfer.header.scheduledDate
              ).toLocaleDateString()}
            </p>

          </div>

        </div>

        {/* Workflow */}

        <ReceiptWorkflow
          currentStep={currentStep}
          steps={workflowSteps}
        />

        {/* Footer */}

        <ReceiptActions
          showContinue={canContinue}
          continueLabel={nextAction}
          onView={onView}
          onContinue={onContinue}
        />

      </CardContent>
    </Card>
  );
}