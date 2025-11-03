import { NextResponse } from 'next/server';
import { fetchTickers } from '@/lib/okx';
import { queryPrices } from '@/lib/db';

const MAIN_PAIRS = [
  'BNB-USDT-SWAP',
  'BTC-USDT-SWAP',
  'ETH-USDT-SWAP',
  'SOL-USDT-SWAP',
  'XRP-USDT-SWAP',
  'DOGE-USDT-SWAP',
];

/**
 * 获取主流币价格
 * 优先从数据库读取（data-collector已采集），数据不新鲜时实时请求
 */
export async function GET() {
  try {
    const now = Date.now();
    const prices: Record<string, number> = {};
    const needFetch: string[] = [];
    
    // 1. 先尝试从数据库读取（最近2分钟的数据）
    for (const instId of MAIN_PAIRS) {
      const dbPrices = queryPrices(instId, now - 2 * 60 * 1000, 1);
      if (dbPrices.length > 0) {
        prices[instId] = dbPrices[dbPrices.length - 1].price;
      } else {
        needFetch.push(instId);
      }
    }
    
    // 2. 数据库没有的，实时获取
    if (needFetch.length > 0) {
      console.log('[api/prices] 从OKX实时获取:', needFetch.join(', '));
      const freshPrices = await fetchTickers(needFetch);
      Object.assign(prices, freshPrices);
    } else {
      console.log('[api/prices] 全部使用数据库缓存');
    }
    
    return NextResponse.json(prices);
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}