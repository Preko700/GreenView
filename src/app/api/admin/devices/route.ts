
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { AdminDeviceView } from '@/lib/types';

export async function GET(request: NextRequest) {
    try {
        const db = await getDb();
        
        const devices: AdminDeviceView[] = await db.all(`
            SELECT 
                d.serialNumber,
                d.name as deviceName,
                u.name as userName,
                d.activationDate,
                d.warrantyEndDate
            FROM devices d
            JOIN users u ON d.userId = u.id
            ORDER BY d.activationDate DESC
        `);

        return NextResponse.json(devices, { status: 200 });
    } catch (error) {
        console.error('Error fetching devices for admin view:', error);
        return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
    }
}
