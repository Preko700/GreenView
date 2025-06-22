
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { SensorData } from '@/lib/types';

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
    return NextResponse.json({ message: 'deviceId parameter is required' }, { status: 400 });
  }

  try {
    const db = await getDb();

    // 1. Verificar que el deviceId pertenece al userId
    const deviceOwner = await db.get('SELECT userId FROM devices WHERE serialNumber = ?', deviceId);
    if (!deviceOwner) {
      console.warn(`[API/sensor-data] Device ${deviceId} not found.`);
      return NextResponse.json({ message: 'Device not found' }, { status: 404 });
    }
    if (deviceOwner.userId !== userId) {
      console.warn(`[API/sensor-data] User ${userId} not authorized for device ${deviceId}.`);
      return NextResponse.json({ message: 'User not authorized for this device' }, { status: 403 });
    }

    // 2. Obtener la última lectura para cada tipo de sensor
    // Esta consulta es más compleja. Utiliza una subconsulta para encontrar el timestamp más reciente
    // para cada tipo de sensor y luego une de nuevo a la tabla principal para obtener los otros valores.
    const sqlQuery = `
      SELECT sr.id, sr.deviceId, sr.type, sr.value, sr.unit, sr.timestamp
      FROM sensor_readings sr
      INNER JOIN (
          SELECT type, MAX(timestamp) as max_timestamp
          FROM sensor_readings
          WHERE deviceId = ?
          GROUP BY type
      ) latest_sr ON sr.type = latest_sr.type AND sr.timestamp = latest_sr.max_timestamp AND sr.deviceId = ?
      ORDER BY sr.type;
    `;
    // console.log(`[API/sensor-data] Executing query for device ${deviceId}: ${sqlQuery.replace(/\s+/g, ' ').trim()}`);
    
    const sensorReadings: SensorData[] = await db.all(sqlQuery, deviceId, deviceId);

    // console.log(`[API/sensor-data] Found ${sensorReadings.length} latest sensor readings for device ${deviceId}:`, sensorReadings);
    
    if (!sensorReadings || sensorReadings.length === 0) {
      // No es un error, puede que no haya datos aún. El frontend maneja esto.
      // console.log(`[API/sensor-data] No sensor data found for device ${deviceId}.`);
    }

    return NextResponse.json(sensorReadings, { status: 200 });

  } catch (error: any) {
    console.error(`[API/sensor-data] Error fetching sensor data for device ${deviceId}:`, error);
    return NextResponse.json({ message: 'Failed to fetch sensor data', error: error.message }, { status: 500 });
  }
}
