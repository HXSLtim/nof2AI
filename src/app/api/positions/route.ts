import { NextResponse } from 'next/server';
import { fetchPositions } from '@/lib/okx';
import { positionsCache } from '@/services/CacheService';

export async function GET() {
  try {
    const cacheKey = 'positions';
    
    // 尝试从缓存获取
    const cached = positionsCache.get<any[]>(cacheKey);
    if (cached) {
      console.log('[api/positions] ✅ 从缓存获取仓位 (缓存命中)');
      return NextResponse.json(
        { success: true, data: cached },
        {
          headers: {
            'X-Cache': 'HIT',
            'X-Cache-Age': '5000', // 5秒缓存
          },
        }
      );
    }
    
    // 缓存未命中，从OKX获取
    console.log('[api/positions] 🔄 从OKX实时获取仓位');
    const list = await fetchPositions();
    
    // 缓存结果（5秒）
    positionsCache.set(cacheKey, list, 5000);
    
    return NextResponse.json(
      { success: true, data: list },
      {
        headers: {
          'X-Cache': 'MISS',
        },
      }
    );
  } catch (err: any) {
    console.error('[api/positions] Error', err.constructor.name, err.message || err);
    
    // 检查是否是 OKX API 认证错误
    const errorMsg = err.message || String(err);
    if (errorMsg.includes('50101') || errorMsg.includes('APIKey does not match')) {
      return NextResponse.json(
        {
          success: false,
          error: 'OKX API 认证失败：请检查环境变量配置（API Key、Secret、Password）及环境设置（OKX_SANDBOX）',
          details:
            '错误代码 50101 - API Key 与当前环境不匹配。如使用模拟盘，请确保 OKX_SANDBOX=true；如使用实盘，请确保 OKX_SANDBOX=false 或未设置。',
          rawError: errorMsg,
        },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      {
        success: false,
        error: err.message || '获取仓位失败',
        details: errorMsg,
      },
      { status: 500 }
    );
  }
}