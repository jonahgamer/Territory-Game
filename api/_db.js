// api/_db.js
import { MongoClient } from 'mongodb';

let client = null;
let db = null;

export async function connectToDatabase() {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'wyk_stem';
  if (!uri) throw new Error('MONGODB_URI not defined');
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