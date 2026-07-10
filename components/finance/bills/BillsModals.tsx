import { Button } from "@/components/ui/button";
import { ModularModal } from "@/components/dashboard/ModularModal";
import BillPopupContent from "@/components/accounting/BillPopupContent";
import { InvoicePopupContent } from "@/components/accounting/InvoicePopupContent";
import { DOCUMENT_STATUS, PAYMENT_STATE } from "@/lib/constants/statuses";
import { toast } from "sonner";

interface BillsModalsProps {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  formData: any;
  setFormData: (data: any) => void;
  isSubmitting: boolean;
  setIsSubmitting: (submitting: boolean) => void;
  handleSubmit: (statusOverride?: string) => Promise<void>;
  load: () => Promise<void>;

  // Customer Invoice generation modal
  isInvoiceModalOpen: boolean;
  setIsInvoiceModalOpen: (open: boolean) => void;
  invoiceFormData: any;
  setInvoiceFormData: (data: any) => void;
  customers: any[];
  isSubmittingInvoice: boolean;
  handleSaveInvoice: () => Promise<void>;
}

export function BillsModals({
  isModalOpen,
  setIsModalOpen,
  formData,
  setFormData,
  isSubmitting,
  setIsSubmitting,
  handleSubmit,
  load,

  isInvoiceModalOpen,
  setIsInvoiceModalOpen,
  invoiceFormData,
  setInvoiceFormData,
  customers,
  isSubmittingInvoice,
  handleSaveInvoice,
}: BillsModalsProps) {
  const patchBill = async (body: any, successMessage: string) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/finance/bills/${formData._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Operation failed");
      toast.success(successMessage);
      setIsModalOpen(false);
      load();
    } catch (error: any) {
      toast.error(error.message || "Operation failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Vendor Bill Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          formData?._id ? `Vendor Bill: ${formData.name}` : "Create Vendor Bill"
        }
        className="max-w-[1400px]"
        footer={
          <div className="flex justify-between items-center w-full px-6 py-4 bg-muted/5 border-t border-border/20">
            <div className="flex gap-2">
              {formData?.state === DOCUMENT_STATUS.DRAFT && (
                <Button
                  variant="outline"
                  className="rounded-none text-xs text-[#6CADF5] hover:bg-white/5 border border-border/40"
                  disabled={isSubmitting}
                  onClick={() => patchBill({
                    poMatchType: formData.poMatchType || "2_way",
                    poMatchStatus: "matched",
                    state: DOCUMENT_STATUS.PENDING_APPROVAL,
                  }, "PO matched. AP invoice moved to approval.")}
                >
                  Match PO & Send Approval
                </Button>
              )}

              {formData?.state === DOCUMENT_STATUS.DRAFT && (
                <Button
                  variant="outline"
                  className="rounded-none text-xs text-[#F56868] hover:bg-white/5 border border-border/40"
                  disabled={isSubmitting}
                  onClick={() => patchBill({
                    poMatchStatus: "mismatch",
                    manualReviewRequired: true,
                    discrepancyNotes: formData.discrepancyNotes || "PO mismatch flagged for manual review",
                  }, "Discrepancy logged. Sent to manual review.")}
                >
                  Mark Discrepancy
                </Button>
              )}

              {formData?.state === DOCUMENT_STATUS.PENDING_APPROVAL && (
                <Button
                  variant="outline"
                  className="rounded-none text-xs text-[#8AE06C] hover:bg-white/5 border border-border/40"
                  disabled={isSubmitting}
                  onClick={() => patchBill({ state: DOCUMENT_STATUS.APPROVED }, "Bill approved")}
                >
                  Approve
                </Button>
              )}

              {formData?.state === DOCUMENT_STATUS.APPROVED &&
                (formData?.paymentState || PAYMENT_STATE.NOT_PAID) === PAYMENT_STATE.NOT_PAID && (
                  <Button
                    variant="outline"
                    className="rounded-none text-xs text-[#6CADF5] hover:bg-white/5 border border-border/40"
                    disabled={isSubmitting}
                    onClick={() => patchBill({
                      paymentState: PAYMENT_STATE.IN_PAYMENT,
                      paymentScheduledDate: formData.paymentScheduledDate || formData.dueDate || new Date(),
                    }, "Payment scheduled")}
                  >
                    Schedule Payment
                  </Button>
                )}

              {formData?.state === DOCUMENT_STATUS.APPROVED &&
                formData?.paymentState === PAYMENT_STATE.IN_PAYMENT && (
                  <Button
                    variant="outline"
                    className="rounded-none text-xs text-[#8AE06C] hover:bg-white/5 border border-border/40"
                    disabled={isSubmitting}
                    onClick={() => patchBill({
                      paymentState: PAYMENT_STATE.PAID,
                      paidDate: new Date(),
                    }, "Payment executed")}
                  >
                    Execute Payment
                  </Button>
                )}

              {formData?.state === DOCUMENT_STATUS.APPROVED &&
                formData?.paymentState === PAYMENT_STATE.PAID && (
                  <Button
                    variant="outline"
                    className="rounded-none text-xs text-[#8AE06C] hover:bg-white/5 border border-border/40"
                    disabled={isSubmitting}
                    onClick={() => handleSubmit(DOCUMENT_STATUS.POSTED)}
                  >
                    Post to GL
                  </Button>
                )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="rounded-none text-xs"
              >
                {formData?.state === DOCUMENT_STATUS.POSTED ? "Close" : "Discard"}
              </Button>
              {formData?.state === DOCUMENT_STATUS.DRAFT && (
                <Button
                  onClick={() => handleSubmit()}
                  disabled={isSubmitting}
                  className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none text-xs px-6"
                >
                  {isSubmitting
                    ? "Saving..."
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
          <BillPopupContent
            formData={formData}
            setFormData={setFormData}
            isViewOnly={formData.state !== DOCUMENT_STATUS.DRAFT}
          />
        )}
      </ModularModal>

      {/* Generate Invoice Modal */}
      <ModularModal
        open={isInvoiceModalOpen}
        onOpenChange={setIsInvoiceModalOpen}
        title="Generate Customer Invoice"
        className="max-w-[1400px]"
        footer={
          <div className="flex justify-end gap-3 px-6 py-4 bg-muted/5 border-t border-border/20 w-full">
            <Button
              variant="outline"
              onClick={() => setIsInvoiceModalOpen(false)}
              className="rounded-none text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveInvoice}
              disabled={isSubmittingInvoice}
              className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none text-xs px-6"
            >
              {isSubmittingInvoice ? "Saving..." : "Create Invoice"}
            </Button>
          </div>
        }
      >
        {invoiceFormData && (
          <InvoicePopupContent
            formData={invoiceFormData}
            setFormData={setInvoiceFormData}
            partners={customers}
            isViewOnly={false}
          />
        )}
      </ModularModal>
    </>
  );
}
