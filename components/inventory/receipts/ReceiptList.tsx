"use client";

import { ReceiptCard } from "./ReceiptCard";

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

interface ReceiptListProps {
  transfers: InventoryTransfer[];

  onView: (transfer: InventoryTransfer) => void;

  onContinue: (transfer: InventoryTransfer) => void;
}

const workflowSteps = [
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Receive" },
  { key: "qc", label: "QC" },
  { key: "approved", label: "GRN" },
  { key: "posted", label: "Stock" },
  { key: "closed", label: "Close" },
];

const getNextAction = (transfer: InventoryTransfer) => {
  switch (transfer.status) {
    case "draft":
      return "Receive Goods";

    case "pending_approval":
      if (transfer.qcStatus === "pending")
        return "Pass QC";

      if (transfer.qcStatus === "passed")
        return "Generate GRN";

      if (transfer.qcStatus === "failed")
        return "Retry QC";

      return undefined;

    case "approved":
      return "Update Stock";

    case "posted":
      return "Close Receipt";

    default:
      return undefined;
  }
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  qc: "QC In Progress",
  approved: "Approved",
  posted: "Stock Updated",
  closed: "Closed",
};

const getCurrentStep = (transfer: InventoryTransfer) => {
  switch (transfer.status) {
    case "draft":
      return 0;

    case "pending_approval":
      return 2;

    case "approved":
      return 3;

    case "posted":
      return 4;

    case "closed":
      return 5;

    default:
      return 0;
  }
};

export function ReceiptList({
  transfers,
  onView,
  onContinue,
}: ReceiptListProps) {
  if (transfers.length === 0) {
  }

  return (
    <div className="grid grid-cols-1 gap-1 xl:grid-cols-2">
      {transfers.map((transfer) => (
        <ReceiptCard
          key={transfer._id}
          transfer={transfer}
          workflowSteps={workflowSteps}
          currentStep={getCurrentStep(transfer)}
          statusLabel={
            statusLabels[transfer.status] ??
            transfer.status
          }
          nextAction={
            getNextAction(transfer)
          }
          canContinue={transfer.status !== "closed"}
          onView={() => onView(transfer)}
          onContinue={() => onContinue(transfer)}
        />
      ))}
    </div>
  );
}