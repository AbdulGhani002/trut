import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable inside .env.local'
  );
}

// Use a typed global to store cached mongoose connection across module reloads in dev
type MongooseCached = {
  conn: typeof import('mongoose') | null;
  promise: Promise<typeof import('mongoose')> | null;
};

declare global {
  var _mongooseCached: MongooseCached | undefined;
}

const _global = globalThis as unknown as { _mongooseCached?: MongooseCached };
let cached: MongooseCached | undefined = _global._mongooseCached;

if (!cached) {
  cached = { conn: null, promise: null };
  _global._mongooseCached = cached;
}

async function dbConnect() {
  // Ensure cached is defined (should be initialized above during module load)
  if (!cached) {
    cached = { conn: null, promise: null };
    _global._mongooseCached = cached;
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    // MONGODB_URI is checked above; assert non-null for the connect call
    cached.promise = mongoose.connect(MONGODB_URI!, opts).then((mongoose) => {
      return mongoose;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export default dbConnect;
