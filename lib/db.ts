import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env');
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = globalThis.mongoose || { conn: null, promise: null };

if (!globalThis.mongoose) {
  globalThis.mongoose = cached;
}

const connectionOptions = {
  bufferCommands: false,
  // Keep the pool modest for local development and serverless invocations.
  maxPoolSize: 20,
  minPoolSize: 1,
  serverSelectionTimeoutMS: 15_000,
  connectTimeoutMS: 15_000,
  socketTimeoutMS: 45_000,
  heartbeatFrequencyMS: 10_000,
  family: 4,
};

function isTransientConnectionError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  return [
    "MongoNetworkError",
    "MongoNetworkTimeoutError",
    "MongoServerSelectionError",
  ].includes(name);
}

async function connectWithRetry(): Promise<typeof mongoose> {
  try {
    return await mongoose.connect(MONGODB_URI, connectionOptions);
  } catch (error) {
    if (!isTransientConnectionError(error)) throw error;

    // Atlas connections can occasionally lose a TLS handshake during network
    // changes. Retry one time only; persistent failures still surface quickly.
    await new Promise((resolve) => setTimeout(resolve, 300));
    return mongoose.connect(MONGODB_URI, connectionOptions);
  }
}

async function connectDB() {
  await import("@/lib/dbModels");
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = connectWithRetry();
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;
