import { Loader2 } from "lucide-react";

export default function PlatformLoading() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[40vh] gap-4">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/20 border-t-primary" />
      <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
    </div>
  );
}
