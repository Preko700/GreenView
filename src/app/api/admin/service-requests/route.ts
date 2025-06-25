
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { AdminServiceRequestView } from '@/lib/types';

export async function GET(request: NextRequest) {
    try {
        const db = await getDb();
        
        const requests: AdminServiceRequestView[] = await db.all(`
            SELECT 
                r.id, r.userId, r.deviceId, r.reason, r.phoneNumber, r.status, r.timestamp,
                u.name as userName,
                u.email as userEmail,
                d.name as deviceName
            FROM service_requests r
            JOIN users u ON r.userId = u.id
            JOIN devices d ON r.deviceId = d.serialNumber
            ORDER BY r.timestamp DESC
        `);

        return NextResponse.json(requests, { status: 200 });
    } catch (error) {
        console.error('Error fetching service requests for admin view:', error);
        return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
    }
}
