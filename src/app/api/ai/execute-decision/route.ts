import { NextRequest, NextResponse } from 'next/server';
import { placeOrder, fetchAccountTotal, fetchAvailableUSDT, fetchTickers, placeTPSL, setLeverage, fetchPositions } from '@/lib/okx';
import { ParsedDecision } from '@/lib/ai-trading-prompt';

/**
 * AI 决策执行 API
 * POST /api/ai/execute-decision
 * 
 * 执行已批准的AI交易决策
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const decision: ParsedDecision = body.decision;

    if (!decision || !decision.symbol || !decision.action) {
      return NextResponse.json({ 
        success: false, 
        error: '无效的决策数据' 
      }, { status: 400 });
    }

    // HOLD 决策不需要执行
    if (decision.action === 'HOLD') {
      return NextResponse.json({ 
        success: true, 
        message: 'HOLD 决策，无需执行订单',
        action: 'HOLD'
      });
    }

    // 获取账户信息
    const accountTotal = await fetchAccountTotal();
    const availableCash = await fetchAvailableUSDT();

    console.log('[execute-decision] 账户信息:', {
      总资产: accountTotal,
      可用资金: availableCash,
      币种: decision.symbol,
      操作: decision.action
    });
    
    // 检查是否有足够资金
    if (availableCash < 10) {
      return NextResponse.json({ 
        success: false, 
        error: `账户可用资金不足（仅$${availableCash.toFixed(2)}）。请充值或等待现有仓位平仓释放资金。` 
      }, { status: 400 });
    }

    // 智能计算订单金额：系统自动计算，确保至少1张合约
    const leverage = decision.leverage || 5; // 默认5x杠杆
    
    // 获取当前市场价格（用于计算合约张数）
    let entryPrice = decision.entryPrice || 0;
    
    if (!entryPrice || entryPrice === 0) {
      const instId = `${decision.symbol}-USDT-SWAP`;
      const tickers = await fetchTickers([instId]);
      entryPrice = tickers[instId];
      
      if (!entryPrice) {
        return NextResponse.json({ 
          success: false, 
          error: `无法获取 ${decision.symbol} 的当前市价` 
        }, { status: 400 });
      }
      
      console.log('[execute-decision] 当前市价:', entryPrice);
    }
    
    // 计算需要多少USDT才能买到1张合约
    const usdtFor1Contract = entryPrice / leverage;
    console.log(`[execute-decision] 1张合约需要: $${usdtFor1Contract.toFixed(2)} USDT (杠杆${leverage}x)`);
    
    // 不同币种的最大单笔订单金额限制（保守设置，避免超过OKX限额）
    const maxOrderLimits: Record<string, number> = {
      'BTC': 2000,   // BTC最大$2000 USDT
      'ETH': 1500,   // ETH最大$1500 USDT
      'SOL': 800,    // SOL最大$800 USDT
      'BNB': 800,    // BNB最大$800 USDT
      'XRP': 500,    // XRP最大$500 USDT（小币种更保守）
      'DOGE': 500,   // DOGE最大$500 USDT
    };
    const maxOrderForSymbol = maxOrderLimits[decision.symbol] || 500;
    
    // 计算系统推荐的订单金额
    let orderValue = 0;
    
    if (decision.sizeUSDT && decision.sizeUSDT > 0) {
      // AI指定了金额，使用它
      orderValue = decision.sizeUSDT;
      console.log(`[execute-decision] ✅ 使用AI指定金额: $${orderValue}`);
    } else {
      // AI未提供金额，系统兜底自动计算
      console.warn(`[execute-decision] ⚠️ AI未提供size_usdt，系统自动计算`);
      
      const minForContract = usdtFor1Contract * 1.5; // 多预留50%确保够
      const conservative = availableCash * 0.3; // 30%可用资金（保守）
      
      // 取两者中较大的，但不超过最大限制
      orderValue = Math.min(
        Math.max(minForContract, conservative),
        maxOrderForSymbol,
        availableCash
      );
      
      console.log(`[execute-decision] 系统计算金额: $${orderValue.toFixed(2)} (30%可用资金或最小合约值)`);
    }
    
    // 最终检查：不超过该币种的最大限制
    if (orderValue > maxOrderForSymbol) {
      orderValue = maxOrderForSymbol;
      console.log(`[execute-decision] 订单金额超限，限制为${decision.symbol}最大值: $${maxOrderForSymbol}`);
    }
    
    // 严格检查：不超过可用资金的90%（留10%buffer）
    const maxUsableCash = availableCash * 0.9;
    if (orderValue > maxUsableCash) {
      orderValue = maxUsableCash;
      console.log(`[execute-decision] 订单金额超过可用资金90%，限制为: $${orderValue.toFixed(2)}`);
    }
    
    // 检查可用资金是否足够
    if (availableCash < usdtFor1Contract) {
      return NextResponse.json({ 
        success: false, 
        error: `可用资金$${availableCash.toFixed(2)}不足以购买1张${decision.symbol}合约（需要至少$${usdtFor1Contract.toFixed(2)}）。建议：等待现有仓位平仓释放资金，或充值。` 
      }, { status: 400 });
    }
    
    // 确保至少能买1张
    if (orderValue < usdtFor1Contract) {
      orderValue = usdtFor1Contract;
      console.log(`[execute-decision] 订单金额调整为最小值: $${orderValue.toFixed(2)}`);
    }
    
    // 最后验证：订单金额不能超过可用资金
    if (orderValue > availableCash) {
      return NextResponse.json({ 
        success: false, 
        error: `订单金额$${orderValue.toFixed(2)}超过可用资金$${availableCash.toFixed(2)}。请等待现有仓位平仓或充值。` 
      }, { status: 400 });
    }
    
    console.log(`[execute-decision] 最终订单金额: $${orderValue.toFixed(2)} (可用资金: $${availableCash.toFixed(2)})`);


    // 构建交易对（OKX格式：BTC/USDT:USDT）
    const symbol = `${decision.symbol}/USDT:USDT`;
    
    // 确定订单方向
    let side: 'buy' | 'sell';
    let posSide: 'long' | 'short';

    switch (decision.action) {
      case 'OPEN_LONG':
        side = 'buy';
        posSide = 'long';
        break;
      case 'OPEN_SHORT':
        side = 'sell';
        posSide = 'short';
        break;
      case 'CLOSE_LONG':
        side = 'sell';
        posSide = 'long';
        break;
      case 'CLOSE_SHORT':
        side = 'buy';
        posSide = 'short';
        break;
      default:
        return NextResponse.json({ 
          success: false, 
          error: `未知的操作类型: ${decision.action}` 
        }, { status: 400 });
    }

    const reduceOnly = decision.action === 'CLOSE_LONG' || decision.action === 'CLOSE_SHORT';

    // 如果是平仓，先检查是否真的有仓位
    if (reduceOnly) {
      console.log('[execute-decision] 检查是否有对应仓位...');
      const positions = await fetchPositions();
      const targetPosition = positions.find(p => 
        p.coin === decision.symbol && 
        ((decision.action === 'CLOSE_LONG' && p.side === 'long') ||
         (decision.action === 'CLOSE_SHORT' && p.side === 'short'))
      );
      
      if (!targetPosition) {
        return NextResponse.json({ 
          success: false, 
          error: `无法平仓：账户中没有${decision.symbol}的${decision.action === 'CLOSE_LONG' ? '多头' : '空头'}仓位。可能已被止盈止损自动平仓，或之前开仓失败。` 
        }, { status: 400 });
      }
      
      console.log('[execute-decision] 找到仓位:', targetPosition);
      
      // 使用实际仓位的数量
      const actualQuantity = Math.abs(Number(targetPosition.contracts || 0));
      
      // 直接使用实际仓位数量进行平仓
      const mainOrder = await placeOrder(
        symbol,
        side,
        'market',
        actualQuantity,
        undefined,
        posSide,
        true, // reduceOnly
        'cross'
      );
      
      console.log('[execute-decision] 平仓订单已下:', mainOrder);
      
      return NextResponse.json({
        success: true,
        message: '平仓订单已执行',
        order: {
          orderId: mainOrder.id,
          symbol,
          side,
          posSide,
          quantity: actualQuantity,
          status: mainOrder.status
        },
        decision: {
          action: decision.action,
          symbol: decision.symbol,
          confidence: decision.confidence,
          reasoning: decision.reasoning
        }
      });
    }

    // 以下是开仓逻辑
    // 计算数量并向下取整（确保是整数张数）
    let quantity = (orderValue * leverage) / entryPrice;
    const quantityInt = Math.floor(quantity);
    
    // 检查最小张数（至少1张）
    if (quantityInt < 1) {
      return NextResponse.json({ 
        success: false, 
        error: `订单数量不足1张（当前: ${quantity.toFixed(6)}），请增加订单金额或杠杆` 
      }, { status: 400 });
    }
    
    quantity = quantityInt; // 使用整数张数

    console.log('[execute-decision] 订单信息:', {
      symbol,
      side,
      posSide,
      quantityOriginal: ((orderValue * leverage) / entryPrice).toFixed(6),
      quantityRounded: quantity,
      entryPrice,
      leverage,
      orderValue: orderValue.toFixed(2),
      reduceOnly
    });

    // 1. 先设置杠杆倍数（仅开仓时需要）
    if (!reduceOnly) {
      const instId = `${decision.symbol}-USDT-SWAP`;
      await setLeverage(instId, leverage, 'cross', posSide);
      console.log('[execute-decision] 杠杆已设置为', leverage, 'x');
    }

    // 2. 执行主订单（市价单）
    const mainOrder = await placeOrder(
      symbol,
      side,
      'market',
      quantity,
      undefined, // 市价单无需价格
      posSide,
      reduceOnly,
      'cross' // 全仓模式
    );

    console.log('[execute-decision] 主订单已下单:', mainOrder);

    // 如果是开仓且有止盈止损，下条件单
    let tpslOrders: any[] = [];
    if (!reduceOnly && (decision.takeProfit || decision.stopLoss)) {
      try {
        const instId = `${decision.symbol}-USDT-SWAP`;
        tpslOrders = await placeTPSL(
          instId,
          posSide,
          quantity,
          decision.takeProfit,
          decision.stopLoss
        );
        console.log('[execute-decision] 止盈止损单已下:', tpslOrders);
      } catch (tpslError) {
        console.error('[execute-decision] 止盈止损单失败（主订单已成功）:', tpslError);
        // 止盈止损失败不影响主订单，继续返回成功
      }
    }

    const result = {
      success: true,
      message: '订单已成功执行',
      order: {
        orderId: mainOrder.id,
        symbol,
        side,
        posSide,
        quantity: quantity.toFixed(6),
        status: mainOrder.status
      },
      decision: {
        action: decision.action,
        symbol: decision.symbol,
        confidence: decision.confidence,
        reasoning: decision.reasoning
      },
      riskManagement: {
        takeProfit: decision.takeProfit,
        stopLoss: decision.stopLoss,
        tpslOrders: tpslOrders.length > 0 ? tpslOrders : undefined,
        note: tpslOrders.length > 0 
          ? `已设置止盈止损单（${tpslOrders.length}个）` 
          : decision.takeProfit || decision.stopLoss 
            ? '止盈止损单下单失败，请手动设置' 
            : '未设置止盈止损'
      }
    };

    return NextResponse.json(result);

  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    console.error('[execute-decision] 执行失败:', {
      message: err.message,
      code: err.code,
      stack: err.stack
    });

    return NextResponse.json({ 
      success: false, 
      error: err.message || '执行决策失败',
      details: err.code
    }, { status: 500 });
  }
}

/**
 * 指定 Node.js 运行时
 */
export const runtime = 'nodejs';

