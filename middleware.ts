import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import NextAuth from "next-auth";

const { auth } = NextAuth(authConfig);

// Extract tenant ID from subdomain
function getTenantFromHost(hostname: string): string | null {
  const hostParts = hostname.split(".");

  // For companyx.aupulens.online, extract 'companyx'
  if (hostParts.length >= 3) {
    if (
      hostParts[0] !== "www" &&
      hostParts[0] !== "localhost" &&
      hostParts[0] !== "aupulens-erp"
    ) {
      return hostParts[0];
    }
  }

  // Handle localhost:3000
  if (hostname.includes("localhost") && hostParts.length >= 2) {
    if (hostParts[0] !== "localhost") {
      return hostParts[0];
    }
  }

  return null;
}

export default auth(async (req) => {
  const { hostname, pathname } = req.nextUrl;
  const tenantId = getTenantFromHost(hostname);

  // Store tenant info in headers for API routes
  const requestHeaders = new Headers(req.headers);
  if (tenantId) {
    requestHeaders.set("x-tenant-id", tenantId);
  }

  // req.auth is the session object
  const session = req.auth;
  // Map session user to 'token' concept if needed, but session.user has the role
  const user = session?.user;

  const isApiRoute = pathname.startsWith("/api");
  const isAuthApi = pathname.startsWith("/api/auth");
  const isPublicApi = pathname === "/api/tenant/status";

  // Enforce strict tenant isolation
  if (user && tenantId) {
    const userTenant = (user as any).tenantId || "default-tenant";
    if (user.role !== "master-admin" && userTenant.toLowerCase() !== tenantId.toLowerCase()) {
      if (isApiRoute) {
        return NextResponse.json({ error: "Forbidden: Tenant mismatch" }, { status: 403 });
      }
      const loginUrl = new URL(`/auth/${user.role || "admin"}`, req.url);
      loginUrl.searchParams.set("error", "TenantMismatch");
      return NextResponse.redirect(loginUrl);
    }
  }

  // Helper function to get role-based dashboard
  const getRoleDashboard = (role: string) => {
    switch (role) {
      case "admin":
        return "/admin/dashboard";
      case "master-admin":
        return "/master-admin";
      case "finance":
        return "/finance/summary";
      case "sales":
        return "/sales/summary";
      case "inventory":
        return "/inventory/dashboard";
      case "manufacturing":
        return "/manufacturing/dashboard";
      case "hr":
        return "/hr/dashboard";
      default:
        return role === "master-admin" ? "/master-admin" : "/auth/admin";
    }
  };

  // Helper function to handle authorization failure
  const handleUnauthorized = (isApi: boolean, redirectPath: string) => {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL(redirectPath, req.url));
  };

  const handleForbidden = (isApi: boolean, role: string) => {
    if (isApi) {
      return NextResponse.json({ error: "Forbidden: Access denied" }, { status: 403 });
    }
    return NextResponse.redirect(new URL(getRoleDashboard(role), req.url));
  };

  // Block all /api/debug/* routes — removed from codebase, always 404
  if (pathname.startsWith("/api/debug")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Central Session Check for API routes (exclude auth endpoints and public APIs)
  if (isApiRoute && !isAuthApi && !isPublicApi && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Handle root path
  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(
        user ? getRoleDashboard(user.role as string) : "/onboarding/signup",
        req.url,
      ),
    );
  }

  // Redirect authenticated users away from auth and onboarding pages
  if ((pathname.startsWith("/auth") || pathname.startsWith("/onboarding")) && user) {
    return NextResponse.redirect(
      new URL(getRoleDashboard(user.role as string), req.url),
    );
  }

  // Check if user is accessing admin routes / user management APIs
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/users") || pathname.startsWith("/api/admin")) {
    if (!user) {
      return handleUnauthorized(isApiRoute, "/auth/admin");
    }
    if (user.role !== "admin" && user.role !== "master-admin") {
      return handleForbidden(isApiRoute, user.role as string);
    }
  }

  // Check if user is accessing master-admin routes / APIs
  if (pathname.startsWith("/master-admin") || pathname.startsWith("/api/master-admin")) {
    // Block for any tenant other than default-tenant (main application)
    if (tenantId) {
      if (isApiRoute) {
        return NextResponse.json({ error: "Forbidden: Main domain access only" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (!user || user.role !== "master-admin") {
      return handleUnauthorized(isApiRoute, "/auth/master");
    }
  }

  // Check if user is accessing finance routes / APIs
  if (pathname.startsWith("/finance") || pathname.startsWith("/api/finance")) {
    if (!user) {
      return handleUnauthorized(isApiRoute, "/auth/finance");
    }
    if (
      user.role !== "finance" &&
      user.role !== "admin" &&
      user.role !== "master-admin"
    ) {
      return handleForbidden(isApiRoute, user.role as string);
    }
  }

  // Check if user is accessing CRM routes / APIs
  // Any authenticated user may enter CRM; fine-grained RBAC is enforced
  // per-handler via lib/crm/rbac.ts (requireRole with permission strings).
  if (pathname.startsWith("/crm") || pathname.startsWith("/api/crm")) {
    if (!user) {
      return handleUnauthorized(isApiRoute, "/auth/admin");
    }
  }

  // Check if user is accessing sales routes / APIs
  if (pathname.startsWith("/sales") || pathname.startsWith("/api/sales")) {
    if (!user) {
      return handleUnauthorized(isApiRoute, "/auth/sales");
    }
    if (
      user.role !== "sales" &&
      user.role !== "admin" &&
      user.role !== "master-admin"
    ) {
      return handleForbidden(isApiRoute, user.role as string);
    }
  }

  // Check if user is accessing inventory routes / APIs
  if (pathname.startsWith("/inventory") || pathname.startsWith("/api/inventory")) {
    if (!user) {
      return handleUnauthorized(isApiRoute, "/auth/inventory");
    }
    if (
      user.role !== "inventory" &&
      user.role !== "finance" &&
      user.role !== "admin" &&
      user.role !== "master-admin"
    ) {
      return handleForbidden(isApiRoute, user.role as string);
    }
  }

  // Check if user is accessing manufacturing routes / APIs
  if (pathname.startsWith("/manufacturing") || pathname.startsWith("/api/manufacturing")) {
    if (!user) {
      return handleUnauthorized(isApiRoute, "/auth/manufacturing");
    }
    if (
      user.role !== "manufacturing" &&
      user.role !== "admin" &&
      user.role !== "master-admin"
    ) {
      return handleForbidden(isApiRoute, user.role as string);
    }
  }

  // Check if user is accessing HR routes / APIs
  if (pathname.startsWith("/hr") || pathname.startsWith("/api/hr")) {
    if (!user) {
      return handleUnauthorized(isApiRoute, "/auth/hr");
    }
    if (
      user.role !== "hr" &&
      user.role !== "admin" &&
      user.role !== "master-admin"
    ) {
      return handleForbidden(isApiRoute, user.role as string);
    }
  }

  // Apply tenant context to the response
  if (tenantId) {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/admin/:path*",
    "/finance/:path*",
    "/sales/:path*",
    "/inventory/:path*",
    "/manufacturing/:path*",
    "/hr/:path*",
    "/master-admin/:path*",
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
