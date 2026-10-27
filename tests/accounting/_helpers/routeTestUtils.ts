import mongoose from "mongoose";

export function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, init) as any;
}

export function mockSession(tenantId: string, userId = new mongoose.Types.ObjectId().toString(), role = "admin") {
  return { user: { id: userId, tenantId, role } } as any;
}
