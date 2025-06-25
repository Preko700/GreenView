
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import bcrypt from 'bcryptjs';
import type { DeviceSettings } from '@/lib/types';
import { TemperatureUnit } from '@/lib/types';

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

async function addColumnIfNotExists(
  db: Database,
  tableName: string,
  columnName: string,
  columnDefinition: string
) {
  const column = await db.get(`PRAGMA table_info(${tableName})`).then(info => 
    (info as any[]).find(col => col.name === columnName)
  );

  if (!column) {
    await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
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
    await db.exec('PRAGMA foreign_keys = ON;'); // Enable foreign key constraints

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
          desiredUvLightState BOOLEAN DEFAULT FALSE,
          requestManualTemperatureReading BOOLEAN DEFAULT FALSE,
          requestManualAirHumidityReading BOOLEAN DEFAULT FALSE,
          requestManualSoilHumidityReading BOOLEAN DEFAULT FALSE,
          requestManualLightLevelReading BOOLEAN DEFAULT FALSE,
          notificationTemperatureLow REAL DEFAULT 5,
          notificationTemperatureHigh REAL DEFAULT 35,
          notificationSoilHumidityLow REAL DEFAULT 20,
          notificationAirHumidityLow REAL DEFAULT 30,
          notificationAirHumidityHigh REAL DEFAULT 80,
          FOREIGN KEY (deviceId) REFERENCES devices(serialNumber) ON DELETE CASCADE
      );
    `);
    
    // Add columns for roof control if they don't exist
    await addColumnIfNotExists(db, 'device_settings', 'autoRoofControl', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists(db, 'device_settings', 'roofOpenTime', `TEXT DEFAULT '07:00'`);
    await addColumnIfNotExists(db, 'device_settings', 'roofCloseTime', `TEXT DEFAULT '20:00'`);


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
    
    // New notifications table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        deviceId TEXT NOT NULL,
        type TEXT NOT NULL, -- 'CRITICAL', 'WARNING', 'INFO'
        message TEXT NOT NULL,
        isRead BOOLEAN DEFAULT FALSE,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (deviceId) REFERENCES devices(serialNumber) ON DELETE CASCADE
      );
    `);
    await db.run('CREATE INDEX IF NOT EXISTS idx_notifications_userId_isRead ON notifications (userId, isRead, timestamp DESC);');


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
  desiredUvLightState: false,
  requestManualTemperatureReading: false,
  requestManualAirHumidityReading: false,
  requestManualSoilHumidityReading: false,
  requestManualLightLevelReading: false,
  notificationTemperatureLow: 5,
  notificationTemperatureHigh: 35,
  notificationSoilHumidityLow: 20,
  notificationAirHumidityLow: 30,
  notificationAirHumidityHigh: 80,
  autoRoofControl: false,
  roofOpenTime: '07:00',
  roofCloseTime: '20:00',
};
