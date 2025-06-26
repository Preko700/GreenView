
import { NextResponse, type NextRequest } from 'next/server';
import { getDb, defaultDeviceSettings } from '@/lib/db';
import type { Device } from '@/lib/types';
import { z } from 'zod';

const deviceSchema = z.object({
  serialNumber: z.string().min(1, "Serial number is required"),
  hardwareIdentifier: z.string().min(1, "Hardware identifier is required").optional(),
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

    const { serialNumber, name, plantType, location, isPoweredByBattery, userId } = validation.data;
    const hardwareIdentifier = validation.data.hardwareIdentifier || `${serialNumber}_HWID_${Date.now()}`;

    const db = await getDb();

    const existingDeviceBySerial = await db.get('SELECT serialNumber FROM devices WHERE serialNumber = ?', serialNumber);
    if (existingDeviceBySerial) {
      return NextResponse.json({ message: 'Device with this serial number already exists' }, { status: 409 });
    }
    const existingDeviceByHwId = await db.get('SELECT hardwareIdentifier FROM devices WHERE hardwareIdentifier = ?', hardwareIdentifier);
    if (existingDeviceByHwId) {
      return NextResponse.json({ message: 'Device with this hardware identifier already exists or generated ID collided.' }, { status: 409 });
    }

    const activationDate = Date.now();
    const warrantyEndDate = activationDate + (365 * 24 * 60 * 60 * 1000);

    await db.run(
      'INSERT INTO devices (serialNumber, userId, hardwareIdentifier, name, plantType, location, activationDate, warrantyEndDate, isActive, isPoweredByBattery, lastUpdateTimestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      serialNumber,
      userId,
      hardwareIdentifier,
      name,
      plantType,
      location,
      activationDate,
      warrantyEndDate,
      true,
      isPoweredByBattery,
      null
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

    const newDevice: Partial<Device> = {
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
    let errorDetails = error.message;
    if (error.message && typeof error.message === 'string' && error.message.includes('SQLITE_CONSTRAINT_UNIQUE')) {
        if (error.message.includes('devices.serialNumber')) {
            errorMessage = 'Device with this serial number already exists.';
        } else if (error.message.includes('devices.hardwareIdentifier')) {
            errorMessage = 'Device with this hardware identifier already exists.';
        } else {
            errorMessage = 'A unique constraint was violated during registration. Please check serial number and hardware identifier.';
        }
        return NextResponse.json({ message: errorMessage, details: errorDetails }, { status: 409 });
    }
    return NextResponse.json({ message: errorMessage, details: errorDetails }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get('userId');
  const hardwareIdentifierParam = searchParams.get('hardwareIdentifier');

  if (!userIdParam) {
    return NextResponse.json({ message: 'userId query parameter is required' }, { status: 400 });
  }
  const userId = parseInt(userIdParam, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ message: 'Invalid userId' }, { status: 400 });
  }

  let sqlQuery: string;
  const queryParams: (string | number)[] = [userId];

  if (hardwareIdentifierParam) {
    sqlQuery = 'SELECT serialNumber, hardwareIdentifier, name, plantType, location, activationDate, warrantyEndDate, isActive, isPoweredByBattery, lastUpdateTimestamp FROM devices WHERE userId = ? AND hardwareIdentifier = ?';
    queryParams.push(hardwareIdentifierParam);
  } else {
    sqlQuery = 'SELECT serialNumber, hardwareIdentifier, name, plantType, location, activationDate, warrantyEndDate, isActive, isPoweredByBattery, lastUpdateTimestamp FROM devices WHERE userId = ? ORDER BY name ASC';
  }

  try {
    const db = await getDb();
    if (hardwareIdentifierParam) {
      const device: Device | undefined = await db.get(sqlQuery, ...queryParams);
      if (device) {
        return NextResponse.json(device, { status: 200 });
      } else {
        return NextResponse.json({ message: 'Device not found with the specified hardwareIdentifier for this user' }, { status: 404 });
      }
    } else {
      const devices: Device[] = await db.all(sqlQuery, ...queryParams);
      return NextResponse.json(devices, { status: 200 });
    }
  } catch (error: any) {
    console.error(`Error fetching devices from API (server log): Query was: ${sqlQuery}. Error:`, error.message, error.stack);
    
    let clientErrorMessage = 'An internal server error occurred while fetching devices.';
    
    if (error.message && typeof error.message === 'string' && error.message.toLowerCase().includes('no such column')) {
        clientErrorMessage = `Database schema error: A required column is missing. The database might be outdated. Please delete the 'greenview.db' file in your project and restart the app. Original error: ${error.message}`;
    }
    
    return NextResponse.json({ message: clientErrorMessage, details: error.message }, { status: 500 });
  }
}
    
