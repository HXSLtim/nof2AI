import { NextResponse } from 'next/server';
import { insertEquity } from '@/lib/db';
import { fetchAccountTotal } from '@/lib/okx';

export const runtime = 'nodejs';

/**
 * POST /api/equity/snapshot
 * 计算并记录当前账户总金额快照（USDT 等值）
 */
export async function POST() {
  try {
    const total = await fetchAccountTotal();
    const ts = Date.now();
    insertEquity(ts, total);
    return NextResponse.json({ success: true, ts, total });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'snapshot failed' }, { status: 500 });
  }
}