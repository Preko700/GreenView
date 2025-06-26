
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { Device } from '@/lib/types';


export async function GET(request: NextRequest) {
    try {
        const db = await getDb();
        
        // This endpoint can simply list all devices with basic info
        const devices: Device[] = await db.all(`
            SELECT 
                d.serialNumber,
                d.userId,
                d.name,
                d.plantType,
                d.activationDate,
                d.isActive,
                u.name as userName
            FROM devices d
            LEFT JOIN users u ON d.userId = u.id
            ORDER BY d.activationDate DESC
        `);

        return NextResponse.json(devices, { status: 200 });
    } catch (error) {
        console.error('Error fetching devices for admin view:', error);
        return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
    }
}
