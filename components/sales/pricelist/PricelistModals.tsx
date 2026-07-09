import { Button } from "@/components/ui/button";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { PricelistPopupContent } from "@/app/sales/pricelist/popup/PricelistPopup";

interface PricelistModalsProps {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  isViewOnly: boolean;
  currentItem: any;
  isSubmitting: boolean;
  formData: any;
  setFormData: (data: any) => void;
  products: any[];
  handleSubmit: () => Promise<void>;

  // Delete Confirmation Modal
  deleteInfo: { id: string; name: string } | null;
  setDeleteInfo: (info: { id: string; name: string } | null) => void;
  handleConfirmDelete: () => Promise<void>;
}

export function PricelistModals({
  isModalOpen,
  setIsModalOpen,
  isViewOnly,
  currentItem,
  isSubmitting,
  formData,
  setFormData,
  products,
  handleSubmit,

  deleteInfo,
  setDeleteInfo,
  handleConfirmDelete,
}: PricelistModalsProps) {
  return (
    <>
      {/* Main Pricelist Create/Edit/View Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          isViewOnly
            ? "View Pricelist"
            : currentItem
              ? "Edit Pricelist"
              : "New Pricelist"
        }
        footer={
          isViewOnly ? (
            <div className="flex justify-end gap-2 px-6 py-4 w-full">
              <Button
                variant="outline"
                className="rounded-none"
                onClick={() => setIsModalOpen(false)}
              >
                Close
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2 px-6 py-4 w-full">
              <Button
                variant="outline"
                className="rounded-none"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
              >
                {isSubmitting ? "Saving..." : "Save Pricelist"}
              </Button>
            </div>
          )
        }
      >
        <PricelistPopupContent
          formData={formData}
          setFormData={setFormData}
          isViewOnly={isViewOnly}
          products={products}
        />
      </ModularModal>

      {/* Delete Confirmation Modal */}
      <ModularModal
        open={!!deleteInfo}
        onOpenChange={(open) => !open && setDeleteInfo(null)}
        title="Confirm Deletion"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setDeleteInfo(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 rounded-none border border-red-700 text-white"
            >
              Delete Pricelist
            </Button>
          </div>
        }
      >
        <div className="p-6 text-center space-y-2">
          <p className="text-muted-foreground text-sm">
            Are you sure you want to delete <strong>{deleteInfo?.name}</strong>? This action cannot be undone.
          </p>
        </div>
      </ModularModal>
    </>
  );
}
