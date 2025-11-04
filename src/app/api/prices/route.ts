import { NextResponse } from 'next/server';
import { fetchTickers } from '@/lib/okx';
import { queryPrices } from '@/lib/db';
import { pricesCache } from '@/services/CacheService';

const MAIN_PAIRS = [
  'BNB-USDT-SWAP',
  'BTC-USDT-SWAP',
  'ETH-USDT-SWAP',
  'SOL-USDT-SWAP',
  'XRP-USDT-SWAP',
  'DOGE-USDT-SWAP',
];

/**
 * 获取主流币价格（带缓存优化）
 * 优先使用缓存，减少OKX API调用
 */
export async function GET() {
  try {
    const cacheKey = 'main_pairs_prices';
    
    // 尝试从缓存获取
    const cached = pricesCache.get<Record<string, number>>(cacheKey);
    if (cached) {
      console.log('[api/prices] ✅ 从缓存获取价格 (缓存命中)');
      return NextResponse.json(cached, {
        headers: {
          'X-Cache': 'HIT',
          'X-Cache-Age': '3000', // 3秒缓存
        },
      });
    }
    
    // 缓存未命中，从OKX获取
    console.log('[api/prices] 🔄 从OKX实时获取价格:', new Date().toLocaleTimeString());
    const prices = await fetchTickers(MAIN_PAIRS);
    
    // 添加调试日志
    const priceList = Object.entries(prices).map(([id, price]) => {
      const coin = id.split('-')[0];
      return `${coin}: $${price}`;
    });
    console.log('[api/prices] 📊 价格数据:', priceList.join(', '));
    
    // 缓存结果（3秒）
    pricesCache.set(cacheKey, prices, 3000);
    
    return NextResponse.json(prices, {
      headers: {
        'X-Cache': 'MISS',
      },
    });
  } catch (e) {
    const err = e as Error;
    console.error('[api/prices] ❌ 获取价格失败:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}