import { redirect } from "next/navigation";

// The Sales module revamp replaced the standalone Quotations page with the
// "Quotes" tab inside the new Sales tab layout — redirect (preserving any query
// string, e.g. Pipeline's `?view=<id>` deep link) so old links/bookmarks still
// land somewhere real instead of 404ing.
export default async function QuotationsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  redirect(qs ? `/sales/quotes?${qs}` : "/sales/quotes");
}
