
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

  // Log #1: Start of the request
  console.log(`[API /devices/${deviceId}] GET request received. DeviceID: ${deviceId}, UserID Param: ${userIdParam}`);

  if (!userIdParam) {
    console.warn(`[API /devices/${deviceId}] userId query parameter is missing.`);
    return NextResponse.json({ message: 'userId query parameter is required for authorization' }, { status: 400 });
  }
  const userId = parseInt(userIdParam, 10);
  if (isNaN(userId)) {
    console.warn(`[API /devices/${deviceId}] Invalid userId: ${userIdParam}.`);
    return NextResponse.json({ message: 'Invalid userId' }, { status: 400 });
  }

  if (!deviceId) {
    // This case should ideally not be hit if Next.js routing is working as expected for dynamic routes
    console.warn(`[API /devices/${deviceId}] deviceId path parameter is missing or undefined.`);
    return NextResponse.json({ message: 'deviceId path parameter is required' }, { status: 400 });
  }

  try {
    // Log #2: Attempting to get DB
    console.log(`[API /devices/${deviceId}] Attempting to get DB instance for deviceId: ${deviceId}, userId: ${userId}.`);
    const db = await getDb();
    // Log #3: DB instance obtained
    console.log(`[API /devices/${deviceId}] DB instance obtained.`);

    // Log #4: Executing query
    const queryString = 'SELECT serialNumber, hardwareIdentifier, name, plantType, location, activationDate, warrantyEndDate, isActive, isPoweredByBattery, lastUpdateTimestamp FROM devices WHERE serialNumber = ? AND userId = ?';
    console.log(`[API /devices/${deviceId}] Executing query: ${queryString.replace(/\s+/g, ' ').trim()} with params: [${deviceId}, ${userId}]`);
    
    const deviceRow = await db.get<Device>(queryString, deviceId, userId);
    
    // Log #5: DB query executed
    console.log(`[API /devices/${deviceId}] DB query executed. Device found: ${!!deviceRow}.`);

    if (deviceRow) {
      // Log #6: Device found
      console.log(`[API /devices/${deviceId}] Device found, returning 200 with device data for ${deviceRow.name}.`);
      return NextResponse.json(deviceRow, { status: 200 });
    } else {
      console.warn(`[API /devices/${deviceId}] Device not found in DB or user ${userId} not authorized for device ${deviceId}. Returning 404.`);
      return NextResponse.json({ message: 'Device not found or not authorized for this user' }, { status: 404 });
    }
  } catch (error: any) {
    // Log #7: Error during operation
    console.error(`[API /devices/${deviceId}] Error during DB operation or other server error: ${error.message}`, error.stack);
    return NextResponse.json({ message: 'An internal server error occurred while fetching device details.', errorDetails: error.message }, { status: 500 });
  }
}
