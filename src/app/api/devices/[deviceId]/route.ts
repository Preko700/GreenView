
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { Device } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  const deviceId = params.deviceId;
  console.log(`[API /devices/${deviceId}] GET request received.`); // Log 1: Inicio de la solicitud

  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get('userId');

  if (!userIdParam) {
    console.log(`[API /devices/${deviceId}] userId query parameter is required, returning 400.`);
    return NextResponse.json({ message: 'userId is required' }, { status: 400 });
  }
  const userId = parseInt(userIdParam, 10);
  if (isNaN(userId)) {
    console.log(`[API /devices/${deviceId}] Invalid userId '${userIdParam}', returning 400.`);
    return NextResponse.json({ message: 'Invalid userId' }, { status: 400 });
  }

  if (!deviceId) {
    // Esta condición es teóricamente imposible debido a la estructura de la ruta de archivo,
    // pero se mantiene por completitud defensiva.
    console.log(`[API /devices/${deviceId}] deviceId path parameter is missing, returning 400.`);
    return NextResponse.json({ message: 'deviceId is required' }, { status: 400 });
  }

  console.log(`[API /devices/${deviceId}] Attempting to get DB instance for deviceId: ${deviceId}, userId: ${userId}.`); // Log 2
  try {
    const db = await getDb();
    console.log(`[API /devices/${deviceId}] DB instance obtained.`); // Log 3

    console.log(`[API /devices/${deviceId}] Executing query: SELECT serialNumber, name, plantType, location, activationDate, warrantyEndDate, isActive, isPoweredByBattery, lastUpdateTimestamp FROM devices WHERE serialNumber = ? AND userId = ? with params: [${deviceId}, ${userId}]`); // Log 4: Antes de la consulta
    const device: Device | undefined = await db.get(
      'SELECT serialNumber, name, plantType, location, activationDate, warrantyEndDate, isActive, isPoweredByBattery, lastUpdateTimestamp FROM devices WHERE serialNumber = ? AND userId = ?',
      deviceId,
      userId
    );
    console.log(`[API /devices/${deviceId}] DB query executed. Device found: ${!!device}.`); // Log 5: Después de la consulta

    if (!device) {
      console.log(`[API /devices/${deviceId}] Device not found or user ${userId} not authorized for device ${deviceId}, returning 404.`);
      return NextResponse.json({ message: 'Device not found or not authorized' }, { status: 404 });
    }

    console.log(`[API /devices/${deviceId}] Device found, returning 200 with device data.`); // Log 6
    return NextResponse.json(device, { status: 200 });
  } catch (error: any) { // Especificar 'any' para acceder a .message y .stack
    console.error(`[API /devices/${deviceId}] Error during DB operation or other server error:`, error); // Log 7: Error capturado
    // Es útil registrar el mensaje y el stack por separado para mejor legibilidad en algunos entornos de log.
    console.error(`[API /devices/${deviceId}] Error message: ${error.message}`);
    console.error(`[API /devices/${deviceId}] Error stack: ${error.stack}`);
    return NextResponse.json({ message: 'An internal server error occurred while fetching device data.', errorDetails: error.message }, { status: 500 });
  }
}
