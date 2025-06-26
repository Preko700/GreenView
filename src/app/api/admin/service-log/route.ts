
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';
import type { AdminServiceLogView } from '@/lib/types';

const serviceLogSchema = z.object({
  technicianName: z.string().min(2),
  userId: z.number().int().positive(),
  deviceId: z.string().min(1),
  serviceDate: z.number().int().positive(),
  actionsTaken: z.string().min(1),
  result: z.string().min(1),
  serviceRequestId: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = serviceLogSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid input', errors: validation.error.flatten() }, { status: 400 });
    }

    const { technicianName, userId, deviceId, serviceDate, actionsTaken, result, serviceRequestId } = validation.data;
    const db = await getDb();
    
    const user = await db.get('SELECT id FROM users WHERE id = ?', userId);
    if (!user) return NextResponse.json({ message: `User with ID ${userId} not found` }, { status: 404 });
    
    const device = await db.get('SELECT serialNumber FROM devices WHERE serialNumber = ?', deviceId);
    if (!device) return NextResponse.json({ message: `Device with ID ${deviceId} not found` }, { status: 404 });
    
    if (serviceRequestId) {
        const serviceRequest = await db.get('SELECT id FROM service_requests WHERE id = ?', serviceRequestId);
        if (!serviceRequest) return NextResponse.json({ message: `Service Request with ID ${serviceRequestId} not found` }, { status: 404 });
    }

    const insertResult = await db.run(
      'INSERT INTO service_log_entries (technicianName, userId, deviceId, serviceDate, actionsTaken, result, serviceRequestId, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      technicianName, userId, deviceId, serviceDate, actionsTaken, result, serviceRequestId || null, Date.now()
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
    const { searchParams } = new URL(request.url);
    const serviceRequestId = searchParams.get('serviceRequestId');
    const db = await getDb();

    let query = `
      SELECT 
        l.id, l.technicianName, l.userId, l.deviceId, l.serviceDate, l.actionsTaken, l.result, l.timestamp, l.serviceRequestId,
        u.name as userName,
        d.name as deviceName
      FROM service_log_entries l
      LEFT JOIN users u ON l.userId = u.id
      LEFT JOIN devices d ON l.deviceId = d.serialNumber
    `;
    const params: any[] = [];

    if (serviceRequestId) {
        query += ' WHERE l.serviceRequestId = ?';
        params.push(serviceRequestId);
    }
    
    query += ' ORDER BY l.serviceDate DESC';

    const logs: AdminServiceLogView[] = await db.all(query, ...params);
    return NextResponse.json(logs, { status: 200 });
  } catch (error) {
    console.error('Error fetching service logs:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
