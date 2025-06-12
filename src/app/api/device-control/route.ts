
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';

const controlSchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
  userId: z.number().int().positive("User ID is required"), // For authorization
  actuator: z.enum(["light", "fan", "irrigation", "uvLight"]),
  state: z.enum(["on", "off"]),
});

type ControlPayload = z.infer<typeof controlSchema>;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = controlSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid input', errors: validation.error.format() }, { status: 400 });
    }

    const { deviceId, userId, actuator, state } = validation.data;
    const booleanState = state === "on";

    const db = await getDb();

    // Authorization: Check if the device belongs to the user
    const deviceOwner = await db.get('SELECT userId FROM devices WHERE serialNumber = ?', deviceId);
    if (!deviceOwner || deviceOwner.userId !== userId) {
      return NextResponse.json({ message: 'Device not found or not authorized' }, { status: 403 });
    }

    let fieldToUpdate = '';
    switch (actuator) {
      case 'light':
        fieldToUpdate = 'desiredLightState';
        break;
      case 'fan':
        fieldToUpdate = 'desiredFanState';
        break;
      case 'irrigation':
        fieldToUpdate = 'desiredIrrigationState';
        break;
      case 'uvLight':
        fieldToUpdate = 'desiredUvLightState';
        break;
      default:
        return NextResponse.json({ message: 'Invalid actuator type' }, { status: 400 });
    }

    const result = await db.run(
      `UPDATE device_settings SET ${fieldToUpdate} = ? WHERE deviceId = ?`,
      booleanState,
      deviceId
    );

    if (result.changes === 0) {
      return NextResponse.json({ message: 'Device settings not found or no change made' }, { status: 404 });
    }
    
    // Update device's lastUpdateTimestamp
    await db.run('UPDATE devices SET lastUpdateTimestamp = ? WHERE serialNumber = ?', Date.now(), deviceId);


    return NextResponse.json({ message: `${actuator} state set to ${state} successfully` }, { status: 200 });

  } catch (error) {
    console.error('Error setting device control state:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Invalid input data', errors: error.format() }, { status: 400 });
    }
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
