
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';
import { ServiceRequestStatus } from '@/lib/types';

const updateRequestSchema = z.object({
  status: z.nativeEnum(ServiceRequestStatus),
  notes: z.string().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { requestId: string } }
) {
  try {
    const requestId = parseInt(params.requestId, 10);
    if (isNaN(requestId)) {
      return NextResponse.json({ message: 'Invalid request ID' }, { status: 400 });
    }

    const body = await request.json();
    const validation = updateRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid input', errors: validation.error.flatten() }, { status: 400 });
    }

    const { status, notes } = validation.data;
    const db = await getDb();
    
    // Build query dynamically to only update notes if provided
    let query = 'UPDATE service_requests SET status = ?';
    const queryParams: (string | number | null)[] = [status];

    if (notes !== undefined) {
        query += ', notes = ?';
        queryParams.push(notes);
    }

    query += ' WHERE id = ?';
    queryParams.push(requestId);

    const result = await db.run(query, ...queryParams);

    if (result.changes === 0) {
      return NextResponse.json({ message: 'Service request not found or no change was made' }, { status: 404 });
    }

    const updatedRequest = await db.get('SELECT * FROM service_requests WHERE id = ?', requestId);

    return NextResponse.json({ message: 'Service request updated successfully', request: updatedRequest }, { status: 200 });

  } catch (error) {
    console.error('Error updating service request:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
