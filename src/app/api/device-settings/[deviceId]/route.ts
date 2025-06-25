
import { NextResponse, type NextRequest } from 'next/server';
import { getDb, defaultDeviceSettings } from '@/lib/db';
import type { DeviceSettings } from '@/lib/types';
import { TemperatureUnit } from '@/lib/types';
import { z } from "zod";

// This schema is for validating data sent from the settings page
const deviceSettingsUpdateSchema = z.object({
  // Automation settings
  measurementInterval: z.coerce.number().min(1).max(60),
  autoIrrigation: z.boolean(),
  irrigationThreshold: z.coerce.number().min(10).max(90),
  autoVentilation: z.boolean(),
  temperatureThreshold: z.coerce.number().min(0).max(50),
  temperatureFanOffThreshold: z.coerce.number().min(0).max(49),
  photoCaptureInterval: z.coerce.number().min(1).max(24),
  temperatureUnit: z.nativeEnum(TemperatureUnit),
  // Notification settings
  notificationTemperatureLow: z.coerce.number().min(-50).max(50),
  notificationTemperatureHigh: z.coerce.number().min(-50).max(50),
  notificationSoilHumidityLow: z.coerce.number().min(0).max(100),
  notificationAirHumidityLow: z.coerce.number().min(0).max(100),
  notificationAirHumidityHigh: z.coerce.number().min(0).max(100),
  // Roof control settings
  autoRoofControl: z.boolean(),
  roofOpenTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  roofCloseTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  // Auth
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

    const settingsRow = await db.get<DeviceSettings>(
      'SELECT * FROM device_settings WHERE deviceId = ?',
      deviceId
    );

    if (settingsRow) {
      // Ensure boolean values are correctly interpreted from DB (0/1)
      const typedSettings: DeviceSettings = {
        ...defaultDeviceSettings, // Start with defaults to ensure all keys are present
        ...settingsRow,
        deviceId: settingsRow.deviceId,
        autoIrrigation: !!settingsRow.autoIrrigation,
        autoVentilation: !!settingsRow.autoVentilation,
        desiredLightState: !!settingsRow.desiredLightState,
        desiredFanState: !!settingsRow.desiredFanState,
        desiredIrrigationState: !!settingsRow.desiredIrrigationState,
        desiredUvLightState: !!settingsRow.desiredUvLightState,
        autoRoofControl: !!settingsRow.autoRoofControl,
      };
      return NextResponse.json(typedSettings, { status: 200 });
    } else {
      // This case should not happen if defaults are set on device registration
      // But as a fallback, return full default structure
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

    const deviceOwner = await db.get('SELECT userId FROM devices WHERE serialNumber = ?', currentDeviceId);
    if (!deviceOwner || deviceOwner.userId !== userId) {
        return NextResponse.json({ message: 'Device not found or not authorized to change settings' }, { status: 403 });
    }
    
    if (settingsToSave.temperatureFanOffThreshold >= settingsToSave.temperatureThreshold) {
        return NextResponse.json({ message: 'Ventilation Temp Off threshold must be less than Ventilation Temp On threshold.' }, { status: 400 });
    }
    if (settingsToSave.notificationTemperatureLow >= settingsToSave.notificationTemperatureHigh) {
        return NextResponse.json({ message: 'Low temperature alert threshold must be less than high temperature alert threshold.' }, { status: 400 });
    }
     if (settingsToSave.notificationAirHumidityLow >= settingsToSave.notificationAirHumidityHigh) {
        return NextResponse.json({ message: 'Low air humidity alert threshold must be less than high air humidity alert threshold.' }, { status: 400 });
    }

    const result = await db.run(
      `UPDATE device_settings SET 
        measurementInterval = ?, autoIrrigation = ?, irrigationThreshold = ?, 
        autoVentilation = ?, temperatureThreshold = ?, temperatureFanOffThreshold = ?, 
        photoCaptureInterval = ?, temperatureUnit = ?,
        notificationTemperatureLow = ?, notificationTemperatureHigh = ?,
        notificationSoilHumidityLow = ?, notificationAirHumidityLow = ?,
        notificationAirHumidityHigh = ?,
        autoRoofControl = ?, roofOpenTime = ?, roofCloseTime = ?
      WHERE deviceId = ?`,
      settingsToSave.measurementInterval,
      settingsToSave.autoIrrigation,
      settingsToSave.irrigationThreshold,
      settingsToSave.autoVentilation,
      settingsToSave.temperatureThreshold,
      settingsToSave.temperatureFanOffThreshold,
      settingsToSave.photoCaptureInterval,
      settingsToSave.temperatureUnit,
      settingsToSave.notificationTemperatureLow,
      settingsToSave.notificationTemperatureHigh,
      settingsToSave.notificationSoilHumidityLow,
      settingsToSave.notificationAirHumidityLow,
      settingsToSave.notificationAirHumidityHigh,
      settingsToSave.autoRoofControl,
      settingsToSave.roofOpenTime,
      settingsToSave.roofCloseTime,
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
        desiredUvLightState: !!updatedSettings.desiredUvLightState,
        autoRoofControl: !!updatedSettings.autoRoofControl,
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
