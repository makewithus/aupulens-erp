import { TableSkeleton, PageHeaderSkeleton } from "@/components/ui/loading-skeletons";

/** Shown inside the persistent shell while the next route's server payload loads. */
export default function ProjectsLoading() {
  return (
    <div className="p-4 lg:p-6 space-y-4" aria-busy="true">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} columns={5} />
    </div>
  );
}
