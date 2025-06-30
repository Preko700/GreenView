
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';
import type { TicketLog } from '@/lib/types';

const logSchema = z.object({
  technicianName: z.string().min(1, "Technician name is required"),
  logEntry: z.string().min(1, "Log entry is required"),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { ticketId: string } }
) {
  try {
    const ticketId = parseInt(params.ticketId, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ message: 'Invalid ticket ID' }, { status: 400 });
    }

    const db = await getDb();
    const logs: TicketLog[] = await db.all(
      'SELECT * FROM ticket_logs WHERE ticketId = ? ORDER BY timestamp DESC',
      ticketId
    );

    return NextResponse.json(logs, { status: 200 });
  } catch (error) {
    console.error('Error fetching ticket logs:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { ticketId: string } }
) {
  try {
    const ticketId = parseInt(params.ticketId, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ message: 'Invalid ticket ID' }, { status: 400 });
    }

    const body = await request.json();
    const validation = logSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid input', errors: validation.error.flatten() }, { status: 400 });
    }

    const { technicianName, logEntry } = validation.data;
    const db = await getDb();
    const timestamp = Date.now();

    const result = await db.run(
      'INSERT INTO ticket_logs (ticketId, technicianName, logEntry, timestamp) VALUES (?, ?, ?, ?)',
      ticketId,
      technicianName,
      logEntry,
      timestamp
    );

    if (!result.lastID) {
      return NextResponse.json({ message: 'Failed to create log entry' }, { status: 500 });
    }
    
    const newLog = await db.get('SELECT * FROM ticket_logs WHERE id = ?', result.lastID);

    return NextResponse.json({ message: 'Log entry added successfully', log: newLog }, { status: 201 });

  } catch (error) {
    console.error('Error adding ticket log:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
