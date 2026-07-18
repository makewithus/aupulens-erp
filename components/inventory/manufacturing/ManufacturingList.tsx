"use client";

import { ManufacturingCard } from "./ManufacturingCard";
import { ManufacturingEmpty } from "./ManufacturingEmpty";

interface ManufacturingOrder {
  _id: string;

  header: {
    name: string;
    quantity: number;

    productId?: {
      header?: {
        name?: string;
      };
    };
  };

  productionStatus: string;
  reworkCount?: number;
}

interface ManufacturingListProps {
  orders: ManufacturingOrder[];

  workflowSteps: {
    key: string;
    label: string;
  }[];

  statusLabels: Record<string, string>;

  getCurrentStep: (
    order: ManufacturingOrder
  ) => number;

  getNextAction: (
    order: ManufacturingOrder
  ) => string | undefined;

  onView: (
    order: ManufacturingOrder
  ) => void;

  onContinue: (
    order: ManufacturingOrder
  ) => void;
}

export function ManufacturingList({
  orders,
  workflowSteps,
  statusLabels,
  getCurrentStep,
  getNextAction,
  onView,
  onContinue,
}: ManufacturingListProps) {
  if (orders.length === 0) {
    return (
      <ManufacturingEmpty
        title="No manufacturing orders"
        description="Create a manufacturing order to begin production."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-1 xl:grid-cols-2">
      {orders.map((order) => (
        <ManufacturingCard
          key={order._id}
          reference={order.header.name}
          product={
            order.header.productId?.header?.name ??
            "-"
          }
          quantity={order.header.quantity}
          reworkCount={order.reworkCount ?? 0}
          workflowSteps={workflowSteps}
          currentStep={getCurrentStep(order)}
          statusLabel={
            statusLabels[
              order.productionStatus
            ] ?? order.productionStatus
          }
          nextAction={getNextAction(order)}
          canContinue={
            order.productionStatus !== "finished" &&
            order.productionStatus !== "cancelled"
          }
          onView={() => onView(order)}
          onContinue={() => onContinue(order)}
        />
      ))}
    </div>
  );
}