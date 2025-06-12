
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { Device, DeviceSettings } from '@/lib/types';

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

    const settings = await db.get<DeviceSettings>(
      'SELECT measurementInterval, desiredLightState, desiredFanState, desiredIrrigationState, desiredUvLightState, autoIrrigation, irrigationThreshold, autoVentilation, temperatureThreshold, temperatureFanOffThreshold FROM device_settings WHERE deviceId = ?',
      device.serialNumber
    );

    if (!settings) {
      // This case should ideally not happen if settings are created upon device registration
      return NextResponse.json({ message: 'Device settings not found' }, { status: 404 });
    }

    // Map boolean desired states to ON/OFF commands for Arduino simplicity
    const mapStateToCommand = (state: boolean | undefined | null) => {
      if (state === undefined || state === null) return null; // No explicit command
      return state ? "ON" : "OFF";
    };

    return NextResponse.json({
      measurementIntervalMinutes: settings.measurementInterval,
      autoIrrigationEnabled: !!settings.autoIrrigation, // Ensure boolean
      irrigationThresholdPercent: settings.irrigationThreshold,
      autoVentilationEnabled: !!settings.autoVentilation, // Ensure boolean
      temperatureOnThresholdCelsius: settings.temperatureThreshold, // Assuming Celsius for now
      temperatureOffThresholdCelsius: settings.temperatureFanOffThreshold,
      lightCommand: mapStateToCommand(settings.desiredLightState),
      fanCommand: mapStateToCommand(settings.desiredFanState),
      irrigationCommand: mapStateToCommand(settings.desiredIrrigationState),
      uvLightCommand: mapStateToCommand(settings.desiredUvLightState),
      // Add other relevant automation settings if Arduino needs them directly
    }, { status: 200 });

  } catch (error) {
    console.error(`Error fetching commands for hardwareId ${hardwareIdentifier}:`, error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
