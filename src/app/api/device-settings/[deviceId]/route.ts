
import { NextResponse, type NextRequest } from 'next/server';
import { getDb, defaultDeviceSettings } from '@/lib/db';
import type { DeviceSettings } from '@/lib/types';
import { TemperatureUnit } from '@/lib/types';
import { z } from "zod";

// This schema is for validating data sent from the settings page
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
    const deviceOwner = await db.get('SELECT userId FROM devices WHERE serialNumber = ?', deviceId);
    if (!deviceOwner || deviceOwner.userId !== userId) {
        return NextResponse.json({ message: 'Device not found or not authorized for this user' }, { status: 403 });
    }

    const settingsRow = await db.get(
      'SELECT * FROM device_settings WHERE deviceId = ?',
      deviceId
    );

    if (settingsRow) {
      // Ensure boolean values are correctly interpreted from DB (0/1)
      const typedSettings: DeviceSettings = {
        deviceId: settingsRow.deviceId,
        measurementInterval: settingsRow.measurementInterval,
        autoIrrigation: !!settingsRow.autoIrrigation,
        irrigationThreshold: settingsRow.irrigationThreshold,
        autoVentilation: !!settingsRow.autoVentilation,
        temperatureThreshold: settingsRow.temperatureThreshold,
        temperatureFanOffThreshold: settingsRow.temperatureFanOffThreshold,
        photoCaptureInterval: settingsRow.photoCaptureInterval,
        temperatureUnit: settingsRow.temperatureUnit as TemperatureUnit,
        desiredLightState: !!settingsRow.desiredLightState,
        desiredFanState: !!settingsRow.desiredFanState,
        desiredIrrigationState: !!settingsRow.desiredIrrigationState,
        desiredUvLightState: !!settingsRow.desiredUvLightState,
      };
      return NextResponse.json(typedSettings, { status: 200 });
    } else {
      // This case should not happen if defaults are set on device registration
      // But as a fallback, return full default structure
      const fullDefaults: DeviceSettings = {
        deviceId,
        ...defaultDeviceSettings // This now includes desired states as false
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
  const currentDeviceId = params.deviceId; // Renamed to avoid conflict with deviceId in body

  if (!currentDeviceId) {
    return NextResponse.json({ message: 'deviceId parameter is required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    
    const validation = deviceSettingsUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid input', errors: validation.error.format() }, { status: 400 });
    }
    
    // Exclude userId from settingsToSave as it's only for auth
    // desired...State fields are NOT updated here; they are managed by /api/device-control
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userId, ...settingsToSave } = validation.data;

    const db = await getDb();

    const deviceOwner = await db.get('SELECT userId FROM devices WHERE serialNumber = ?', currentDeviceId);
    if (!deviceOwner || deviceOwner.userId !== userId) {
        return NextResponse.json({ message: 'Device not found or not authorized to change settings' }, { status: 403 });
    }
    
    if (settingsToSave.temperatureFanOffThreshold >= settingsToSave.temperatureThreshold) {
        return NextResponse.json({ message: 'Ventilation Temp Off threshold must be less than Ventilation Temp On threshold.' }, { status: 400 });
    }

    // Update only the fields relevant to user-configurable settings
    // desired...State fields are intentionally omitted here.
    await db.run(
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

    // Fetch the complete updated settings to return, including desired states which were not modified by this call
    const updatedSettings = await db.get('SELECT * FROM device_settings WHERE deviceId = ?', currentDeviceId);
     if (!updatedSettings) {
        return NextResponse.json({ message: 'Failed to retrieve updated settings' }, { status: 500 });
    }
     const typedUpdatedSettings: DeviceSettings = {
        deviceId: updatedSettings.deviceId,
        measurementInterval: updatedSettings.measurementInterval,
        autoIrrigation: !!updatedSettings.autoIrrigation,
        irrigationThreshold: updatedSettings.irrigationThreshold,
        autoVentilation: !!updatedSettings.autoVentilation,
        temperatureThreshold: updatedSettings.temperatureThreshold,
        temperatureFanOffThreshold: updatedSettings.temperatureFanOffThreshold,
        photoCaptureInterval: updatedSettings.photoCaptureInterval,
        temperatureUnit: updatedSettings.temperatureUnit as TemperatureUnit,
        desiredLightState: !!updatedSettings.desiredLightState,
        desiredFanState: !!updatedSettings.desiredFanState,
        desiredIrrigationState: !!updatedSettings.desiredIrrigationState,
        desiredUvLightState: !!updatedSettings.desiredUvLightState,
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
