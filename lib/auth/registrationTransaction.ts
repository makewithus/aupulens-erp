import mongoose, { type ClientSession } from "mongoose";
/** Provisioning requires a transaction-capable deployment. Never compensate by deleting a live tenant. */
export async function registrationTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  return mongoose.connection.transaction(work, { readPreference: "primary", writeConcern: { w: "majority" } });
}
