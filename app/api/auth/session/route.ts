import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  
  if (!session) {
    return Response.json(null);
  }
  
  return Response.json({
    user: {
      id: session.user?.id,
      name: session.user?.name,
      email: session.user?.email,
      role: session.user?.role,
      tenantId: session.user?.tenantId,
    }
  });
}