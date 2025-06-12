
'use server';
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import bcrypt from 'bcryptjs';

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

export async function getDb() {
  if (!db) {
    // Ensure the database file path is correct for your environment.
    // For local development, this places it in the project root.
    // This will NOT work reliably in most serverless deployment environments.
    const dbPath = process.env.NODE_ENV === 'production' 
      ? '/tmp/greenview.db' // Use /tmp for ephemeral storage in serverless if needed for some reason
      : path.join(process.cwd(), 'greenview.db'); 

    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        country TEXT,
        registrationDate INTEGER,
        profileImageUrl TEXT,
        notificationsEnabled BOOLEAN DEFAULT TRUE
      );
    `);
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS device_settings (
          deviceId TEXT PRIMARY KEY,
          userId INTEGER,
          measurementInterval INTEGER,
          autoIrrigation BOOLEAN,
          irrigationThreshold INTEGER,
          autoVentilation BOOLEAN,
          temperatureThreshold REAL,
          temperatureFanOffThreshold REAL,
          photoCaptureInterval INTEGER,
          temperatureUnit TEXT,
          FOREIGN KEY (userId) REFERENCES users(id)
      );
    `);
  }
  return db;
}

// Example of how to hash a password (used in registration)
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

// Example of how to compare a password (used in login)
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
