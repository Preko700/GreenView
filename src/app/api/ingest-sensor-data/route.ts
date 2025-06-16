
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { Device, SensorReading } from '@/lib/types'; // Asegúrate que SensorReading esté bien definido
import { SensorType } from '@/lib/types';
import { z } from 'zod';

// Extendido para incluir más sensores y hacerlos todos opcionales excepto hardwareId
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

export async function POST(request: NextRequest) {
  console.log('[API/ingest] Received POST request');
  try {
    const payload: SensorPayload | SensorPayload[] = await request.json();
    console.log('[API/ingest] Payload recibido:', JSON.stringify(payload, null, 2));

    const readingsToInsert: Omit<SensorReading, 'id'>[] = []; // No incluir 'timestamp' aquí
    const now = Date.now();
    const db = await getDb();

    const processPayloadItem = async (item: SensorPayload) => {
      const validation = sensorReadingSchema.safeParse(item);
      if (!validation.success) {
        console.warn('[API/ingest] Dato de sensor inválido recibido:', validation.error.format(), 'Item:', item);
        // Devolver un error específico o no añadir a readingsToInsert
        return { success: false, error: validation.error.format() };
      }
      const { hardwareId, temperature, airHumidity, soilHumidity, lightLevel, waterLevel, ph } = validation.data;

      const device = await db.get<Device>('SELECT serialNumber FROM devices WHERE hardwareIdentifier = ?', hardwareId);
      if (!device) {
        console.warn(`[API/ingest] Dispositivo con hardwareId ${hardwareId} no encontrado. Descartando datos de sensores.`);
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
        readingsToInsert.push({ deviceId, type: SensorType.WATER_LEVEL, value: waterLevel, unit: '%', timestamp: now }); 
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

    console.log('[API/ingest] Lecturas para insertar en BD:', JSON.stringify(readingsToInsert, null, 2));
    
    try {
      await db.transaction(async (txDb) => {
          console.log('[API/ingest] Iniciando transacción de BD...');
          const stmt = await txDb.prepare('INSERT INTO sensor_readings (deviceId, type, value, unit, timestamp) VALUES (?, ?, ?, ?, ?)');
          for (const reading of readingsToInsert) {
            console.log('[API/ingest] Insertando lectura:', reading);
            await stmt.run(reading.deviceId, reading.type, reading.value, reading.unit, reading.timestamp);
          }
          await stmt.finalize();
          console.log('[API/ingest] Lecturas insertadas.');

          const uniqueDeviceIds = [...new Set(readingsToInsert.map(r => r.deviceId))];
          for (const dId of uniqueDeviceIds) {
              console.log(`[API/ingest] Actualizando device ${dId}: lastUpdateTimestamp y isActive.`);
              await txDb.run('UPDATE devices SET lastUpdateTimestamp = ?, isActive = ? WHERE serialNumber = ?', now, true, dId);
          }
          console.log('[API/ingest] Dispositivos actualizados.');
          console.log('[API/ingest] Transacción de BD completada.');
      });
    } catch (dbError: any) {
        console.error('[API/ingest] Error durante la transacción de BD:', dbError.message, dbError.stack);
        // Devuelve un error más específico si es posible.
        return NextResponse.json({ message: 'Database transaction error occurred.', error: dbError.message, stack: dbError.stack }, { status: 500 });
    }


    return NextResponse.json({ message: `${readingsToInsert.length} sensor reading(s) processed successfully.` }, { status: 201 });

  } catch (error: any) {
    console.error('[API/ingest] Error general en el endpoint:', error.message, error.stack);
    if (error instanceof SyntaxError) { 
      return NextResponse.json({ message: 'Invalid JSON payload', error: error.message, stack: error.stack }, { status: 400 });
    }
    return NextResponse.json({ message: 'An internal server error occurred.', error: error.message, stack: error.stack }, { status: 500 });
  }
}

    