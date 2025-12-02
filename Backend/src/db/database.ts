import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

let db: Database | null = null;

export async function initDb() {
  if (db) return db;

  db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender TEXT NOT NULL,
      receiver TEXT NOT NULL,
      amount INTEGER NOT NULL,
      commitment_number INTEGER NOT NULL,
      commitment TEXT NOT NULL,
      settled BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_receiver_settled 
      ON transactions(receiver, settled);
    
    CREATE INDEX IF NOT EXISTS idx_sender_receiver 
      ON transactions(sender, receiver);
    
    CREATE INDEX IF NOT EXISTS idx_commitment_number 
      ON transactions(commitment_number);
  `);

  return db;
}

export async function getDb() {
  if (!db) {
    return await initDb();
  }
  return db;
}
