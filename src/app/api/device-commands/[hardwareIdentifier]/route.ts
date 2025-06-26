
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
    const settings = await db.get<DeviceSettings & { requestManualLightLevelReading?: boolean } >(
      `SELECT 
        measurementInterval, desiredLightState, desiredFanState, desiredIrrigationState, desiredUvLightState, 
        autoIrrigation, irrigationThreshold, autoVentilation, temperatureThreshold, temperatureFanOffThreshold,
        requestManualTemperatureReading, requestManualAirHumidityReading, requestManualSoilHumidityReading, requestManualLightLevelReading,
        autoRoofControl, roofOpenTime, roofCloseTime
      FROM device_settings WHERE deviceId = ?`,
      deviceId
    );

    if (!settings) {
      return NextResponse.json({ message: 'Device settings not found for this device' }, { status: 404 });
    }

    const mapStateToCommand = (state: boolean | undefined | null) => {
      if (state === undefined || state === null) return null;
      return state ? "ON" : "OFF";
    };

    const manualReadRequests: SensorType[] = [];
    
    // Check and add manual read requests
    if (settings.requestManualTemperatureReading) manualReadRequests.push(SensorType.TEMPERATURE);
    if (settings.requestManualAirHumidityReading) manualReadRequests.push(SensorType.AIR_HUMIDITY);
    if (settings.requestManualSoilHumidityReading) manualReadRequests.push(SensorType.SOIL_HUMIDITY);
    if (settings.requestManualLightLevelReading) manualReadRequests.push(SensorType.LIGHT);
    
    // Reset flags in database after fetching them
    if (manualReadRequests.length > 0) {
      const updates: string[] = [];
      if (settings.requestManualTemperatureReading) updates.push('requestManualTemperatureReading = FALSE');
      if (settings.requestManualAirHumidityReading) updates.push('requestManualAirHumidityReading = FALSE');
      if (settings.requestManualSoilHumidityReading) updates.push('requestManualSoilHumidityReading = FALSE');
      if (settings.requestManualLightLevelReading) updates.push('requestManualLightLevelReading = FALSE');
      
      if (updates.length > 0) {
        await db.run(`UPDATE device_settings SET ${updates.join(', ')} WHERE deviceId = ?`, deviceId);
      }
    }
    
    const responsePayload: any = {
      measurementIntervalMinutes: settings.measurementInterval,
      autoIrrigationEnabled: !!settings.autoIrrigation,
      irrigationThresholdPercent: settings.irrigationThreshold,
      autoVentilationEnabled: !!settings.autoVentilation,
      temperatureOnThresholdCelsius: settings.temperatureThreshold,
      temperatureOffThresholdCelsius: settings.temperatureFanOffThreshold,
      autoRoofEnabled: !!settings.autoRoofControl,
      roofOpenTime: settings.roofOpenTime,
      roofCloseTime: settings.roofCloseTime,
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
    return NextResponse.json({ message: 'An internal server error occurred while fetching device commands.' }, { status: 500 });
  }
}
