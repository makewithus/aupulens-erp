import { Button } from "@/components/ui/button";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { StockTransferPopup } from "@/app/inventory/operations/popups/StockTransferPopup";

interface ReturnsModalsProps {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  formData: any;
  setFormData: (data: any) => void;
  isViewOnly: boolean;
  isSubmitting: boolean;
  partners: any[];
  products: any[];
  users: any[];
  fetchReturns: () => Promise<void>;
  saveReturn: () => Promise<void>;
  currentUserSession: any;
}

export function ReturnsModals({
  isModalOpen,
  setIsModalOpen,
  formData,
  setFormData,
  isViewOnly,
  isSubmitting,
  partners,
  products,
  users,
  fetchReturns,
  saveReturn,
  currentUserSession,
}: ReturnsModalsProps) {
  return (
    <ModularModal
      open={isModalOpen}
      onOpenChange={setIsModalOpen}
      title={formData?.header?.name || "Return Document"}
      className="max-w-[1400px]"
      footer={
        <div className="flex justify-between items-center w-full px-6 py-4 bg-muted/5 border-t border-border/20">
          <div className="flex items-center gap-4">
            {formData?.status === "draft" && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-500/10 px-3 py-1.5 rounded-none border border-amber-500/20 font-mono text-[10px] font-bold uppercase tracking-tight">
                Draft Document
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="rounded-none text-xs"
              onClick={() => setIsModalOpen(false)}
            >
              {isViewOnly ? "Close" : "Discard"}
            </Button>
            {!isViewOnly && (
              <Button
                onClick={saveReturn}
                disabled={isSubmitting}
                className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none text-xs px-6"
              >
                {isSubmitting ? "Processing..." : "Save Record"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {formData && (
        <StockTransferPopup
          formData={formData}
          setFormData={setFormData}
          isViewOnly={isViewOnly}
          operationType="outgoing"
          partners={partners}
          products={products}
          users={users}
          onRefresh={fetchReturns}
          currentUser={currentUserSession}
        />
      )}
    </ModularModal>
  );
}
