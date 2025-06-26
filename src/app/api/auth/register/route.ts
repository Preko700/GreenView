
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { RegistrationCredentials, User } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { name, email: originalEmail, password } = (await request.json()) as RegistrationCredentials;
    console.log(`[REGISTER API] Received registration request for email: ${originalEmail}`);

    if (!name || !originalEmail || !password) {
      console.error('[REGISTER API] Missing name, email, or password.');
      return NextResponse.json({ message: 'Name, email, and password are required' }, { status: 400 });
    }

    const email = originalEmail.toLowerCase();
    const registrationDate = Date.now();

    console.log(`[REGISTER API] Data to be inserted: Name: "${name}", Email: "${email}", Password: "${password}"`);
    
    const db = await getDb();
    console.log('[REGISTER API] Database connection obtained.');

    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', email);
    if (existingUser) {
      console.warn(`[REGISTER API] User with email ${email} already exists.`);
      return NextResponse.json({ message: 'User with this email already exists' }, { status: 409 });
    }
    
    console.log(`[REGISTER API] Inserting new user into database...`);
    const result = await db.run(
      'INSERT INTO users (name, email, password, registrationDate) VALUES (?, ?, ?, ?)',
      name,
      email,
      password,
      registrationDate
    );
    console.log('[REGISTER API] Insert result:', result);

    if (!result.lastID) {
        console.error('[REGISTER API] Failed to get lastID after insert. The user was not created.');
        return NextResponse.json({ message: 'Failed to register user due to a database error.' }, { status: 500 });
    }

    const newUser: User = {
        id: result.lastID,
        name,
        email,
        registrationDate,
    };
    
    console.log(`[REGISTER API] User ${email} registered successfully with ID: ${newUser.id}`);
    return NextResponse.json({ message: 'User registered successfully', user: newUser }, { status: 201 });
  } catch (error: any) {
    console.error('[REGISTER API] Unhandled registration error:', error);
    return NextResponse.json({ message: 'An internal server error occurred during registration.' }, { status: 500 });
  }
}
