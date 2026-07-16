import { Button } from "@/components/ui/button";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { InvoicePopupContent } from "@/components/accounting/InvoicePopupContent";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { toast } from "sonner";

interface InvoicesModalsProps {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  isSubmitting: boolean;
  setIsSubmitting: (submitting: boolean) => void;
  formData: any;
  setFormData: (data: any) => void;
  partners: any[];
  load: () => Promise<void>;
  handleSubmit: () => Promise<void>;
}

export function InvoicesModals({
  isModalOpen,
  setIsModalOpen,
  isSubmitting,
  setIsSubmitting,
  formData,
  setFormData,
  partners,
  load,
  handleSubmit,
}: InvoicesModalsProps) {
  const updateInvoiceState = async (newState: string, successMessage: string) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(
        `/api/accounting/invoices/${formData._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: newState }),
        },
      );
      if (!res.ok) throw new Error("Failed to update invoice");
      toast.success(successMessage);
      setIsModalOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModularModal
      open={isModalOpen}
      onOpenChange={setIsModalOpen}
      title={formData?.name || "Invoice"}
      className="max-w-[95vw] w-full mw-100"
      footer={
        <div className="flex justify-end gap-2 px-6 py-4 w-full">
          <Button
            variant="outline"
            className="rounded-none text-xs"
            onClick={() => setIsModalOpen(false)}
          >
            Close
          </Button>

          {formData?._id && (
            <Button
              variant="outline"
              className="rounded-none text-xs text-[#A77DFF] hover:bg-white/5 border border-border/40"
              onClick={() =>
                window.open(`/sales/invoices/print/${formData._id}`, "_blank")
              }
            >
              Preview / Print
            </Button>
          )}

          {formData?._id && formData?.state === "draft" && (
            <Button
              variant="outline"
              className="rounded-none text-xs text-[#6CADF5] hover:bg-white/5 border border-border/40"
              onClick={() => updateInvoiceState(DOCUMENT_STATUS.PENDING_APPROVAL, "Invoice submitted for approval")}
              disabled={isSubmitting}
            >
              Submit for Approval
            </Button>
          )}

          {formData?._id && formData?.state === DOCUMENT_STATUS.PENDING_APPROVAL && (
            <Button
              variant="outline"
              className="rounded-none text-xs text-[#8AE06C] hover:bg-white/5 border border-border/40"
              onClick={() => updateInvoiceState(DOCUMENT_STATUS.APPROVED, "Invoice approved")}
              disabled={isSubmitting}
            >
              Approve
            </Button>
          )}

          {formData?._id && formData?.state === DOCUMENT_STATUS.APPROVED && (
            <Button
              variant="outline"
              className="rounded-none text-xs text-[#8AE06C] hover:bg-white/5 border border-border/40"
              onClick={() => updateInvoiceState(DOCUMENT_STATUS.POSTED, "Invoice posted to General Ledger")}
              disabled={isSubmitting}
            >
              Post to GL
            </Button>
          )}

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none text-xs px-6"
          >
            {isSubmitting ? "Saving..." : "Save Invoice"}
          </Button>
        </div>
      }
    >
      <InvoicePopupContent
        formData={formData || {}}
        setFormData={setFormData}
        isViewOnly={false}
        partners={partners}
      />
    </ModularModal>
  );
}
