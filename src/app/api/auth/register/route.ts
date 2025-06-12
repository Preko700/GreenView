
import { NextResponse, type NextRequest } from 'next/server';
import { getDb, hashPassword } from '@/lib/db';
import type { RegistrationCredentials } from '@/lib/types'; // Assuming this type exists

export async function POST(request: NextRequest) {
  try {
    const { name, email, password, country } = (await request.json()) as RegistrationCredentials & {country?: string};

    if (!name || !email || !password) {
      return NextResponse.json({ message: 'Name, email, and password are required' }, { status: 400 });
    }

    // Basic email validation
    if (!/\S+@\S+\.\S+/.test(email)) {
        return NextResponse.json({ message: 'Invalid email format' }, { status: 400 });
    }
    if (password.length < 6) {
        return NextResponse.json({ message: 'Password must be at least 6 characters long' }, { status: 400 });
    }


    const db = await getDb();
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', email);

    if (existingUser) {
      return NextResponse.json({ message: 'User with this email already exists' }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);
    const registrationDate = Date.now();

    const result = await db.run(
      'INSERT INTO users (name, email, password, country, registrationDate) VALUES (?, ?, ?, ?, ?)',
      name,
      email,
      hashedPassword,
      country || null,
      registrationDate
    );

    if (!result.lastID) {
        return NextResponse.json({ message: 'Failed to register user' }, { status: 500 });
    }

    const newUser = {
        id: result.lastID,
        name,
        email,
        country,
        registrationDate,
    }

    return NextResponse.json({ message: 'User registered successfully', user: newUser }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
