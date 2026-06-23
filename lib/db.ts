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

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      // Connection pool — keep up to 10 connections warm for fast concurrent requests
      maxPoolSize: 10,
      minPoolSize: 2,
      // Fail fast if server is unreachable
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      family: 4, // Force IPv4 to prevent Node.js IPv6 resolution hangs
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((m) => m);
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
