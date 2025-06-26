
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';
import { ServiceRequestStatus } from '@/lib/types';

const serviceRequestSchema = z.object({
  userId: z.number().int().positive(),
  deviceId: z.string().min(1, "Device selection is required"),
  reason: z.string().min(1, "Reason for contact is required"),
  phoneNumber: z.string().min(5, "A valid phone number is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = serviceRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid input', errors: validation.error.flatten() }, { status: 400 });
    }

    const { userId, deviceId, reason, phoneNumber } = validation.data;
    const db = await getDb();

    // Authorization: Check if the device actually belongs to the user submitting the request
    const deviceOwner = await db.get('SELECT userId FROM devices WHERE serialNumber = ?', deviceId);
    if (!deviceOwner || deviceOwner.userId !== userId) {
      return NextResponse.json({ message: 'Device not found or not authorized for this user' }, { status: 403 });
    }

    const timestamp = Date.now();

    const result = await db.run(
      'INSERT INTO service_requests (userId, deviceId, reason, phoneNumber, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      userId,
      deviceId,
      reason,
      phoneNumber,
      ServiceRequestStatus.PENDING,
      timestamp
    );

    if (!result.lastID) {
      return NextResponse.json({ message: 'Failed to create service request' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Service request submitted successfully', requestId: result.lastID }, { status: 201 });
  } catch (error) {
    console.error('Error creating service request:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
