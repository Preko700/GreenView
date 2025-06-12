
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { Device, DeviceSettings } from '@/lib/types';
import { SensorType } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { hardwareIdentifier: string } }
) {
  const hardwareIdentifier = params.hardwareIdentifier;

  if (!hardwareIdentifier) {
    return NextResponse.json({ message: 'Hardware identifier is required' }, { status: 400 });
  }

  try {
    const db = await getDb();
    const device = await db.get<Device>('SELECT serialNumber FROM devices WHERE hardwareIdentifier = ?', hardwareIdentifier);

    if (!device) {
      return NextResponse.json({ message: 'Device not found with this hardware identifier' }, { status: 404 });
    }

    const deviceId = device.serialNumber;

    // Fetch all settings, including new requestManual... flags
    const settings = await db.get<DeviceSettings>(
      `SELECT 
        measurementInterval, desiredLightState, desiredFanState, desiredIrrigationState, desiredUvLightState, 
        autoIrrigation, irrigationThreshold, autoVentilation, temperatureThreshold, temperatureFanOffThreshold,
        requestManualTemperatureReading, requestManualAirHumidityReading, requestManualSoilHumidityReading, requestManualLightLevelReading
      FROM device_settings WHERE deviceId = ?`,
      deviceId
    );

    if (!settings) {
      return NextResponse.json({ message: 'Device settings not found' }, { status: 404 });
    }

    const mapStateToCommand = (state: boolean | undefined | null) => {
      if (state === undefined || state === null) return null;
      return state ? "ON" : "OFF";
    };

    const manualReadRequests: SensorType[] = [];
    const updatesToFlags: string[] = [];
    const updateParams: (boolean | string)[] = [];

    if (settings.requestManualTemperatureReading) {
      manualReadRequests.push(SensorType.TEMPERATURE);
      updatesToFlags.push('requestManualTemperatureReading = ?');
      updateParams.push(false, deviceId);
    }
    if (settings.requestManualAirHumidityReading) {
      manualReadRequests.push(SensorType.AIR_HUMIDITY);
      updatesToFlags.push('requestManualAirHumidityReading = ?');
      updateParams.push(false, deviceId);
    }
    if (settings.requestManualSoilHumidityReading) {
      manualReadRequests.push(SensorType.SOIL_HUMIDITY);
      updatesToFlags.push('requestManualSoilHumidityReading = ?');
      updateParams.push(false, deviceId);
    }
    if (settings.requestManualLightLevelReading) {
      manualReadRequests.push(SensorType.LIGHT);
      updatesToFlags.push('requestManualLightLevelReading = ?');
      updateParams.push(false, deviceId);
    }

    // If there were manual read requests, clear their flags in the database
    if (updatesToFlags.length > 0) {
        // It's better to update all flags that were true in a single transaction or statement if possible.
        // For simplicity here, we'll do it sequentially, but in a high-traffic system, batching is preferred.
        // The current updateParams logic is a bit off for multiple updates in one go.
        // Let's reset them individually.
        if (settings.requestManualTemperatureReading) {
            await db.run('UPDATE device_settings SET requestManualTemperatureReading = ? WHERE deviceId = ?', false, deviceId);
        }
        if (settings.requestManualAirHumidityReading) {
            await db.run('UPDATE device_settings SET requestManualAirHumidityReading = ? WHERE deviceId = ?', false, deviceId);
        }
        if (settings.requestManualSoilHumidityReading) {
            await db.run('UPDATE device_settings SET requestManualSoilHumidityReading = ? WHERE deviceId = ?', false, deviceId);
        }
         if (settings.requestManualLightLevelReading) {
            await db.run('UPDATE device_settings SET requestManualLightLevelReading = ? WHERE deviceId = ?', false, deviceId);
        }
    }
    
    const responsePayload: any = {
      measurementIntervalMinutes: settings.measurementInterval,
      autoIrrigationEnabled: !!settings.autoIrrigation,
      irrigationThresholdPercent: settings.irrigationThreshold,
      autoVentilationEnabled: !!settings.autoVentilation,
      temperatureOnThresholdCelsius: settings.temperatureThreshold,
      temperatureOffThresholdCelsius: settings.temperatureFanOffThreshold,
      lightCommand: mapStateToCommand(settings.desiredLightState),
      fanCommand: mapStateToCommand(settings.desiredFanState),
      irrigationCommand: mapStateToCommand(settings.desiredIrrigationState),
      uvLightCommand: mapStateToCommand(settings.desiredUvLightState),
    };

    if (manualReadRequests.length > 0) {
      responsePayload.manualReadRequests = manualReadRequests;
    }

    return NextResponse.json(responsePayload, { status: 200 });

  } catch (error) {
    console.error(`Error fetching commands for hardwareId ${hardwareIdentifier}:`, error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
