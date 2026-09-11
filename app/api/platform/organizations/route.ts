import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { listOrganizations } from "@/lib/platform/organizations/list";
import { createOrganization, OrganizationCreateError } from "@/lib/platform/organizations/create";
import { AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { OrganizationStatus, OrganizationTypeKey } from "@/lib/constants/statuses";

export async function GET(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const url = new URL(request.url);
  try {
    const result = await listOrganizations(actor, "platform organisations list view", {
      page: Number(url.searchParams.get("page") ?? "1"),
      pageSize: Number(url.searchParams.get("pageSize") ?? "25"),
      status: (url.searchParams.get("status") as OrganizationStatus) || undefined,
      organizationType: (url.searchParams.get("organizationType") as OrganizationTypeKey) || undefined,
      search: url.searchParams.get("search") || undefined,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }

  try {
    const result = await createOrganization(actor, body);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err) {
    if (err instanceof OrganizationCreateError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    throw err;
  }
}
