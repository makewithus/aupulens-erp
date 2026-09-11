import mongoose from "mongoose";

export function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, init) as any;
}

export function makeRequestWithCookie(url: string, cookieHeader: string, init?: RequestInit) {
  return new Request(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), cookie: cookieHeader },
  }) as any;
}

export function objectId() {
  return new mongoose.Types.ObjectId().toString();
}
