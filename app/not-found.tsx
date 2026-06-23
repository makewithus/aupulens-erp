import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-7xl font-bold text-muted-foreground/30">404</div>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="max-w-sm text-muted-foreground">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Return to dashboard
      </Link>
    </div>
  );
}
