
// This route is deprecated and no longer used in the simplified support system.
// It can be removed or left empty.
import { NextResponse } from 'next/server';

export async function POST() {
    return NextResponse.json({ message: "This endpoint is deprecated." }, { status: 410 });
}
