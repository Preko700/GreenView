
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { SensorType } from '@/lib/types';
import { z } from 'zod';

const requestManualReadingSchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
  userId: z.number().int().positive("User ID is required"),
  sensorType: z.nativeEnum(SensorType, { errorMap: () => ({ message: "Invalid sensor type specified." }) }),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = requestManualReadingSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid input', errors: validation.error.format() }, { status: 400 });
    }

    const { deviceId, userId, sensorType } = validation.data;

    const db = await getDb();

    // Authorization: Check if the device belongs to the user
    const deviceOwner = await db.get('SELECT userId FROM devices WHERE serialNumber = ?', deviceId);
    if (!deviceOwner || deviceOwner.userId !== userId) {
      return NextResponse.json({ message: 'Device not found or not authorized' }, { status: 403 });
    }

    let fieldToUpdate = '';
    switch (sensorType) {
      case SensorType.TEMPERATURE:
        fieldToUpdate = 'requestManualTemperatureReading';
        break;
      case SensorType.AIR_HUMIDITY:
        fieldToUpdate = 'requestManualAirHumidityReading';
        break;
      case SensorType.SOIL_HUMIDITY:
        fieldToUpdate = 'requestManualSoilHumidityReading';
        break;
      case SensorType.LIGHT:
        fieldToUpdate = 'requestManualLightLevelReading';
        break;
      // Add cases for PH, WATER_LEVEL if you want to support manual requests for them
      // case SensorType.PH:
      //   fieldToUpdate = 'requestManualPhReading';
      //   break;
      // case SensorType.WATER_LEVEL:
      //   fieldToUpdate = 'requestManualWaterLevelReading';
      //   break;
      default:
        return NextResponse.json({ message: `Manual reading for sensor type '${sensorType}' is not supported.` }, { status: 400 });
    }

    const result = await db.run(
      `UPDATE device_settings SET ${fieldToUpdate} = ? WHERE deviceId = ?`,
      true, // Set the flag to true
      deviceId
    );

    if (result.changes === 0) {
      // This might happen if device_settings row doesn't exist, though it should be created with device registration
      return NextResponse.json({ message: 'Device settings not found or no change made. Ensure device is registered.' }, { status: 404 });
    }
    
    // Update device's lastUpdateTimestamp as a general activity marker
    await db.run('UPDATE devices SET lastUpdateTimestamp = ? WHERE serialNumber = ?', Date.now(), deviceId);

    return NextResponse.json({ message: `Manual reading request for ${sensorType.toLowerCase()} sent successfully. The device will perform the reading on its next command poll.` }, { status: 200 });

  } catch (error) {
    console.error('Error requesting manual sensor reading:', error);
    if (error instanceof z.ZodError) { // Should not happen if validation.success is false
      return NextResponse.json({ message: 'Invalid input data validation error post-check.', errors: error.format() }, { status: 400 });
    }
    return NextResponse.json({ message: 'An internal server error occurred while requesting manual sensor reading.' }, { status: 500 });
  }
}
