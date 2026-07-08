import { Q2C_FLOW_STEPS } from "@/lib/constants/statuses";
import { PipelineColumn } from "./PipelineColumn";

interface PipelineBoardProps {
  groupedByStage: Record<string, any[]>;
  selectedOrder: any;
  setSelectedOrder: (val: any) => void;
  handleQ2CTransition: (orderId: string, nextStatus: string) => Promise<void>;
  formatCurrency: (val: number) => string;
}

export function PipelineBoard({
  groupedByStage,
  selectedOrder,
  setSelectedOrder,
  handleQ2CTransition,
  formatCurrency,
}: PipelineBoardProps) {
  return (
    <div className="overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-border">
      <div className="flex gap-6 min-w-max">
        {Q2C_FLOW_STEPS.map((stage) => {
          const orders = groupedByStage[stage] || [];
          return (
            <PipelineColumn
              key={stage}
              stage={stage}
              orders={orders}
              selectedOrder={selectedOrder}
              setSelectedOrder={setSelectedOrder}
              handleQ2CTransition={handleQ2CTransition}
              formatCurrency={formatCurrency}
            />
          );
        })}
      </div>
    </div>
  );
}
