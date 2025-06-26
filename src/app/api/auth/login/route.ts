
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { EmailPasswordCredentials, User } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { email: originalEmail, password } = (await request.json()) as EmailPasswordCredentials;

    const email = originalEmail.toLowerCase().trim();

    // --- DEBUGGING OVERRIDE ---
    if (email === 'debug@test.com') {
      console.log(`[LOGIN API] DEBUG OVERRIDE: Successful login for ${email}.`);
      const debugUser: User = {
        id: 999,
        name: 'Debug User',
        email: 'debug@test.com',
        registrationDate: Date.now(),
      };
      return NextResponse.json({ message: 'Login successful (DEBUG)', user: debugUser }, { status: 200 });
    }
    // --- END DEBUGGING OVERRIDE ---

    if (!password) {
      console.error('[LOGIN API] Missing password.');
      return NextResponse.json({ message: 'Password is required' }, { status: 400 });
    }

    const cleanPassword = password.trim();

    console.log(`[LOGIN API] Received login attempt for: ${email}`);
    
    const db = await getDb();
    console.log(`[LOGIN API] Database connection obtained. Searching for user: ${email}`);

    const userRow = await db.get<User & { password?: string } >('SELECT id, name, email, registrationDate, password FROM users WHERE email = ?', email);

    if (!userRow) {
      console.warn(`[LOGIN API] User not found for email: ${email}. Query returned:`, userRow);
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }
    
    console.log(`[LOGIN API] User found. ID: ${userRow.id}, Email: ${userRow.email}.`);
    
    if (typeof userRow.password !== 'string') {
      console.error(`[LOGIN API] User ${email} found but has NO PASSWORD or password is not a string. Type: ${typeof userRow.password}`);
      return NextResponse.json({ message: 'Internal server error - user data integrity issue.' }, { status: 500 });
    }

    console.log(`[LOGIN API] Comparing passwords for ${email}.`);
    console.log(`[LOGIN API]   - Received password (clean): "${cleanPassword}" (type: ${typeof cleanPassword})`);
    console.log(`[LOGIN API]   - Stored password:   "${userRow.password}" (type: ${typeof userRow.password})`);
    
    const isPasswordValid = cleanPassword === userRow.password;
    
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
