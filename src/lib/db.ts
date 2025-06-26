
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import bcrypt from 'bcryptjs';
import type { DeviceSettings } from '@/lib/types';
import { TemperatureUnit } from '@/lib/types';

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

// Helper function to run a single column addition migration
const runMigration = async (db: Database, tableName: string, columnName:string, columnDefinition: string) => {
    try {
        const columns = await db.all(`PRAGMA table_info(${tableName});`);
        if (!columns.some(c => c.name === columnName)) {
            console.log(`DB_MIGRATE: Column '${columnName}' not found in '${tableName}'. Adding it now.`);
            await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
            console.log(`DB_MIGRATE: Column '${columnName}' added successfully to '${tableName}'.`);
        }
    } catch (error) {
        console.error(`DB_MIGRATE_ERROR: Failed to migrate column '${columnName}' for table '${tableName}'.`, error);
        // Don't re-throw to allow app to continue if possible.
    }
};

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

    // --- SCHEMA DEFINITIONS ---
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        country TEXT,
        registrationDate INTEGER,
        profileImageUrl TEXT
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        serialNumber TEXT PRIMARY KEY,
        userId INTEGER NOT NULL,
        hardwareIdentifier TEXT UNIQUE,
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
          desiredUvLightState BOOLEAN DEFAULT FALSE,
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

    // --- ROBUST MIGRATIONS ---
    console.log("DB: Running schema migrations if needed...");
    try {
        // Migration for the 'devices' table
        const deviceColumns = await db.all("PRAGMA table_info(devices);");
        if (!deviceColumns.some(c => c.name === 'hardwareIdentifier')) {
          console.log("DB_MIGRATE: 'devices' table is missing 'hardwareIdentifier'. Migrating...");
          await db.exec('ALTER TABLE devices ADD COLUMN hardwareIdentifier TEXT;');
          const devicesToUpdate = await db.all('SELECT serialNumber FROM devices WHERE hardwareIdentifier IS NULL;');
          for (const device of devicesToUpdate) {
              const newHwId = `${device.serialNumber}_HWID_${Date.now()}`;
              await db.run('UPDATE devices SET hardwareIdentifier = ? WHERE serialNumber = ?', newHwId, device.serialNumber);
          }
          await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_hardwareIdentifier ON devices (hardwareIdentifier);');
          console.log(`DB_MIGRATE: 'hardwareIdentifier' column added, populated for ${devicesToUpdate.length} devices, and indexed.`);
        }

        // Migrations for the 'device_settings' table
        await runMigration(db, 'device_settings', 'requestManualTemperatureReading', 'BOOLEAN DEFAULT FALSE');
        await runMigration(db, 'device_settings', 'requestManualAirHumidityReading', 'BOOLEAN DEFAULT FALSE');
        await runMigration(db, 'device_settings', 'requestManualSoilHumidityReading', 'BOOLEAN DEFAULT FALSE');
        await runMigration(db, 'device_settings', 'requestManualLightLevelReading', 'BOOLEAN DEFAULT FALSE');
        
        console.log("DB: Migrations check completed.");
    } catch (migrationError) {
        console.error("DB_MIGRATE_FATAL: A critical error occurred during the migration process.", migrationError);
    }
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
};
