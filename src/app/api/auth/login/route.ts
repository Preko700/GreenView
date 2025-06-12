
import { NextResponse, type NextRequest } from 'next/server';
import { getDb, comparePassword } from '@/lib/db';
import type { EmailPasswordCredentials, User } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { email: originalEmail, password } = (await request.json()) as EmailPasswordCredentials;

    if (!originalEmail || !password) {
      return NextResponse.json({ message: 'Email and password are required' }, { status: 400 });
    }

    const email = originalEmail.toLowerCase(); // Convert to lowercase

    const db = await getDb();
    // Fetch the password hash along with other user details
    const userRow = await db.get<User & { password?: string } >('SELECT id, name, email, country, registrationDate, profileImageUrl, password FROM users WHERE email = ?', email);

    if (!userRow) {
      // User not found with this email
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }
    
    // Ensure password hash exists (should always exist due to NOT NULL constraint if user is found)
    if (!userRow.password) {
      console.error(`User ${email} found but has no password hash in DB.`); // Should not happen with current schema
      return NextResponse.json({ message: 'Internal server error' }, { status: 500 }); // Or a generic auth error
    }

    const isPasswordValid = await comparePassword(password, userRow.password);

    if (!isPasswordValid) {
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }

    // Exclude password from the returned user object
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userToReturn } = userRow; 

    return NextResponse.json({ message: 'Login successful', user: userToReturn }, { status: 200 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ message: 'An internal server error occurred' }, { status: 500 });
  }
}
