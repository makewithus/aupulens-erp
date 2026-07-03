import mongoose from "mongoose";

export function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, init) as any;
}

export function mockSession(tenantId: string, userId = new mongoose.Types.ObjectId().toString()) {
  return { user: { id: userId, tenantId } } as any;
}
