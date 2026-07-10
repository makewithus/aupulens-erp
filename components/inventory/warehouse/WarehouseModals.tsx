import { Button } from "@/components/ui/button";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { WarehousePopupContent } from "@/app/inventory/warehouse/popup/WarehousePopup";

interface WarehouseModalsProps {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  formData: any;
  setFormData: (data: any) => void;
  isViewOnly: boolean;
  setIsViewOnly: (viewOnly: boolean) => void;
  isSubmitting: boolean;
  handleSubmit: () => Promise<void>;

  // Delete Modal
  deleteId: string | null;
  setDeleteId: (id: string | null) => void;
  handleDelete: () => Promise<void>;
}

export function WarehouseModals({
  isModalOpen,
  setIsModalOpen,
  formData,
  setFormData,
  isViewOnly,
  setIsViewOnly,
  isSubmitting,
  handleSubmit,

  deleteId,
  setDeleteId,
  handleDelete,
}: WarehouseModalsProps) {
  return (
    <>
      {/* Warehouse Create/Edit/View Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={formData?.name || "Warehouse"}
        className="max-w-xl"
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
              <Button
                onClick={() => setIsViewOnly(false)}
                className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
              >
                Edit
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
                {isSubmitting ? "Saving..." : "Save Warehouse"}
              </Button>
            </div>
          )
        }
      >
        {formData && (
          <WarehousePopupContent
            formData={formData}
            setFormData={setFormData}
            isViewOnly={isViewOnly}
          />
        )}
      </ModularModal>

      {/* Delete Confirmation Modal */}
      <ModularModal
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Confirm Delete"
        className="max-w-sm"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 rounded-none border border-red-700 text-white"
            >
              Delete Warehouse
            </Button>
          </div>
        }
      >
        <div className="p-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this warehouse? This action cannot be undone.
          </p>
        </div>
      </ModularModal>
    </>
  );
}
