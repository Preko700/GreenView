
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';
import { TicketStatus } from '@/lib/types';

const updateTicketSchema = z.object({
  status: z.nativeEnum(TicketStatus),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { ticketId: string } }
) {
  try {
    const ticketId = parseInt(params.ticketId, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ message: 'Invalid ticket ID' }, { status: 400 });
    }

    const body = await request.json();
    const validation = updateTicketSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid input', errors: validation.error.flatten() }, { status: 400 });
    }

    const { status } = validation.data;
    const db = await getDb();

    const result = await db.run(
      'UPDATE support_tickets SET status = ? WHERE id = ?',
      status,
      ticketId
    );

    if (result.changes === 0) {
      return NextResponse.json({ message: 'Ticket not found or no change was made' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Ticket status updated successfully' }, { status: 200 });

  } catch (error) {
    console.error('Error updating ticket status:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
