import { NextResponse } from 'next/server';
import { fetchPositions } from '@/lib/okx';

export async function GET() {
  try {
    const list = await fetchPositions();
    return NextResponse.json({ success: true, data: list });
  } catch (err: any) {
    console.error('[api/positions]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}