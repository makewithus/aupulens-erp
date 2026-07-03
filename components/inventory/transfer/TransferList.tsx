"use client";

import { TransferCard } from "./TransferCard";

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

interface TransferListProps {
  title: string;
  partnerLabel: string;

  emptyTitle: string;
  emptyDescription: string;

  transfers: InventoryTransfer[];

  workflowSteps: {
    key: string;
    label: string;
  }[];

  getCurrentStep: (transfer: InventoryTransfer) => number;
  getNextAction: (transfer: InventoryTransfer) => string | undefined;
  statusLabels: Record<string, string>;

  onView: (transfer: InventoryTransfer) => void;
  onContinue: (transfer: InventoryTransfer) => void;
}

export function TransferList({
  title,
  partnerLabel,
  emptyTitle,
  emptyDescription,
  transfers,
  workflowSteps,
  getCurrentStep,
  getNextAction,
  statusLabels,
  onView,
  onContinue,
}: TransferListProps) {
  if (transfers.length === 0) {
    return 
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {transfers.map((transfer) => {
        const partner =
          transfer.header.partnerId?.header?.name ||
          transfer.header.partnerId?.name ||
          transfer.header.partnerName ||
          "-";

        return (
          <TransferCard
            key={transfer._id}
            title={title}
            reference={transfer.header.name}
            partnerLabel={partnerLabel}
            partnerName={partner}
            scheduledDate={transfer.header.scheduledDate}
            workflowSteps={workflowSteps}
            currentStep={getCurrentStep(transfer)}
            statusLabel={
              statusLabels[transfer.status] ??
              transfer.status
            }
            nextAction={getNextAction(transfer)}
            canContinue={transfer.status !== "closed"}
            onView={() => onView(transfer)}
            onContinue={() => onContinue(transfer)}
          />
        );
      })}
    </div>
  );
}