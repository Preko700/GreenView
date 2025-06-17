
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { SensorData } from '@/lib/types';
import { SensorType } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  const deviceId = params.deviceId;
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get('userId');
  const sensorTypeParam = searchParams.get('sensorType') as SensorType | null;
  const limitParam = searchParams.get('limit');

  if (!userIdParam) {
    return NextResponse.json({ message: 'userId query parameter is required for authorization' }, { status: 400 });
  }
  const userId = parseInt(userIdParam, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ message: 'Invalid userId' }, { status: 400 });
  }

  if (!deviceId) {
    return NextResponse.json({ message: 'deviceId path parameter is required' }, { status: 400 });
  }

  if (!sensorTypeParam || !Object.values(SensorType).includes(sensorTypeParam)) {
    return NextResponse.json({ message: 'Valid sensorType query parameter is required' }, { status: 400 });
  }
  
  const limit = limitParam ? parseInt(limitParam, 10) : 200; // Default to 200 points
  if (isNaN(limit) || limit <= 0) {
      return NextResponse.json({ message: 'Invalid limit parameter' }, { status: 400 });
  }

  try {
    const db = await getDb();

    const deviceOwner = await db.get('SELECT userId FROM devices WHERE serialNumber = ?', deviceId);
    if (!deviceOwner) {
      return NextResponse.json({ message: 'Device not found' }, { status: 404 });
    }
    if (deviceOwner.userId !== userId) {
      return NextResponse.json({ message: 'User not authorized for this device' }, { status: 403 });
    }

    const historicalReadings: SensorData[] = await db.all(
      \`SELECT id, deviceId, type, value, unit, timestamp 
       FROM sensor_readings 
       WHERE deviceId = ? AND type = ? 
       ORDER BY timestamp DESC 
       LIMIT ?\`,
      deviceId,
      sensorTypeParam,
      limit
    );
    
    const orderedReadings = historicalReadings.reverse(); // Order by ASC for charting

    return NextResponse.json(orderedReadings, { status: 200 });

  } catch (error: any) {
    console.error(\`Error fetching historical sensor data for device \${deviceId}, type \${sensorTypeParam}:\`, error);
    return NextResponse.json({ message: 'Failed to fetch historical sensor data', error: error.message }, { status: 500 });
  }
}
