
import { NextResponse, type NextRequest } from 'next/server';
import { getDb, defaultDeviceSettings } from '@/lib/db';
import type { DeviceSettings } from '@/lib/types';
import { TemperatureUnit } from '@/lib/types';
import { z } from "zod";

const deviceSettingsUpdateSchema = z.object({
  measurementInterval: z.coerce.number().min(1).max(60),
  autoIrrigation: z.boolean(),
  irrigationThreshold: z.coerce.number().min(10).max(90),
  autoVentilation: z.boolean(),
  temperatureThreshold: z.coerce.number().min(0).max(50),
  temperatureFanOffThreshold: z.coerce.number().min(0).max(49),
  photoCaptureInterval: z.coerce.number().min(1).max(24),
  temperatureUnit: z.nativeEnum(TemperatureUnit),
  userId: z.number().int().positive("User ID is required in request body for saving settings"), 
})
.refine(data => data.temperatureFanOffThreshold < data.temperatureThreshold, {
    message: "Ventilation Temp Off must be less than Temp On threshold.",
    path: ["temperatureFanOffThreshold"],
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
    const deviceOwner = await db.get('SELECT userId FROM devices WHERE serialNumber = ? AND userId = ?', deviceId, userId);
    if (!deviceOwner) {
        return NextResponse.json({ message: 'Device not found or not authorized for this user' }, { status: 403 });
    }

    const settingsRow = await db.get<DeviceSettings>(
      'SELECT * FROM device_settings WHERE deviceId = ?',
      deviceId
    );

    if (settingsRow) {
      const typedSettings: DeviceSettings = {
        ...defaultDeviceSettings,
        ...settingsRow,
        deviceId: settingsRow.deviceId,
        autoIrrigation: !!settingsRow.autoIrrigation,
        autoVentilation: !!settingsRow.autoVentilation,
        desiredLightState: !!settingsRow.desiredLightState,
        desiredFanState: !!settingsRow.desiredFanState,
        desiredIrrigationState: !!settingsRow.desiredIrrigationState,
      };
      return NextResponse.json(typedSettings, { status: 200 });
    } else {
      const fullDefaults: DeviceSettings = {
        deviceId,
        ...defaultDeviceSettings
      };
      return NextResponse.json(fullDefaults, { status: 200 });
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
  const currentDeviceId = params.deviceId; 

  if (!currentDeviceId) {
    return NextResponse.json({ message: 'deviceId parameter is required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    
    const validation = deviceSettingsUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid input', errors: validation.error.format() }, { status: 400 });
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userId, ...settingsToSave } = validation.data;

    const db = await getDb();

    const deviceOwner = await db.get('SELECT userId FROM devices WHERE serialNumber = ? AND userId = ?', currentDeviceId, userId);
    if (!deviceOwner) {
        return NextResponse.json({ message: 'Device not found or not authorized to change settings' }, { status: 403 });
    }
    
    const result = await db.run(
      `UPDATE device_settings SET 
        measurementInterval = ?, autoIrrigation = ?, irrigationThreshold = ?, 
        autoVentilation = ?, temperatureThreshold = ?, temperatureFanOffThreshold = ?, 
        photoCaptureInterval = ?, temperatureUnit = ?
      WHERE deviceId = ?`,
      settingsToSave.measurementInterval,
      settingsToSave.autoIrrigation,
      settingsToSave.irrigationThreshold,
      settingsToSave.autoVentilation,
      settingsToSave.temperatureThreshold,
      settingsToSave.temperatureFanOffThreshold,
      settingsToSave.photoCaptureInterval,
      settingsToSave.temperatureUnit,
      currentDeviceId
    );

    if (result.changes === 0) {
      return NextResponse.json({ message: 'Device settings not found or no change was made.' }, { status: 404 });
    }

    const updatedSettings = await db.get<DeviceSettings>('SELECT * FROM device_settings WHERE deviceId = ?', currentDeviceId);
     if (!updatedSettings) {
        return NextResponse.json({ message: 'Failed to retrieve updated settings' }, { status: 500 });
    }
    
    const typedUpdatedSettings: DeviceSettings = {
        ...updatedSettings,
        autoIrrigation: !!updatedSettings.autoIrrigation,
        autoVentilation: !!updatedSettings.autoVentilation,
        desiredLightState: !!updatedSettings.desiredLightState,
        desiredFanState: !!updatedSettings.desiredFanState,
        desiredIrrigationState: !!updatedSettings.desiredIrrigationState,
      };

    return NextResponse.json({ message: 'Device settings saved successfully', settings: typedUpdatedSettings }, { status: 200 });

  } catch (error) {
    console.error(`Error saving settings for device ${currentDeviceId}:`, error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Invalid input data', errors: error.format() }, { status: 400 });
    }
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
