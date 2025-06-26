
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { RegistrationCredentials, User } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { name, email: originalEmail, password } = (await request.json()) as RegistrationCredentials;
    console.log(`[REGISTER API] Received request for email: ${originalEmail}`);

    if (!name || !originalEmail || !password) {
      console.error('[REGISTER API] Missing name, email, or password.');
      return NextResponse.json({ message: 'Name, email, and password are required' }, { status: 400 });
    }

    const email = originalEmail.toLowerCase();

    if (!/\S+@\S+\.\S+/.test(email)) {
        console.error(`[REGISTER API] Invalid email format: ${email}`);
        return NextResponse.json({ message: 'Invalid email format' }, { status: 400 });
    }
    if (password.length < 6) {
        console.error('[REGISTER API] Password too short.');
        return NextResponse.json({ message: 'Password must be at least 6 characters long' }, { status: 400 });
    }

    const db = await getDb();
    console.log('[REGISTER API] Database connection obtained.');

    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', email);

    if (existingUser) {
      console.warn(`[REGISTER API] User with email ${email} already exists.`);
      return NextResponse.json({ message: 'User with this email already exists' }, { status: 409 });
    }
    console.log(`[REGISTER API] User with email ${email} does not exist, proceeding with registration.`);

    const registrationDate = Date.now();

    // STORING PLAIN TEXT PASSWORD - FOR DIAGNOSTICS
    const result = await db.run(
      'INSERT INTO users (name, email, password, registrationDate) VALUES (?, ?, ?, ?)',
      name,
      email,
      password, // Storing plain text password
      registrationDate
    );
    console.log('[REGISTER API] Insert result:', result);


    if (!result.lastID) {
        console.error('[REGISTER API] Failed to get lastID after insert.');
        return NextResponse.json({ message: 'Failed to register user' }, { status: 500 });
    }

    const newUser: User = {
        id: result.lastID,
        name,
        email,
        registrationDate,
    };
    
    console.log(`[REGISTER API] User ${email} registered successfully with ID: ${newUser.id}`);
    return NextResponse.json({ message: 'User registered successfully', user: newUser }, { status: 201 });
  } catch (error) {
    console.error('[REGISTER API] Unhandled registration error:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
