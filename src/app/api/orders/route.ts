import { NextResponse } from 'next/server';
import { z } from 'zod';
import { placeOrder } from '@/lib/okx';

export const runtime = 'nodejs';

const OrderSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  type: z.enum(['market', 'limit']),
  amount: z.number().positive(),
  price: z.number().positive().optional(),
});

/**
 * POST /api/orders
 * 校验请求体并调用 OKX 下单
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = OrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_order', detail: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { symbol, side, type, amount, price } = parsed.data;

    if (type === 'limit' && !price) {
      return NextResponse.json(
        { error: 'price_required_for_limit' },
        { status: 400 }
      );
    }

    const order = await placeOrder(symbol, side, type, amount, price);

    return NextResponse.json({ ok: true, order }, { status: 201 });
  } catch (err: unknown) {
    console.error('[OKX Order Error]', err);
    return NextResponse.json(
      { error: 'order_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}