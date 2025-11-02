/**
 * 测试 OKX 连接（使用 .env.local）
 * POST /api/orders/test
 */
import { NextResponse } from 'next/server';
import { okx } from '@/lib/okx';

export async function POST() {
  try {
    await okx.fetchBalance();
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[orders/test] catch ->', err);
    return NextResponse.json({ error: (err as Error).message || '未知错误' }, { status: 400 });
  }
}