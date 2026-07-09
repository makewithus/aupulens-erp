import { Button } from "@/components/ui/button";
import { Loader2, TriangleAlert } from "lucide-react";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { InvoicePopupContent } from "@/components/accounting/InvoicePopupContent";

interface ProformaInvoiceModalsProps {
  // Main modal state
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  formData: any;
  setFormData: (data: any) => void;
  isViewOnly: boolean;
  currentInvoice: any;
  isSubmitting: boolean;
  handleSubmit: () => Promise<void>;

  // Delete modal state
  deleteConfirmationId: string | null;
  setDeleteConfirmationId: (id: string | null) => void;
  confirmDelete: () => Promise<void>;

  // Resources
  partners: any[];
}

export function ProformaInvoiceModals({
  isModalOpen,
  setIsModalOpen,
  formData,
  setFormData,
  isViewOnly,
  currentInvoice,
  isSubmitting,
  handleSubmit,

  deleteConfirmationId,
  setDeleteConfirmationId,
  confirmDelete,

  partners,
}: ProformaInvoiceModalsProps) {
  return (
    <>
      {/* Main View/Edit/Create Proforma Invoice Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          isViewOnly
            ? "View Invoice"
            : currentInvoice
              ? "Edit Invoice"
              : "New Invoice"
        }
        className="max-w-[95vw]"
        footer={
          isViewOnly ? (
            <div className="flex justify-end gap-2 px-6 py-4 w-full">
              <Button variant="outline" className="rounded-none" onClick={() => setIsModalOpen(false)}>
                Close
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2 px-6 py-4 w-full">
              <Button variant="outline" className="rounded-none" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Invoice"
                )}
              </Button>
            </div>
          )
        }
      >
        <InvoicePopupContent
          formData={formData}
          setFormData={setFormData}
          isViewOnly={isViewOnly}
          partners={partners}
        />
      </ModularModal>

      {/* Delete Confirmation Modal */}
      <ModularModal
        open={!!deleteConfirmationId}
        onOpenChange={(open) => !open && setDeleteConfirmationId(null)}
        title="Confirm Deletion"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setDeleteConfirmationId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 rounded-none border border-red-700"
            >
              Delete Invoice
            </Button>
          </div>
        }
      >
        <div className="p-6 flex flex-col items-center text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-red-100/10 flex items-center justify-center text-red-500">
            <TriangleAlert className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <p className="font-medium text-lg">Are you sure?</p>
            <p className="text-muted-foreground text-sm">
              This action cannot be undone. This will permanently delete the invoice.
            </p>
          </div>
        </div>
      </ModularModal>
    </>
  );
}
