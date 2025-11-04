import { NextResponse } from 'next/server';
import { fetchAccountBalance } from '@/lib/okx';
import { globalCache } from '@/services/CacheService';

/**
 * 获取账户余额API（带缓存优化）
 * GET /api/account/balance
 * 
 * 返回当前账户的实时余额信息
 */
export async function GET() {
  try {
    const cacheKey = 'account:balance';
    
    // 尝试从缓存获取
    const cached = globalCache.get<{
      totalEq: string;
      availBal: string;
      timestamp: number;
    }>(cacheKey);
    
    if (cached) {
      console.log('[api/account/balance] ✅ 从缓存获取余额 (缓存命中)');
      return NextResponse.json(
        {
          success: true,
          ...cached,
        },
        {
          headers: {
            'X-Cache': 'HIT',
            'X-Cache-Age': '3000', // 3秒缓存
          },
        }
      );
    }
    
    // 缓存未命中，从OKX获取
    console.log('[api/account/balance] 🔄 从OKX实时获取余额');
    const balance = await fetchAccountBalance();
    
    const responseData = {
      totalEq: balance.totalEq,
      availBal: balance.availBal,
      timestamp: Date.now(),
    };
    
    // 缓存结果（3秒）
    globalCache.set(cacheKey, responseData, 3000);
    
    return NextResponse.json(
      {
        success: true,
        ...responseData,
      },
      {
        headers: {
          'X-Cache': 'MISS',
        },
      }
    );
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[API /account/balance] Error:', err);
    
    return NextResponse.json(
      {
        success: false,
        error: err.message || '获取账户余额失败',
        totalEq: 0,
        availBal: 0,
      },
      { status: 500 }
    );
  }
}

/**
 * 指定 Node.js 运行时
 */
export const runtime = 'nodejs';

