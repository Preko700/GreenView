
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { Device } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  const deviceId = params.deviceId;
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get('userId');

  if (!userIdParam) {
    return NextResponse.json({ message: 'userId is required' }, { status: 400 });
  }
  const userId = parseInt(userIdParam, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ message: 'Invalid userId' }, { status: 400 });
  }

  if (!deviceId) {
    return NextResponse.json({ message: 'deviceId is required' }, { status: 400 });
  }

  try {
    const db = await getDb();
    const device: Device | undefined = await db.get(
      'SELECT serialNumber, name, plantType, location, activationDate, warrantyEndDate, isActive, isPoweredByBattery, lastUpdateTimestamp FROM devices WHERE serialNumber = ? AND userId = ?',
      deviceId,
      userId
    );

    if (!device) {
      return NextResponse.json({ message: 'Device not found or not authorized' }, { status: 404 });
    }

    return NextResponse.json(device, { status: 200 });
  } catch (error) {
    console.error(`Error fetching device ${deviceId}:`, error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
