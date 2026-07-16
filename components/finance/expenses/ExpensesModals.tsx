import { Button } from "@/components/ui/button";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { ExpensePopupContent } from "@/components/accounting/ExpensePopupContent";

interface ExpensesModalsProps {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  isSubmitting: boolean;
  formData: any;
  setFormData: (data: any) => void;
  handleSubmit: (statusOverride?: string) => Promise<void>;
  handleUpdateStatus: (newStatus: string) => Promise<void>;
}

export function ExpensesModals({
  isModalOpen,
  setIsModalOpen,
  isSubmitting,
  formData,
  setFormData,
  handleSubmit,
  handleUpdateStatus,
}: ExpensesModalsProps) {
  return (
    <ModularModal
      open={isModalOpen}
      onOpenChange={setIsModalOpen}
      title={
        formData?._id
          ? `Expense: ${formData.description}`
          : "Record New Expense"
      }
      className="max-w-[1400px]"
      footer={
        <div className="flex justify-between items-center w-full px-6 py-4 bg-muted/5 border-t border-border/20">
          <div className="flex gap-2">
            {(formData?.status === "draft" || !formData?.status) && (
              <Button
                variant="outline"
                className="rounded-none text-xs text-[#6CADF5] hover:bg-white/5 border border-border/40"
                disabled={isSubmitting}
                onClick={() => handleSubmit("submitted")}
              >
                Submit for Approval
              </Button>
            )}

            {formData?.status === "submitted" && (
              <>
                <Button
                  variant="outline"
                  className="rounded-none text-xs text-[#F56868] hover:bg-white/5 border border-border/40"
                  disabled={isSubmitting}
                  onClick={() => handleUpdateStatus("refused")}
                >
                  Refuse
                </Button>
                <Button
                  variant="outline"
                  className="rounded-none text-xs text-[#8AE06C] hover:bg-white/5 border border-border/40"
                  disabled={isSubmitting}
                  onClick={() => handleUpdateStatus("approved")}
                >
                  Approve
                </Button>
              </>
            )}

            {formData?.status === "approved" && (
              <Button
                variant="outline"
                className="rounded-none text-xs text-[#8AE06C] hover:bg-white/5 border border-border/40"
                disabled={isSubmitting}
                onClick={() => handleUpdateStatus("posted")}
              >
                Post Journal Entry
              </Button>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              className="rounded-none text-xs"
            >
              {formData?.status === "posted" || formData?.status === "refused"
                ? "Close"
                : "Discard"}
            </Button>

            {(formData?.status === "draft" || !formData?.status) && (
              <Button
                onClick={() => handleSubmit()}
                disabled={isSubmitting}
                className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none text-xs px-6"
              >
                {isSubmitting
                  ? "Processing..."
                  : formData?._id
                    ? "Update Draft"
                    : "Save Record"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {formData && (
        <ExpensePopupContent
          formData={formData}
          setFormData={setFormData}
          isViewOnly={
            formData.status !== "draft" &&
            formData.status !== "approved" &&
            formData.status !== undefined
          }
        />
      )}
    </ModularModal>
  );
}
