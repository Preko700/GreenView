
import { NextResponse, type NextRequest } from 'next/server';
import { getDb, comparePassword } from '@/lib/db';
import type { EmailPasswordCredentials, User } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = (await request.json()) as EmailPasswordCredentials;

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password are required' }, { status: 400 });
    }

    const db = await getDb();
    const userRow = await db.get<User & { password?: string } >('SELECT id, name, email, country, registrationDate, profileImageUrl FROM users WHERE email = ?', email);

    if (!userRow || !userRow.password) {
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }

    const isPasswordValid = await comparePassword(password, userRow.password);

    if (!isPasswordValid) {
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userToReturn } = userRow; // Exclude password from the returned user object

    return NextResponse.json({ message: 'Login successful', user: userToReturn }, { status: 200 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
