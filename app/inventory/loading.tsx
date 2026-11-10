import { TableSkeleton, PageHeaderSkeleton } from "@/components/ui/loading-skeletons";

/** Shown inside the persistent shell while the next Inventory route's server payload loads. */
export default function InventoryLoading() {
  return (
    <div className="p-4 lg:p-6 space-y-4">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} columns={5} />
    </div>
  );
}
