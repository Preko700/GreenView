
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { SensorReading, Device } from '@/lib/types';
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
  ph: z.number().optional(), // Añadido pH
});

type SensorPayload = z.infer<typeof sensorReadingSchema>;

export async function POST(request: NextRequest) {
  try {
    const payload: SensorPayload | SensorPayload[] = await request.json();
    // console.log('[API/ingest] Payload recibido:', JSON.stringify(payload, null, 2));

    const readingsToInsert: Omit<SensorReading, 'id' | 'timestamp'>[] = [];
    const now = Date.now();
    const db = await getDb();

    const processPayloadItem = async (item: SensorPayload) => {
      const validation = sensorReadingSchema.safeParse(item);
      if (!validation.success) {
        console.warn('[API/ingest] Dato de sensor inválido recibido:', validation.error.format(), 'Item:', item);
        return; 
      }
      const { hardwareId, temperature, airHumidity, soilHumidity, lightLevel, waterLevel, ph } = validation.data;

      const device = await db.get<Device>('SELECT serialNumber FROM devices WHERE hardwareIdentifier = ?', hardwareId);
      if (!device) {
        console.warn(`[API/ingest] Dispositivo con hardwareId ${hardwareId} no encontrado. Descartando datos de sensores.`);
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
        readingsToInsert.push({ deviceId, type: SensorType.LIGHT, value: lightLevel, unit: 'lux' });
      }
      if (waterLevel !== undefined) { // 0 for LOW, 1 for HIGH, or percentage
        // Si es 0 o 1, lo consideramos binario (boya). Si es mayor, podría ser un % de un sensor analógico.
        // La unidad se deja como '%' por si es un valor continuo, pero el frontend podría interpretarlo diferente.
        readingsToInsert.push({ deviceId, type: SensorType.WATER_LEVEL, value: waterLevel, unit: '%' }); 
      }
      if (ph !== undefined) {
        readingsToInsert.push({ deviceId, type: SensorType.PH, value: ph, unit: '' }); // pH no suele tener unidad visible
      }
      // Aquí puedes añadir más sensores si los defines en ArduinoSensorPayload y SensorType
    };

    if (Array.isArray(payload)) {
      for (const item of payload) {
        await processPayloadItem(item);
      }
    } else {
      await processPayloadItem(payload);
    }

    if (readingsToInsert.length === 0) {
      // console.log('[API/ingest] No hay datos de sensores válidos para procesar o dispositivo no encontrado.');
      return NextResponse.json({ message: 'No valid sensor data to process or device not found.' }, { status: 400 });
    }

    // console.log('[API/ingest] Lecturas para insertar en BD:', JSON.stringify(readingsToInsert, null, 2));
    
    // Batch insert
    await db.transaction(async (txDb) => {
        const stmt = await txDb.prepare('INSERT INTO sensor_readings (deviceId, type, value, unit, timestamp) VALUES (?, ?, ?, ?, ?)');
        for (const reading of readingsToInsert) {
          await stmt.run(reading.deviceId, reading.type, reading.value, reading.unit, now);
        }
        await stmt.finalize();

        const uniqueDeviceIds = [...new Set(readingsToInsert.map(r => r.deviceId))];
        for (const dId of uniqueDeviceIds) {
            await txDb.run('UPDATE devices SET lastUpdateTimestamp = ?, isActive = ? WHERE serialNumber = ?', now, true, dId);
        }
    });


    return NextResponse.json({ message: `${readingsToInsert.length} sensor reading(s) processed successfully.` }, { status: 201 });

  } catch (error: any) {
    console.error('[API/ingest] Error ingiriendo datos de sensores:', error);
    if (error instanceof SyntaxError) { // JSON parsing error
      return NextResponse.json({ message: 'Invalid JSON payload', error: error.message }, { status: 400 });
    }
    return NextResponse.json({ message: 'An internal server error occurred', error: error.message }, { status: 500 });
  }
}
