
import { NextResponse, type NextRequest } from 'next/server';
import { getDb, defaultDeviceSettings } from '@/lib/db';
import type { Device } from '@/lib/types';
import { z } from 'zod';

const deviceSchema = z.object({
  serialNumber: z.string().min(1, "Serial number is required"),
  hardwareIdentifier: z.string().min(1, "Hardware identifier is required"),
  name: z.string().min(1, "Device name is required"),
  plantType: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  isPoweredByBattery: z.boolean().default(false),
  userId: z.number().int().positive("User ID must be a positive integer"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = deviceSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid input', errors: validation.error.format() }, { status: 400 });
    }

    const { serialNumber, hardwareIdentifier, name, plantType, location, isPoweredByBattery, userId } = validation.data;

    const db = await getDb();

    const existingDeviceBySerial = await db.get('SELECT serialNumber FROM devices WHERE serialNumber = ?', serialNumber);
    if (existingDeviceBySerial) {
      return NextResponse.json({ message: 'Device with this serial number already exists' }, { status: 409 });
    }
    const existingDeviceByHwId = await db.get('SELECT hardwareIdentifier FROM devices WHERE hardwareIdentifier = ?', hardwareIdentifier);
    if (existingDeviceByHwId) {
      return NextResponse.json({ message: 'Device with this hardware identifier already exists' }, { status: 409 });
    }

    const activationDate = Date.now();
    const warrantyEndDate = activationDate + (365 * 24 * 60 * 60 * 1000); 

    await db.run(
      'INSERT INTO devices (serialNumber, userId, hardwareIdentifier, name, plantType, location, activationDate, warrantyEndDate, isActive, isPoweredByBattery) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      serialNumber,
      userId,
      hardwareIdentifier,
      name,
      plantType,
      location,
      activationDate,
      warrantyEndDate,
      true, 
      isPoweredByBattery
    );
    
    await db.run(
        `INSERT INTO device_settings (
            deviceId, measurementInterval, autoIrrigation, irrigationThreshold, 
            autoVentilation, temperatureThreshold, temperatureFanOffThreshold, 
            photoCaptureInterval, temperatureUnit,
            desiredLightState, desiredFanState, desiredIrrigationState, desiredUvLightState
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        serialNumber,
        defaultDeviceSettings.measurementInterval,
        defaultDeviceSettings.autoIrrigation,
        defaultDeviceSettings.irrigationThreshold,
        defaultDeviceSettings.autoVentilation,
        defaultDeviceSettings.temperatureThreshold,
        defaultDeviceSettings.temperatureFanOffThreshold,
        defaultDeviceSettings.photoCaptureInterval,
        defaultDeviceSettings.temperatureUnit,
        defaultDeviceSettings.desiredLightState,
        defaultDeviceSettings.desiredFanState,
        defaultDeviceSettings.desiredIrrigationState,
        defaultDeviceSettings.desiredUvLightState
    );
    
    const newDevice: Partial<Device> = { // Use Partial as userId is not part of Device type by default here
        serialNumber,
        hardwareIdentifier,
        name,
        plantType,
        location,
        activationDate,
        warrantyEndDate,
        isActive: true,
        isPoweredByBattery
    };

    return NextResponse.json({ message: 'Device registered successfully', device: newDevice }, { status: 201 });

  } catch (error: any) {
    console.error('Device registration error (API):', error);
     let errorMessage = 'An internal server error occurred during device registration.';
    if (error.message && typeof error.message === 'string' && error.message.includes('SQLITE_CONSTRAINT_UNIQUE')) {
        if (error.message.includes('devices.serialNumber')) {
            errorMessage = 'Device with this serial number already exists.';
        } else if (error.message.includes('devices.hardwareIdentifier')) {
            errorMessage = 'Device with this hardware identifier already exists.';
        } else {
            errorMessage = 'A unique constraint was violated during registration. Please check serial number and hardware identifier.';
        }
        return NextResponse.json({ message: errorMessage, details: error.message }, { status: 409 });
    }
    return NextResponse.json({ message: errorMessage, details: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get('userId');

  if (!userIdParam) {
    return NextResponse.json({ message: 'userId query parameter is required' }, { status: 400 });
  }
  const userId = parseInt(userIdParam, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ message: 'Invalid userId' }, { status: 400 });
  }

  try {
    const db = await getDb();
    const devices: Device[] = await db.all(
        'SELECT serialNumber, hardwareIdentifier, name, plantType, location, activationDate, warrantyEndDate, isActive, isPoweredByBattery, lastUpdateTimestamp FROM devices WHERE userId = ? ORDER BY name ASC', 
        userId
    );
    return NextResponse.json(devices, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching devices from API (server log):', error); 
    let clientErrorMessage = 'An internal server error occurred while fetching devices.';
    let errorDetails = error.message;

    if (error.message && typeof error.message === 'string' && error.message.toLowerCase().includes('sqlite_error')) {
      clientErrorMessage = 'A database error occurred while fetching devices.';
      if (error.message.toLowerCase().includes('no such column')) {
        clientErrorMessage = 'Database schema error: A required column is missing. The database might be outdated. If in a development environment, try regenerating the database file.';
      }
    }
    return NextResponse.json({ message: clientErrorMessage, details: errorDetails }, { status: 500 });
  }
}
