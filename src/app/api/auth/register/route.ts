
import { NextResponse, type NextRequest } from 'next/server';
import { getDb, hashPassword } from '@/lib/db';
import type { RegistrationCredentials, User } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { name, email: originalEmail, password } = (await request.json()) as RegistrationCredentials;

    if (!name || !originalEmail || !password) {
      return NextResponse.json({ message: 'Name, email, and password are required' }, { status: 400 });
    }

    const email = originalEmail.toLowerCase(); // Convert to lowercase

    // Basic email validation
    if (!/\S+@\S+\.\S+/.test(email)) {
        return NextResponse.json({ message: 'Invalid email format' }, { status: 400 });
    }
    if (password.length < 6) {
        return NextResponse.json({ message: 'Password must be at least 6 characters long' }, { status: 400 });
    }


    const db = await getDb();
    console.log(`[REGISTER API] Checking for existing user with email: ${email}`);
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', email); // Use lowercase email for check

    if (existingUser) {
      console.log(`[REGISTER API] User with email ${email} already exists.`);
      return NextResponse.json({ message: 'User with this email already exists' }, { status: 409 });
    }

    console.log(`[REGISTER API] Hashing password for ${email}`);
    const hashedPassword = await hashPassword(password);
    const registrationDate = Date.now();

    console.log(`[REGISTER API] Inserting new user ${email} into database.`);
    const result = await db.run(
      'INSERT INTO users (name, email, password, registrationDate) VALUES (?, ?, ?, ?)',
      name,
      email, // Store lowercase email
      hashedPassword,
      registrationDate
    );

    if (!result.lastID) {
        console.error(`[REGISTER API] Failed to get lastID for user ${email} after insert.`);
        return NextResponse.json({ message: 'Failed to register user' }, { status: 500 });
    }

    const newUser: User = { // Ensure type matches the User interface
        id: result.lastID,
        name,
        email, // Return lowercase email
        country: null, // Set country to null as it's removed from registration
        registrationDate,
        profileImageUrl: null,
    };
    
    console.log(`[REGISTER API] User ${email} registered successfully with ID: ${newUser.id}`);
    return NextResponse.json({ message: 'User registered successfully', user: newUser }, { status: 201 });
  } catch (error) {
    console.error('[REGISTER API] Registration error:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
