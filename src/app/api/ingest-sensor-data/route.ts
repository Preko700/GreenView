
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { Device, SensorReading } from '@/lib/types';
import { SensorType } from '@/lib/types';
import { z } from 'zod';

const sensorReadingSchema = z.object({
  hardwareId: z.string().min(1, "Hardware ID is required"),
  temperature: z.number().optional(),
  airHumidity: z.number().optional(),
  soilHumidity: z.number().min(0).max(100).optional(),
  lightLevel: z.number().optional(),
  waterLevel: z.union([z.literal(0), z.literal(1), z.number().min(0).max(100)]).optional(),
  ph: z.number().optional(),
});

type SensorPayload = z.infer<typeof sensorReadingSchema>;

export async function POST(request: NextRequest) {
  try {
    const payload: SensorPayload | SensorPayload[] = await request.json();
    const readingsToInsert: Omit<SensorReading, 'id'>[] = [];
    const now = Date.now();
    const db = await getDb();

    const processPayloadItem = async (item: SensorPayload) => {
      const validation = sensorReadingSchema.safeParse(item);
      if (!validation.success) {
        console.warn('[API/ingest] Invalid sensor data received:', validation.error.format(), 'Item:', item);
        return { success: false, error: validation.error.format() };
      }
      const { hardwareId, temperature, airHumidity, soilHumidity, lightLevel, waterLevel, ph } = validation.data;

      const device = await db.get<Device>('SELECT serialNumber FROM devices WHERE hardwareIdentifier = ?', hardwareId);
      if (!device) {
        console.warn(`[API/ingest] Device with hardwareId ${hardwareId} not found. Discarding sensor data.`);
        return { success: false, error: `Device with hardwareId ${hardwareId} not found.` };
      }
      const deviceId = device.serialNumber;
      
      if (temperature !== undefined) readingsToInsert.push({ deviceId, type: SensorType.TEMPERATURE, value: temperature, unit: '°C', timestamp: now });
      if (airHumidity !== undefined) readingsToInsert.push({ deviceId, type: SensorType.AIR_HUMIDITY, value: airHumidity, unit: '%', timestamp: now });
      if (soilHumidity !== undefined) readingsToInsert.push({ deviceId, type: SensorType.SOIL_HUMIDITY, value: soilHumidity, unit: '%', timestamp: now });
      if (lightLevel !== undefined) readingsToInsert.push({ deviceId, type: SensorType.LIGHT, value: lightLevel, unit: 'lux', timestamp: now });
      if (waterLevel !== undefined) readingsToInsert.push({ deviceId, type: SensorType.WATER_LEVEL, value: waterLevel, unit: (waterLevel === 0 || waterLevel === 1) ? 'state' : '%', timestamp: now }); 
      if (ph !== undefined) readingsToInsert.push({ deviceId, type: SensorType.PH, value: ph, unit: '', timestamp: now });
      
      return { success: true };
    };

    let allItemsProcessedSuccessfully = true;
    let processingErrors: any[] = [];

    const items = Array.isArray(payload) ? payload : [payload];
    for (const item of items) {
      const result = await processPayloadItem(item);
      if (!result.success) {
        allItemsProcessedSuccessfully = false;
        if (result.error) processingErrors.push(result.error);
      }
    }

    if (readingsToInsert.length === 0) {
      if (!allItemsProcessedSuccessfully) return NextResponse.json({ message: 'Invalid sensor data or device not found.', errors: processingErrors }, { status: 400 });
      return NextResponse.json({ message: 'No valid sensor data to process.' }, { status: 400 });
    }
    
    await db.run('BEGIN TRANSACTION;');
    try {
      const stmt = await db.prepare('INSERT INTO sensor_readings (deviceId, type, value, unit, timestamp) VALUES (?, ?, ?, ?, ?)');
      for (const reading of readingsToInsert) {
        await stmt.run(reading.deviceId, reading.type, reading.value, reading.unit, reading.timestamp);
      }
      await stmt.finalize();

      const uniqueDeviceIds = [...new Set(readingsToInsert.map(r => r.deviceId))];
      for (const dId of uniqueDeviceIds) {
        await db.run('UPDATE devices SET lastUpdateTimestamp = ?, isActive = ? WHERE serialNumber = ?', now, true, dId);
      }
      
      await db.run('COMMIT;');
    } catch (dbError: any) {
      await db.run('ROLLBACK;');
      console.error('[API/ingest] Database transaction error:', dbError);
      return NextResponse.json({ message: 'Database transaction error occurred.', error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ message: `${readingsToInsert.length} sensor reading(s) processed successfully.` }, { status: 201 });

  } catch (error: any) {
    console.error('[API/ingest] General error:', error);
    if (error instanceof SyntaxError) return NextResponse.json({ message: 'Invalid JSON payload.', error: error.message }, { status: 400 });
    return NextResponse.json({ message: 'An internal server error occurred.', error: error.message }, { status: 500 });
  }
}
