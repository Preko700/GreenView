
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { SensorReading, Device } from '@/lib/types';
import { SensorType } from '@/lib/types';
import { z } from 'zod';

const sensorReadingSchema = z.object({
  hardwareId: z.string().min(1, "Hardware ID is required"),
  temperature: z.number().optional(),
  airHumidity: z.number().optional(),
  soilHumidity: z.number().min(0).max(100).optional(), // Percentage
  lightLevel: z.number().optional(),
  waterLevel: z.union([z.literal(0), z.literal(1)]).optional(), // 0 for LOW, 1 for HIGH
});

type SensorPayload = z.infer<typeof sensorReadingSchema>;

export async function POST(request: NextRequest) {
  try {
    const payload: SensorPayload | SensorPayload[] = await request.json();
    const readingsToInsert: Omit<SensorReading, 'id' | 'timestamp' | 'unit'>[] = [];
    const now = Date.now();
    const db = await getDb();

    const processPayloadItem = async (item: SensorPayload) => {
      const validation = sensorReadingSchema.safeParse(item);
      if (!validation.success) {
        // Log error for this item but continue with others if it's an array
        console.warn('Invalid sensor data item received:', validation.error.format());
        return; 
      }
      const { hardwareId, temperature, airHumidity, soilHumidity, lightLevel, waterLevel } = validation.data;

      const device = await db.get<Device>('SELECT serialNumber FROM devices WHERE hardwareIdentifier = ?', hardwareId);
      if (!device) {
        console.warn(`Device with hardwareId ${hardwareId} not found. Skipping sensor data.`);
        return;
      }
      const deviceId = device.serialNumber;

      if (temperature !== undefined) {
        readingsToInsert.push({ deviceId, type: SensorType.TEMPERATURE, value: temperature, unit: '°C' });
      }
      if (airHumidity !== undefined) {
        readingsToInsert.push({ deviceId, type: SensorType.AIR_HUMIDITY, value: airHumidity, unit: '%' });
      }
      if (soilHumidity !== undefined) {
        readingsToInsert.push({ deviceId, type: SensorType.SOIL_HUMIDITY, value: soilHumidity, unit: '%' });
      }
      if (lightLevel !== undefined) {
        readingsToInsert.push({ deviceId, type: SensorType.LIGHT, value: lightLevel, unit: 'lux' }); // Assuming lux
      }
      if (waterLevel !== undefined) { // 0 for LOW, 1 for HIGH
        readingsToInsert.push({ deviceId, type: SensorType.WATER_LEVEL, value: waterLevel, unit: '%' }); // Storing as 0 or 1
      }
    };

    if (Array.isArray(payload)) {
      for (const item of payload) {
        await processPayloadItem(item);
      }
    } else {
      await processPayloadItem(payload);
    }

    if (readingsToInsert.length === 0) {
      return NextResponse.json({ message: 'No valid sensor data to process or device not found.' }, { status: 400 });
    }

    // Batch insert
    const stmt = await db.prepare('INSERT INTO sensor_readings (deviceId, type, value, unit, timestamp) VALUES (?, ?, ?, ?, ?)');
    for (const reading of readingsToInsert) {
      await stmt.run(reading.deviceId, reading.type, reading.value, reading.unit, now);
    }
    await stmt.finalize();

    // Update lastUpdateTimestamp for the device(s)
    const uniqueDeviceIds = [...new Set(readingsToInsert.map(r => r.deviceId))];
    for (const dId of uniqueDeviceIds) {
        await db.run('UPDATE devices SET lastUpdateTimestamp = ? WHERE serialNumber = ?', now, dId);
    }


    return NextResponse.json({ message: `${readingsToInsert.length} sensor reading(s) processed successfully.` }, { status: 201 });

  } catch (error) {
    console.error('Error ingesting sensor data:', error);
    if (error instanceof SyntaxError) { // JSON parsing error
      return NextResponse.json({ message: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
