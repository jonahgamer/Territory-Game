import { MongoClient } from "mongodb";

let client = null;
let db = null;

export async function connectToDatabase() {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || "territory_game";
  if (!uri) throw new Error("MONGODB_URI not defined");
  client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 20000,
    socketTimeoutMS: 30000,
  });
  await client.connect();
  db = client.db(dbName);
  return db;
}

export function getMongoClient() {
  return client;
}

export function applyCors(req, res) {
  const allowed = process.env.CORS_ORIGIN;
  const origin = req.headers.origin;
  if (allowed && origin === allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
