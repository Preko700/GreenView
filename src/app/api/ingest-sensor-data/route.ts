
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { Device, DeviceSettings, SensorReading } from '@/lib/types';
import { SensorType } from '@/lib/types';
import { z } from 'zod';
import type { Database } from 'sqlite';
import type sqlite3 from 'sqlite3';

const sensorReadingSchema = z.object({
  hardwareId: z.string().min(1, "Hardware ID is required"),
  temperature: z.number().optional(),
  airHumidity: z.number().optional(),
  soilHumidity: z.number().min(0).max(100).optional(),
  lightLevel: z.number().optional(),
  waterLevel: z.union([z.literal(0), z.literal(1), z.number().min(0).max(100)]).optional(), // 0 LOW, 1 HIGH, or percentage
  ph: z.number().optional(),
});

type SensorPayload = z.infer<typeof sensorReadingSchema>;


// --- Main API Logic ---

export async function POST(request: NextRequest) {
  console.log('[API/ingest] Received POST request');
  try {
    const payload: SensorPayload | SensorPayload[] = await request.json();
    console.log('[API/ingest] Payload JSON crudo recibido del cliente:', JSON.stringify(payload, null, 2));

    const readingsToInsert: Omit<SensorReading, 'id'>[] = [];
    const now = Date.now();
    const db = await getDb();

    const processPayloadItem = async (item: SensorPayload) => {
      const validation = sensorReadingSchema.safeParse(item);
      if (!validation.success) {
        console.warn('[API/ingest] Dato de sensor inválido recibido (falla validación Zod):', validation.error.format(), 'Item:', item);
        return { success: false, error: validation.error.format() };
      }
      const { hardwareId, temperature, airHumidity, soilHumidity, lightLevel, waterLevel, ph } = validation.data;

      const device = await db.get<Device & { userId: number; name: string }>('SELECT serialNumber, userId, name FROM devices WHERE hardwareIdentifier = ?', hardwareId);
      if (!device) {
        console.warn(`[API/ingest] Dispositivo con hardwareId ${hardwareId} no encontrado en DB. Descartando datos de sensores.`);
        return { success: false, error: `Device with hardwareId ${hardwareId} not found.` };
      }
      const deviceId = device.serialNumber;
      
      if (temperature !== undefined) {
        readingsToInsert.push({ deviceId, type: SensorType.TEMPERATURE, value: temperature, unit: '°C', timestamp: now });
      }
      if (airHumidity !== undefined) {
        readingsToInsert.push({ deviceId, type: SensorType.AIR_HUMIDITY, value: airHumidity, unit: '%', timestamp: now });
      }
      if (soilHumidity !== undefined) {
        readingsToInsert.push({ deviceId, type: SensorType.SOIL_HUMIDITY, value: soilHumidity, unit: '%', timestamp: now });
      }
      if (lightLevel !== undefined) {
        readingsToInsert.push({ deviceId, type: SensorType.LIGHT, value: lightLevel, unit: 'lux', timestamp: now });
      }
      if (waterLevel !== undefined) { 
        readingsToInsert.push({ deviceId, type: SensorType.WATER_LEVEL, value: waterLevel, unit: (waterLevel === 0 || waterLevel === 1) ? 'state' : '%', timestamp: now }); 
      }
      if (ph !== undefined) {
        readingsToInsert.push({ deviceId, type: SensorType.PH, value: ph, unit: '', timestamp: now });
      }
      return { success: true };
    };

    let allItemsProcessedSuccessfully = true;
    let processingErrors: any[] = [];

    if (Array.isArray(payload)) {
      for (const item of payload) {
        const result = await processPayloadItem(item);
        if (!result.success) {
          allItemsProcessedSuccessfully = false;
          if (result.error) processingErrors.push(result.error);
        }
      }
    } else {
      const result = await processPayloadItem(payload);
      if (!result.success) {
        allItemsProcessedSuccessfully = false;
        if (result.error) processingErrors.push(result.error);
      }
    }

    if (readingsToInsert.length === 0) {
      console.log('[API/ingest] No hay datos de sensores válidos para procesar o dispositivo no encontrado.');
      if (!allItemsProcessedSuccessfully) {
        return NextResponse.json({ message: 'Invalid sensor data or device not found.', errors: processingErrors }, { status: 400 });
      }
      return NextResponse.json({ message: 'No valid sensor data to process.' }, { status: 400 });
    }

    console.log('[API/ingest] Lecturas preparadas para insertar en BD:', JSON.stringify(readingsToInsert, null, 2));
    
    try {
      console.log('[API/ingest] Iniciando transacción de BD...');
      await db.run('BEGIN TRANSACTION;');
      
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
      console.log('[API/ingest] Transacción de BD completada (COMMIT).');

    } catch (dbError: any) {
        console.error('[API/ingest] Error durante la transacción de BD:', dbError.message, dbError.stack);
        try {
          await db.run('ROLLBACK;');
          console.log('[API/ingest] Transacción de BD revertida (ROLLBACK) debido a error.');
        } catch (rollbackError: any) {
          console.error('[API/ingest] Error al intentar hacer ROLLBACK:', rollbackError.message, rollbackError.stack);
        }
        return NextResponse.json({ message: 'Database transaction error occurred.', error: dbError.message, stack: dbError.stack }, { status: 500 });
    }

    return NextResponse.json({ message: `${readingsToInsert.length} sensor reading(s) processed successfully.` }, { status: 201 });

  } catch (error: any) {
    console.error('[API/ingest] Error general en el endpoint:', error.message, error.stack);
    if (error instanceof SyntaxError && error.message.includes("JSON")) { 
      return NextResponse.json({ message: 'Invalid JSON payload received from client', error: error.message, stack: error.stack }, { status: 400 });
    }
    return NextResponse.json({ message: 'An internal server error occurred.', error: error.message, stack: error.stack }, { status: 500 });
  }
}
