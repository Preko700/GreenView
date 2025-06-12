
'use server';
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import bcrypt from 'bcryptjs';
import type { DeviceSettings } from '@/lib/types'; // Import DeviceSettings type
import { TemperatureUnit } from '@/lib/types';

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

export async function getDb() {
  if (!db) {
    const dbPath = process.env.NODE_ENV === 'production' 
      ? '/tmp/greenview.db'
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
      CREATE TABLE IF NOT EXISTS devices (
        serialNumber TEXT PRIMARY KEY,
        userId INTEGER NOT NULL,
        name TEXT NOT NULL,
        plantType TEXT,
        location TEXT,
        activationDate INTEGER,
        warrantyEndDate INTEGER,
        isActive BOOLEAN DEFAULT TRUE,
        isPoweredByBattery BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS device_settings (
          deviceId TEXT PRIMARY KEY,
          measurementInterval INTEGER DEFAULT 5,
          autoIrrigation BOOLEAN DEFAULT TRUE,
          irrigationThreshold INTEGER DEFAULT 30,
          autoVentilation BOOLEAN DEFAULT TRUE,
          temperatureThreshold REAL DEFAULT 30.0,
          temperatureFanOffThreshold REAL DEFAULT 28.0,
          photoCaptureInterval INTEGER DEFAULT 6,
          temperatureUnit TEXT DEFAULT '${TemperatureUnit.CELSIUS}',
          FOREIGN KEY (deviceId) REFERENCES devices(serialNumber) ON DELETE CASCADE
      );
    `);
  }
  return db;
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export const defaultDeviceSettings: Omit<DeviceSettings, 'deviceId'> = {
  measurementInterval: 5, // RF-004: frecuencia de medición cada 5 minutos
  autoIrrigation: true, // RF-004: riego automático activado
  irrigationThreshold: 30,
  autoVentilation: true,
  temperatureThreshold: 30,
  temperatureFanOffThreshold: 28,
  photoCaptureInterval: 6, // RF-004: (implícito, pero buen default)
  temperatureUnit: TemperatureUnit.CELSIUS,
};
