
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';
import type { SupportTicket } from '@/lib/types';
import { TicketStatus } from '@/lib/types';

const ticketSchema = z.object({
  deviceId: z.string().optional().nullable(),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  subject: z.string().min(1, "Subject is required"),
  message: z.string().min(1, "Message is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = ticketSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ message: "Invalid input", errors: validation.error.format() }, { status: 400 });
    }

    const { deviceId, name, email, subject, message } = validation.data;
    const db = await getDb();
    const timestamp = Date.now();

    const result = await db.run(
      'INSERT INTO support_tickets (deviceId, name, email, subject, message, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      deviceId,
      name,
      email,
      subject,
      message,
      TicketStatus.PENDING,
      timestamp
    );

    if (!result.lastID) {
      return NextResponse.json({ message: 'Failed to create support ticket' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Ticket created successfully', ticketId: result.lastID }, { status: 201 });
  } catch (error) {
    console.error('Error creating support ticket:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
    try {
        const db = await getDb();
        const tickets: SupportTicket[] = await db.all(
            'SELECT * FROM support_tickets ORDER BY timestamp DESC'
        );
        return NextResponse.json(tickets, { status: 200 });
    } catch (error) {
        console.error('Error fetching support tickets:', error);
        return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
    }
}
