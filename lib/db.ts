import mongoose from 'mongoose';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: MongooseCache | undefined;
  var _mongoListenersAttached: boolean | undefined;
}

const cached: MongooseCache = globalThis.mongoose || { conn: null, promise: null };

if (!globalThis.mongoose) {
  globalThis.mongoose = cached;
}

const connectionOptions = {
  bufferCommands: false,
  // Keep the pool modest for local development and serverless invocations.
  maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE) || 20,
  minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE) || 2,
  serverSelectionTimeoutMS: 15_000,
  connectTimeoutMS: 15_000,
  socketTimeoutMS: 45_000,
  heartbeatFrequencyMS: 10_000,
  family: 4,
  autoIndex: process.env.NODE_ENV !== "production",
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
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Please define the MONGODB_URI environment variable inside .env');
  }

  try {
    return await mongoose.connect(uri, connectionOptions);
  } catch (error) {
    if (!isTransientConnectionError(error)) throw error;

    // Atlas connections can occasionally lose a TLS handshake during network
    // changes. Retry one time only; persistent failures still surface quickly.
    await new Promise((resolve) => setTimeout(resolve, 300));
    return mongoose.connect(uri, connectionOptions);
  }
}

let modelsPromise: Promise<unknown> | null = null;
function ensureModelsRegistered() {
  if (!modelsPromise) {
    modelsPromise = import("@/lib/dbModels").catch((err) => {
      modelsPromise = null;
      throw err;
    });
  }
  return modelsPromise;
}

if (!globalThis._mongoListenersAttached) {
  globalThis._mongoListenersAttached = true;
  mongoose.connection.on("disconnected", () => {
    if (globalThis.mongoose) {
      globalThis.mongoose.conn = null;
      globalThis.mongoose.promise = null;
    }
  });
  mongoose.connection.on("error", (err) => {
    console.error("[db] MongoDB connection error:", err?.message || err);
    if (mongoose.connection.readyState !== 1 && globalThis.mongoose) {
      globalThis.mongoose.conn = null;
      globalThis.mongoose.promise = null;
    }
  });
}

async function connectDB() {
  await ensureModelsRegistered();

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // If connection is disconnected (0) or disconnecting (3), reset state to reconnect cleanly
  if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
    cached.conn = null;
    cached.promise = null;
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
