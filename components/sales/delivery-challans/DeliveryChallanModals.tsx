import { Button } from "@/components/ui/button";
import { ModularModal } from "@/components/dashboard/ModularModal";
import { DeliveryChallanPopupContent } from "@/app/sales/delivery-challans/popup/DeliveryChallanPopup";
import { WarehousePopupContent } from "@/app/sales/warehouses/popup/WarehousePopup";

interface DeliveryChallanModalsProps {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  isViewOnly: boolean;
  currentId: string | null;
  isSubmitting: boolean;
  formData: any;
  setFormData: (data: any) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  warehouses: any[];
  customers: any[];
  products: any[];
  onAddWarehouse: () => void;
  onAddCustomer: () => void;
  handleSubmit: () => Promise<void>;

  // Warehouse Modal
  isWarehouseModalOpen: boolean;
  setIsWarehouseModalOpen: (open: boolean) => void;
  warehouseFormData: any;
  setWarehouseFormData: (data: any) => void;
  handleCreateWarehouse: () => Promise<void>;

  // Delete Modal
  deleteInfo: { id: string; name: string } | null;
  setDeleteInfo: (info: { id: string; name: string } | null) => void;
  handleConfirmDelete: () => Promise<void>;
}

export function DeliveryChallanModals({
  isModalOpen,
  setIsModalOpen,
  isViewOnly,
  currentId,
  isSubmitting,
  formData,
  setFormData,
  activeTab,
  setActiveTab,
  warehouses,
  customers,
  products,
  onAddWarehouse,
  onAddCustomer,
  handleSubmit,

  isWarehouseModalOpen,
  setIsWarehouseModalOpen,
  warehouseFormData,
  setWarehouseFormData,
  handleCreateWarehouse,

  deleteInfo,
  setDeleteInfo,
  handleConfirmDelete,
}: DeliveryChallanModalsProps) {
  return (
    <>
      {/* Main Delivery Challan Create/Edit/View Modal */}
      <ModularModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={
          isViewOnly
            ? "View Delivery Challan"
            : currentId
              ? "Edit Delivery Challan"
              : "New Delivery Challan"
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
                {isSubmitting ? "Saving..." : "Save"}
              </Button>
            </div>
          )
        }
        className="max-w-4xl"
      >
        <DeliveryChallanPopupContent
          formData={formData}
          setFormData={setFormData}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isViewOnly={isViewOnly}
          warehouses={warehouses}
          customers={customers}
          products={products}
          onAddWarehouse={onAddWarehouse}
          onAddCustomer={onAddCustomer}
        />
      </ModularModal>

      {/* Warehouse Modal */}
      <ModularModal
        open={isWarehouseModalOpen}
        onOpenChange={setIsWarehouseModalOpen}
        title="Create Warehouse"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 w-full">
            <Button
              variant="outline"
              className="rounded-none"
              onClick={() => setIsWarehouseModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateWarehouse}
              className="bg-tertiary text-primary hover:bg-muted border border-secondary rounded-none"
            >
              Save Warehouse
            </Button>
          </div>
        }
      >
        <WarehousePopupContent
          formData={warehouseFormData}
          setFormData={setWarehouseFormData}
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
              Delete Challan
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
