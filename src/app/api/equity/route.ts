import { NextRequest, NextResponse } from 'next/server';
import { queryEquity } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/equity
 * 返回账户总金额时间序列，默认最近 72 小时
 * 可选参数：hours（整数，例如 24、72、168）
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hours = Number(searchParams.get('hours') || '72');
  const since = Date.now() - Math.max(1, hours) * 3600 * 1000;
  const rows = queryEquity(since);
  return NextResponse.json({ success: true, data: rows });
}