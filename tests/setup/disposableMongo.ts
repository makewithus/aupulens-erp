/** Opt-in QA harness. Never loads application credentials or contacts a shared listener. */
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
const port = process.env.QA_DISPOSABLE_MONGO_PORT;
if (port) {
  if (!/^\d{4,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535 || port === "27017") throw new Error("Unsafe disposable Mongo port");
  const original = mongoose.connect.bind(mongoose);
  const rewrite = (uri: string) => {
    const match = /^mongodb:\/\/(?:localhost|127\.0\.0\.1):\d+\/((?:aupulens_test_|ns_migration_)[a-zA-Z0-9_-]+)(?:\?.*)?$/.exec(uri);
    if (!match) throw new Error("QA harness refuses a non-local or non-test database");
    return `mongodb://127.0.0.1:${port}/${match[1]}`;
  };
  mongoose.connect = ((uri: string, options?: mongoose.ConnectOptions) => {
    const target = rewrite(uri);
    process.env.MONGODB_URI = target; // Child-process migration checks must share this disposable database.
    return original(target, options);
  }) as typeof mongoose.connect;
  process.env.MONGODB_URI = `mongodb://127.0.0.1:${port}/aupulens_test_qa_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}
