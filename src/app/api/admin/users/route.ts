
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { User } from '@/lib/types';

export async function GET(request: NextRequest) {
    try {
        const db = await getDb();
        
        // Select only necessary fields for the admin form
        const users: Pick<User, 'id' | 'name' | 'email'>[] = await db.all(`
            SELECT id, name, email FROM users ORDER BY name ASC
        `);

        return NextResponse.json(users, { status: 200 });
    } catch (error) {
        console.error('Error fetching users for admin view:', error);
        return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
    }
}
