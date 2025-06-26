
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { EmailPasswordCredentials, User } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { email: originalEmail, password } = (await request.json()) as EmailPasswordCredentials;
    console.log(`[LOGIN API] Received login attempt for: ${originalEmail}`);

    if (!originalEmail || !password) {
      console.error('[LOGIN API] Missing email or password.');
      return NextResponse.json({ message: 'Email and password are required' }, { status: 400 });
    }

    const email = originalEmail.toLowerCase();
    const db = await getDb();
    console.log(`[LOGIN API] Database connection obtained. Searching for user: ${email}`);

    const userRow = await db.get<User & { password?: string } >('SELECT id, name, email, registrationDate, password FROM users WHERE email = ?', email);

    if (!userRow) {
      console.warn(`[LOGIN API] User not found for email: ${email}`);
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }
    
    console.log(`[LOGIN API] User found. ID: ${userRow.id}, Email: ${userRow.email}.`);
    
    if (!userRow.password) {
      console.error(`[LOGIN API] User ${email} found but has NO PASSWORD in DB.`);
      return NextResponse.json({ message: 'Internal server error - user data integrity issue.' }, { status: 500 });
    }

    console.log(`[LOGIN API] Comparing passwords for ${email}.`);
    console.log(`[LOGIN API]   - Received password: "${password}"`);
    console.log(`[LOGIN API]   - Stored password:   "${userRow.password}"`);
    
    const isPasswordValid = password === userRow.password;
    
    console.log(`[LOGIN API] Password validation result for ${email}: ${isPasswordValid}`);

    if (!isPasswordValid) {
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userToReturn } = userRow; 

    console.log(`[LOGIN API] Login successful for ${email}. Returning user data.`);
    return NextResponse.json({ message: 'Login successful', user: userToReturn }, { status: 200 });
  } catch (error) {
    console.error('[LOGIN API] Unhandled error during login process:', error);
    return NextResponse.json({ message: 'An internal server error occurred during login.' }, { status: 500 });
  }
}
