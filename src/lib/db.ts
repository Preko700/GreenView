
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import bcrypt from 'bcryptjs';
import type { DeviceSettings } from '@/lib/types';
import { TemperatureUnit } from '@/lib/types';

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

async function addColumnIfNotExists(
  db: Database<sqlite3.Database, sqlite3.Statement>,
  tableName: string,
  columnName: string,
  columnDefinition: string
) {
  try {
    const columns = await db.all(`PRAGMA table_info(${tableName})`);
    if (!Array.isArray(columns)) {
        console.error(`Unexpected response from PRAGMA table_info(${tableName}):`, columns);
        // Fallback to attempt adding the column anyway, as the table should exist.
        await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
        return;
    }
    const columnExists = columns.some(col => col.name === columnName);

    if (!columnExists) {
      console.log(`Adding column ${columnName} to table ${tableName}...`);
      await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    }
  } catch (error: any) {
    if (!error.message.includes('no such table')) {
      console.error(`Failed to check/add column ${columnName} to ${tableName}:`, error);
      throw error;
    }
  }
}

export async function getDb() {
  if (!db) {
    const dbPath = process.env.NODE_ENV === 'production' 
      ? '/tmp/greenview.db'
      : path.join(process.cwd(), 'greenview.db'); 

    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec('PRAGMA foreign_keys = ON;');

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
    
    // Perform non-destructive migrations for the devices table
    await addColumnIfNotExists(db, 'devices', 'hardwareIdentifier', 'TEXT');
    // Populate null hardwareIdentifiers to avoid issues with code expecting a value.
    // Using RANDOM() to ensure new values are unique enough to not violate potential future unique constraints.
    await db.run("UPDATE devices SET hardwareIdentifier = serialNumber || '_HWID_' || RANDOM() WHERE hardwareIdentifier IS NULL").catch((err: any) => {
      // This might fail on a brand new DB if the column was just added and has a UNIQUE constraint from the get-go.
      // It's safe to ignore this specific error.
      console.warn("Note: Could not run migration to populate missing hardwareIdentifier. This is expected on a fresh database.", err.message);
    });
    await addColumnIfNotExists(db, 'devices', 'isPoweredByBattery', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(db, 'devices', 'lastUpdateTimestamp', 'INTEGER');

    await db.run('CREATE INDEX IF NOT EXISTS idx_devices_userId ON devices (userId);');
    await db.run('CREATE INDEX IF NOT EXISTS idx_devices_hardwareIdentifier ON devices (hardwareIdentifier);');


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
    
    await addColumnIfNotExists(db, 'device_settings', 'notificationTemperatureLow', 'REAL DEFAULT 5');
    await addColumnIfNotExists(db, 'device_settings', 'notificationTemperatureHigh', 'REAL DEFAULT 35');
    await addColumnIfNotExists(db, 'device_settings', 'notificationSoilHumidityLow', 'REAL DEFAULT 20');
    await addColumnIfNotExists(db, 'device_settings', 'notificationAirHumidityLow', 'REAL DEFAULT 30');
    await addColumnIfNotExists(db, 'device_settings', 'notificationAirHumidityHigh', 'REAL DEFAULT 80');

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
    await db.run('CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_timestamp ON sensor_readings (deviceId, timestamp DESC);');
    await db.run('CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_type_timestamp ON sensor_readings (deviceId, type, timestamp DESC);');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        deviceId TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        isRead BOOLEAN DEFAULT FALSE,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (deviceId) REFERENCES devices(serialNumber) ON DELETE CASCADE
      );
    `);
    await db.run('CREATE INDEX IF NOT EXISTS idx_notifications_userId_isRead ON notifications (userId, isRead, timestamp DESC);');

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
  notificationTemperatureLow: 5,
  notificationTemperatureHigh: 35,
  notificationSoilHumidityLow: 20,
  notificationAirHumidityLow: 30,
  notificationAirHumidityHigh: 80,
};
