export default function AdminRouteLoading() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center text-muted-foreground" aria-busy="true">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-current border-r-transparent" />
      <span className="sr-only">Loading admin page</span>
    </div>
  );
}
