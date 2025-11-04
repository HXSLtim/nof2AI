import { NextResponse } from 'next/server';
import { fetchPositions, placeOrder, fetchAccountConfig } from '@/lib/okx';

/**
 * 一键平仓API - 直接调用OKX API
 * POST /api/positions/close-all
 * 
 * 不经过execute-decision，直接向OKX发送平仓指令
 */
export async function POST() {
  try {
    console.log('[close-all] ========== 一键平仓开始 ==========');
    
    // 1. 获取所有当前仓位
    const positions = await fetchPositions();
    
    if (positions.length === 0) {
      return NextResponse.json({
        success: false,
        message: '当前没有仓位'
      }, { status: 400 });
    }
    
    console.log(`[close-all] 找到${positions.length}个仓位，准备平仓`);
    
    // 2. 获取账户持仓模式
    const accountConfig = await fetchAccountConfig();
    const isLongShortMode = accountConfig.posMode === 'long_short_mode';
    
    console.log(`[close-all] 账户持仓模式: ${accountConfig.posMode}`);
    
    // 3. 并行平仓所有仓位
    const results = await Promise.allSettled(
      positions.map(async (position) => {
        try {
          const coin = position.coin;
          const symbol = `${coin}/USDT:USDT`;
          const side: 'buy' | 'sell' = position.side === 'long' ? 'sell' : 'buy';
          const posSide: 'long' | 'short' = position.side;
          const quantity = position.contracts;
          
          console.log(`[close-all] 平仓 ${coin} ${posSide} (${quantity}张)`);
          
          // 根据持仓模式决定是否传递posSide
          const closingPosSide = isLongShortMode ? posSide : undefined;
          
          // 直接调用placeOrder
          const order = await placeOrder(
            symbol,
            side,
            'market',
            quantity,
            undefined,
            closingPosSide,
            false,  // 不使用reduceOnly
            (position as any).mgnMode || 'cross'
          );
          
          console.log(`[close-all] ✅ ${coin} 平仓成功，订单ID: ${order.id}`);
          
          return {
            coin,
            success: true,
            orderId: order.id
          };
          
        } catch (error) {
          const err = error as Error;
          console.error(`[close-all] ❌ ${position.coin} 平仓失败:`, err.message);
          
          return {
            coin: position.coin,
            success: false,
            error: err.message
          };
        }
      })
    );
    
    // 4. 统计结果
    const successResults = results.filter(r => r.status === 'fulfilled' && r.value.success);
    const failedResults = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
    
    console.log(`[close-all] 完成：成功${successResults.length}个，失败${failedResults.length}个`);
    console.log('[close-all] ========== 一键平仓结束 ==========');
    
    // 5. 返回结果
    if (failedResults.length === 0) {
      return NextResponse.json({
        success: true,
        message: `成功平仓${successResults.length}个仓位`,
        results: results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean)
      });
    } else if (successResults.length > 0) {
      return NextResponse.json({
        success: true,
        message: `成功${successResults.length}个，失败${failedResults.length}个`,
        results: results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean)
      });
    } else {
      return NextResponse.json({
        success: false,
        message: '全部平仓失败',
        results: results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean)
      }, { status: 500 });
    }
    
  } catch (error) {
    const err = error as Error;
    console.error('[close-all] 一键平仓异常:', err);
    
    return NextResponse.json({
      success: false,
      error: err.message || '一键平仓失败'
    }, { status: 500 });
  }
}

/**
 * 指定 Node.js 运行时
 */
export const runtime = 'nodejs';

