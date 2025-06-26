
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import type { DeviceSettings } from '@/lib/types';
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
    console.log("DB: Database connection established.");

    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec('PRAGMA foreign_keys = ON;');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        registrationDate INTEGER
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        serialNumber TEXT PRIMARY KEY,
        userId INTEGER NOT NULL,
        hardwareIdentifier TEXT UNIQUE NOT NULL, 
        name TEXT NOT NULL,
        plantType TEXT,
        location TEXT,
        activationDate INTEGER,
        warrantyEndDate INTEGER,
        isActive BOOLEAN DEFAULT TRUE,
        isPoweredByBattery BOOLEAN DEFAULT FALSE,
        lastUpdateTimestamp INTEGER,
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
          desiredLightState BOOLEAN DEFAULT FALSE,
          desiredFanState BOOLEAN DEFAULT FALSE,
          desiredIrrigationState BOOLEAN DEFAULT FALSE,
          requestManualTemperatureReading BOOLEAN DEFAULT FALSE,
          requestManualAirHumidityReading BOOLEAN DEFAULT FALSE,
          requestManualSoilHumidityReading BOOLEAN DEFAULT FALSE,
          requestManualLightLevelReading BOOLEAN DEFAULT FALSE,
          FOREIGN KEY (deviceId) REFERENCES devices(serialNumber) ON DELETE CASCADE
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS sensor_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deviceId TEXT NOT NULL,
        type TEXT NOT NULL, 
        value REAL NOT NULL,
        unit TEXT,
        timestamp INTEGER NOT NULL, 
        FOREIGN KEY (deviceId) REFERENCES devices(serialNumber) ON DELETE CASCADE
      );
    `);
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        timestamp INTEGER NOT NULL
      );
    `);
    
    console.log("DB: Schema checked/created successfully.");
  }
  return db;
}

export const defaultDeviceSettings: Omit<DeviceSettings, 'deviceId'> = {
  measurementInterval: 5, 
  autoIrrigation: true, 
  irrigationThreshold: 30,
  autoVentilation: true,
  temperatureThreshold: 30,
  temperatureFanOffThreshold: 28,
  photoCaptureInterval: 6, 
  temperatureUnit: TemperatureUnit.CELSIUS,
  desiredLightState: false,
  desiredFanState: false,
  desiredIrrigationState: false,
  requestManualTemperatureReading: false,
  requestManualAirHumidityReading: false,
  requestManualSoilHumidityReading: false,
  requestManualLightLevelReading: false,
};
