
import { NextResponse, type NextRequest } from 'next/server';
import { getDb, defaultDeviceSettings } from '@/lib/db';
import type { Device } from '@/lib/types';
import { z } from 'zod';

const deviceSchema = z.object({
  serialNumber: z.string().min(1, "Serial number is required"),
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

    const db = await getDb();

    // Check if device with this serial number already exists
    const existingDevice = await db.get('SELECT serialNumber FROM devices WHERE serialNumber = ?', serialNumber);
    if (existingDevice) {
      return NextResponse.json({ message: 'Device with this serial number already exists' }, { status: 409 });
    }

    const activationDate = Date.now();
    // For warranty, let's assume 1 year from activation by default
    const warrantyEndDate = activationDate + (365 * 24 * 60 * 60 * 1000); 

    await db.run(
      'INSERT INTO devices (serialNumber, userId, name, plantType, location, activationDate, warrantyEndDate, isActive, isPoweredByBattery) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      serialNumber,
      userId,
      name,
      plantType,
      location,
      activationDate,
      warrantyEndDate,
      true, // isActive by default
      isPoweredByBattery
    );

    // RF-004: Apply default settings for the new device
    await db.run(
        'INSERT INTO device_settings (deviceId, measurementInterval, autoIrrigation, irrigationThreshold, autoVentilation, temperatureThreshold, temperatureFanOffThreshold, photoCaptureInterval, temperatureUnit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        serialNumber,
        defaultDeviceSettings.measurementInterval,
        defaultDeviceSettings.autoIrrigation,
        defaultDeviceSettings.irrigationThreshold,
        defaultDeviceSettings.autoVentilation,
        defaultDeviceSettings.temperatureThreshold,
        defaultDeviceSettings.temperatureFanOffThreshold,
        defaultDeviceSettings.photoCaptureInterval,
        defaultDeviceSettings.temperatureUnit
    );
    
    const newDevice: Device = {
        serialNumber,
        name,
        plantType,
        location,
        activationDate,
        warrantyEndDate,
        isActive: true,
        isPoweredByBattery
    };

    return NextResponse.json({ message: 'Device registered successfully', device: newDevice }, { status: 201 });

  } catch (error) {
    console.error('Device registration error:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get('userId');

  if (!userIdParam) {
    return NextResponse.json({ message: 'userId is required' }, { status: 400 });
  }
  const userId = parseInt(userIdParam, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ message: 'Invalid userId' }, { status: 400 });
  }

  try {
    const db = await getDb();
    const devices: Device[] = await db.all('SELECT serialNumber, name, plantType, location, activationDate, warrantyEndDate, isActive, isPoweredByBattery FROM devices WHERE userId = ?', userId);
    return NextResponse.json(devices, { status: 200 });
  } catch (error) {
    console.error('Error fetching devices:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
