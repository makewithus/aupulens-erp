import { randomUUID } from "node:crypto";

/** Build a unique, explicitly test-only database URI from the configured Mongo URI. */
export function disposableMongoUri(suite: string): string {
  const configured = process.env.MONGODB_URI;
  if (!configured) throw new Error("MONGODB_URI must be set for Mongo-backed remediation tests");

  const uri = new URL(configured);
  if (!/^mongodb(?:\+srv)?:$/.test(uri.protocol)) {
    throw new Error("Remediation tests require a MongoDB connection URI");
  }

  const safeSuite = suite.replace(/[^a-z0-9_-]/gi, "_").toLowerCase().slice(0, 14);
  uri.pathname = `/aupulens_test_${safeSuite.slice(0, 10)}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  return uri.toString();
}
