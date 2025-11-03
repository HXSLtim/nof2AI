import { NextRequest, NextResponse } from 'next/server';
import { queryChatHistory } from '@/lib/db';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get('limit');
  const sinceParam = url.searchParams.get('since');
  const limit = limitParam ? Number(limitParam) : undefined;
  const since = sinceParam ? Number(sinceParam) : undefined;
  try {
    const rows = queryChatHistory(limit, since);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}