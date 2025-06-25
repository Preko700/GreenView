
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';
import type { AdminServiceLogView } from '@/lib/types';

const serviceLogSchema = z.object({
  technicianName: z.string().min(2),
  userId: z.coerce.number().int().positive(),
  deviceId: z.string().min(1),
  serviceDate: z.number().int().positive(),
  actionsTaken: z.string().min(1),
  result: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = serviceLogSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid input', errors: validation.error.flatten() }, { status: 400 });
    }

    const { technicianName, userId, deviceId, serviceDate, actionsTaken, result } = validation.data;
    const db = await getDb();
    
    // Optional: Validate that userId and deviceId exist
    const user = await db.get('SELECT id FROM users WHERE id = ?', userId);
    if (!user) return NextResponse.json({ message: `User with ID ${userId} not found` }, { status: 404 });
    
    const device = await db.get('SELECT serialNumber FROM devices WHERE serialNumber = ?', deviceId);
    if (!device) return NextResponse.json({ message: `Device with ID ${deviceId} not found` }, { status: 404 });

    const insertResult = await db.run(
      'INSERT INTO service_log_entries (technicianName, userId, deviceId, serviceDate, actionsTaken, result, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      technicianName, userId, deviceId, serviceDate, actionsTaken, result, Date.now()
    );

    if (!insertResult.lastID) {
      return NextResponse.json({ message: 'Failed to create log entry' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Log entry created successfully', id: insertResult.lastID }, { status: 201 });

  } catch (error) {
    console.error('Error creating service log entry:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const db = await getDb();
    const logs: AdminServiceLogView[] = await db.all(`
      SELECT 
        l.id, l.technicianName, l.userId, l.deviceId, l.serviceDate, l.actionsTaken, l.result, l.timestamp,
        u.name as userName,
        d.name as deviceName
      FROM service_log_entries l
      JOIN users u ON l.userId = u.id
      JOIN devices d ON l.deviceId = d.serialNumber
      ORDER BY l.serviceDate DESC
    `);
    return NextResponse.json(logs, { status: 200 });
  } catch (error) {
    console.error('Error fetching service logs:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
