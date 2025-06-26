
// This route is deprecated and no longer used in the simplified support system.
// It can be removed or left empty to avoid breaking any potential old links.
import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ message: "This endpoint is deprecated." }, { status: 410 });
}

export async function POST() {
    return NextResponse.json({ message: "This endpoint is deprecated." }, { status: 410 });
}
