
import { NextResponse, type NextRequest } from 'next/server';
import { getDb, defaultDeviceSettings } from '@/lib/db';
import type { DeviceSettings } from '@/lib/types';
import { TemperatureUnit } from '@/lib/types';
import { z } from "zod";

const deviceSettingsSchema = z.object({
  measurementInterval: z.coerce.number().min(1).max(60),
  autoIrrigation: z.boolean(),
  irrigationThreshold: z.coerce.number().min(10).max(90),
  autoVentilation: z.boolean(),
  temperatureThreshold: z.coerce.number().min(0).max(50),
  temperatureFanOffThreshold: z.coerce.number().min(0).max(49), // Should be less than ON threshold
  photoCaptureInterval: z.coerce.number().min(1).max(24),
  temperatureUnit: z.nativeEnum(TemperatureUnit),
  // userId is needed for authorization check when saving, but not part of the settings object itself
  userId: z.number().int().positive().optional(), 
});


export async function GET(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  const deviceId = params.deviceId;
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get('userId');


  if (!userIdParam) {
    return NextResponse.json({ message: 'userId query parameter is required for authorization' }, { status: 400 });
  }
  const userId = parseInt(userIdParam, 10);
   if (isNaN(userId)) {
    return NextResponse.json({ message: 'Invalid userId' }, { status: 400 });
  }


  if (!deviceId) {
    return NextResponse.json({ message: 'deviceId is required' }, { status: 400 });
  }

  try {
    const db = await getDb();
    // First, verify the device belongs to the user
    const deviceOwner = await db.get('SELECT userId FROM devices WHERE serialNumber = ?', deviceId);
    if (!deviceOwner || deviceOwner.userId !== userId) {
        return NextResponse.json({ message: 'Device not found or not authorized for this user' }, { status: 403 });
    }


    const settings: DeviceSettings | undefined = await db.get(
      'SELECT * FROM device_settings WHERE deviceId = ?',
      deviceId
    );

    if (settings) {
      // Ensure boolean values are correctly interpreted from DB (0/1)
      return NextResponse.json({
        ...settings,
        autoIrrigation: !!settings.autoIrrigation,
        autoVentilation: !!settings.autoVentilation,
      }, { status: 200 });
    } else {
      // RF-004: Return default settings if none exist for the device
      // The default values are mostly handled by the table DDL, but we can explicitly return them here
      // or rely on the client to use its own defaults if API returns 404.
      // For consistency, let's return them.
      return NextResponse.json({ deviceId, ...defaultDeviceSettings }, { status: 200 });
    }
  } catch (error) {
    console.error(`Error fetching settings for device ${deviceId}:`, error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  const deviceId = params.deviceId;

  if (!deviceId) {
    return NextResponse.json({ message: 'deviceId is required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    
    // Validate incoming data (including userId for auth check)
    const validation = deviceSettingsSchema.extend({
        userId: z.number().int().positive("User ID is required in request body for saving settings"),
    }).safeParse(body);


    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid input', errors: validation.error.format() }, { status: 400 });
    }
    
    const { userId, ...settingsToSave } = validation.data;

    const db = await getDb();

    // Authorization: Check if the device belongs to the user trying to save settings
    const deviceOwner = await db.get('SELECT userId FROM devices WHERE serialNumber = ?', deviceId);
    if (!deviceOwner || deviceOwner.userId !== userId) {
        return NextResponse.json({ message: 'Device not found or not authorized to change settings' }, { status: 403 });
    }
    
    // Ensure temperatureFanOffThreshold is less than temperatureThreshold
    if (settingsToSave.temperatureFanOffThreshold >= settingsToSave.temperatureThreshold) {
        return NextResponse.json({ message: 'Ventilation Temp Off threshold must be less than Ventilation Temp On threshold.' }, { status: 400 });
    }


    await db.run(
      `INSERT OR REPLACE INTO device_settings (
        deviceId, measurementInterval, autoIrrigation, irrigationThreshold, 
        autoVentilation, temperatureThreshold, temperatureFanOffThreshold, 
        photoCaptureInterval, temperatureUnit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      deviceId,
      settingsToSave.measurementInterval,
      settingsToSave.autoIrrigation,
      settingsToSave.irrigationThreshold,
      settingsToSave.autoVentilation,
      settingsToSave.temperatureThreshold,
      settingsToSave.temperatureFanOffThreshold,
      settingsToSave.photoCaptureInterval,
      settingsToSave.temperatureUnit
    );

    return NextResponse.json({ message: 'Device settings saved successfully', settings: { deviceId, ...settingsToSave} }, { status: 200 });

  } catch (error) {
    console.error(`Error saving settings for device ${deviceId}:`, error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Invalid input data', errors: error.format() }, { status: 400 });
    }
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
