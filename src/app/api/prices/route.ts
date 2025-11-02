import { NextRequest, NextResponse } from 'next/server';
import { fetchTickers } from '@/lib/okx';

const MAIN_PAIRS = [
  'BNB-USDT-SWAP',
  'BTC-USDT-SWAP',
  'ETH-USDT-SWAP',
  'SOL-USDT-SWAP',
  'XRP-USDT-SWAP',
  'DOGE-USDT-SWAP',
];

export async function GET() {
  try {
    const prices = await fetchTickers(MAIN_PAIRS);
    return NextResponse.json(prices);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}