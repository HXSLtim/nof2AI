import { NextRequest, NextResponse } from 'next/server';
import { placeOrder, fetchAvailableUSDT, fetchTickers, placeTPSL, setLeverage, fetchPositions } from '@/lib/okx';
import { ParsedDecision } from '@/lib/ai-trading-prompt';
import { 
  calculateMarginRequirement, 
  validateSufficientMargin, 
  adjustOrderToAvailableFunds,
  formatMarginCalculation 
} from '@/lib/margin-calculator';

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
    
    // 🔍 关键日志：记录收到的决策参数（用于调试币种错误问题）
    console.log('[execute-decision] ========== 收到决策请求 ==========');
    console.log('[execute-decision] 请求体:', JSON.stringify({
      symbol: decision?.symbol,
      action: decision?.action,
      leverage: decision?.leverage,
      sizeUSDT: decision?.sizeUSDT,
      takeProfit: decision?.takeProfit,
      stopLoss: decision?.stopLoss
    }, null, 2));
    console.log('[execute-decision] ================================================');

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
    // const accountTotal = await fetchAccountTotal(); // ✅ 暂时不需要
    const availableCash = await fetchAvailableUSDT();
    const currentPositions = await fetchPositions();

    // console.log('[execute-decision] 账户信息:', { 总资产: accountTotal, 可用资金: availableCash, 币种: decision.symbol, 操作: decision.action }); // ✅ 屏蔽
    
    // 检查是否已有相同方向的仓位（防止重复开仓）
    if (decision.action === 'OPEN_LONG' || decision.action === 'OPEN_SHORT') {
      const targetSide = decision.action === 'OPEN_LONG' ? 'long' : 'short';
      const existingPosition = currentPositions.find(p => 
        p.coin === decision.symbol && p.side === targetSide
      );
      
      if (existingPosition) {
        console.warn('[execute-decision] ⚠️ 检测到已有相同方向的仓位:', {
          币种: decision.symbol,
          方向: targetSide,
          合约数: existingPosition.contracts,
          入场价: existingPosition.entryPrice
        });
        
        return NextResponse.json({ 
          success: false, 
          error: `已存在${decision.symbol}的${targetSide === 'long' ? '多头' : '空头'}仓位（${existingPosition.contracts}张，入场价$${existingPosition.entryPrice}）。请先平仓或等待当前仓位结束。`,
          existingPosition: {
            symbol: decision.symbol,
            side: targetSide,
            contracts: existingPosition.contracts,
            entryPrice: existingPosition.entryPrice,
            unrealizedPnl: existingPosition.unrealizedPnl
          }
        }, { status: 400 });
      }
      
      console.log('[execute-decision] ✅ 无重复仓位，可以开仓');
    }
    
    // 检查是否有足够资金
    if (availableCash < 10) {
      return NextResponse.json({ 
        success: false, 
        error: `账户可用资金不足（仅$${availableCash.toFixed(2)}）。请充值或等待现有仓位平仓释放资金。` 
      }, { status: 400 });
    }

    // 智能计算订单金额：使用精确的保证金计算
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
      
      // console.log('[execute-decision] 当前市价:', entryPrice); // ✅ 屏蔽
    }
    
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
    
    // 计算1张合约需要多少USDT（含手续费和缓冲）
    const usdtFor1Contract = (entryPrice / leverage) * 1.06; // 保证金 + 手续费(0.1%) + 5%缓冲
    // console.log(`[execute-decision] 📊 1张${decision.symbol}合约需要: $${usdtFor1Contract.toFixed(2)} USDT (${leverage}x杠杆)`); // ✅ 屏蔽
    
    // ⚠️ 提前检查：如果连1张合约都买不起，直接拒绝
    if (availableCash < usdtFor1Contract) {
      console.log(`[execute-decision] ❌ 可用资金不足以购买1张${decision.symbol}合约`);
      return NextResponse.json({ 
        success: false, 
        error: `资金不足：需要至少$${usdtFor1Contract.toFixed(2)} USDT才能开1张${decision.symbol}合约（${leverage}x杠杆），但只有$${availableCash.toFixed(2)} USDT。\n\n建议：\n1. 选择价格更低的币种（如BNB/SOL/XRP/DOGE）\n2. 提高杠杆倍数（风险更大）\n3. 充值更多USDT\n4. 等待现有仓位平仓释放资金` 
      }, { status: 400 });
    }
    
    // 确定请求的订单金额
    let requestedUSDT = 0;
    
    if (decision.sizeUSDT && decision.sizeUSDT > 0) {
      // AI指定了金额
      requestedUSDT = decision.sizeUSDT;
      console.log(`[execute-decision] 💡 AI指定金额: $${decision.sizeUSDT}`);
      
      // 🔧 智能调整：如果AI给的金额太小，自动提升到至少能买1张
      if (requestedUSDT < usdtFor1Contract) {
        const oldAmount = requestedUSDT;
        requestedUSDT = usdtFor1Contract;
        console.log(`[execute-decision] ⚡ 自动提升: $${oldAmount} → $${requestedUSDT.toFixed(2)} (确保至少1张合约)`);
      }
      
      // 限制：不超过最大限额和可用资金
      requestedUSDT = Math.min(requestedUSDT, maxOrderForSymbol, availableCash * 0.9);
      console.log(`[execute-decision] ✅ 最终金额: $${requestedUSDT.toFixed(2)}`);
    } else {
      // AI未提供金额，系统兜底自动计算
      console.warn(`[execute-decision] ⚠️ AI未提供size_usdt，系统自动计算`);
      
      // 使用以下较大者：30%可用资金 或 1张合约所需
      const conservative = Math.min(
        availableCash * 0.3,  // 30%可用资金（保守）
        maxOrderForSymbol
      );
      
      requestedUSDT = Math.max(conservative, usdtFor1Contract);
      requestedUSDT = Math.min(requestedUSDT, availableCash * 0.9); // 不超过可用资金
      
      console.log(`[execute-decision] 系统计算金额: $${requestedUSDT.toFixed(2)}`);
    }
    
    // === 使用保证金计算器精确计算 ===
    console.log(`\n[execute-decision] ========== 保证金计算开始 ==========`);
    console.log(`币种: ${decision.symbol}, 价格: ${entryPrice}, 杠杆: ${leverage}x`);
    console.log(`请求金额: $${requestedUSDT.toFixed(2)}, 可用资金: $${availableCash.toFixed(2)}`);
    
    // 计算保证金需求
    let marginCalc = calculateMarginRequirement(
      decision.symbol,
      entryPrice,
      requestedUSDT,
      leverage
    );
    
    console.log(formatMarginCalculation(marginCalc, decision.symbol));
    
    // 验证是否有足够资金
    let validation = validateSufficientMargin(availableCash, marginCalc);
    
    if (!validation.isValid) {
      console.log(`[execute-decision] ⚠️ 资金不足，尝试自动调整订单大小...`);
      
      // 尝试自动调整到可用资金范围内
      const adjusted = adjustOrderToAvailableFunds(
        decision.symbol,
        entryPrice,
        requestedUSDT,
        leverage,
        availableCash
      );
      
      if (!adjusted) {
        console.log(`[execute-decision] ❌ 无法调整订单：即使使用全部可用资金也无法满足最小合约张数要求`);
        return NextResponse.json({ 
          success: false, 
          error: `资金不足且无法调整订单。${validation.message}\n\n建议：\n1. 充值更多USDT\n2. 等待现有仓位平仓释放资金\n3. 降低杠杆倍数\n4. 选择价格更低的币种` 
        }, { status: 400 });
      }
      
      // 使用调整后的结果
      marginCalc = adjusted;
      validation = validateSufficientMargin(availableCash, marginCalc);
      
      console.log(`[execute-decision] ✅ 订单已自动调整: $${requestedUSDT} → $${marginCalc.actualUSDT.toFixed(2)}`);
    }
    
    // 最终验证
    if (!validation.isValid) {
      console.log(`[execute-decision] ❌ 验证失败: ${validation.message}`);
      return NextResponse.json({ 
        success: false, 
        error: validation.message 
      }, { status: 400 });
    }
    
    console.log(`[execute-decision] ✅ 保证金验证通过`);
    console.log(`[execute-decision] ========== 保证金计算结束 ==========\n`);
    
    // 使用计算出的合约张数
    const quantity = marginCalc.contractSize;

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
      
      // 使用实际仓位的数量和保证金模式
      const actualQuantity = Math.abs(Number(targetPosition.contracts || 0));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const positionMgnMode = ((targetPosition as any).mgnMode as 'cross' | 'isolated' | undefined) || 'cross';
      
      console.log('[execute-decision] 平仓参数:', {
        数量: actualQuantity,
        保证金模式: positionMgnMode,
        杠杆: targetPosition.leverage,
        入场价: targetPosition.entryPrice
      });
      
      // 直接使用实际仓位数量和保证金模式进行平仓
      const mainOrder = await placeOrder(
        symbol,
        side,
        'market',
        actualQuantity,
        undefined,
        posSide,
        true, // reduceOnly
        positionMgnMode // ✅ 使用仓位的保证金模式
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
    console.log(`[execute-decision] 📋 订单: ${decision.symbol} ${side} ${quantity.toFixed(8)}张, 名义$${marginCalc.notionalValue.toFixed(0)}, 保证金$${marginCalc.requiredMargin.toFixed(0)}`);

    // 确定保证金模式（默认全仓，未来可以从decision中读取）
    const tdMode: 'cross' | 'isolated' = 'cross';
    
    // 1. 先设置杠杆倍数（仅开仓时需要）
    if (!reduceOnly) {
      const instId = `${decision.symbol}-USDT-SWAP`;
      await setLeverage(instId, leverage, tdMode, posSide);
      console.log(`[execute-decision] ⚙️ 杠杆: ${leverage}x, 模式: ${tdMode}`);
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
      tdMode // ✅ 使用统一的保证金模式
    );

    // console.log('[execute-decision] 主订单已下单:', mainOrder); // ✅ 已在placeOrder中输出

    // 如果是开仓且有止盈止损，下条件单
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tpslOrders: any[] = [];
    if (!reduceOnly && (decision.takeProfit || decision.stopLoss)) {
      try {
        const instId = `${decision.symbol}-USDT-SWAP`;
        tpslOrders = await placeTPSL(
          instId,
          posSide,
          quantity,
          decision.takeProfit,
          decision.stopLoss,
          tdMode // ✅ 使用与主订单相同的保证金模式
        );
        console.log(`[execute-decision] ✅ 止盈止损: ${tpslOrders.length}个`);
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
        quantity: quantity,
        status: mainOrder.status
      },
      decision: {
        action: decision.action,
        symbol: decision.symbol,
        confidence: decision.confidence,
        reasoning: decision.reasoning
      },
      marginInfo: {
        contractSize: marginCalc.contractSize,
        notionalValue: marginCalc.notionalValue.toFixed(2),
        requiredMargin: marginCalc.requiredMargin.toFixed(2),
        fees: marginCalc.totalFees.toFixed(4),
        totalUsed: marginCalc.recommendedAmount.toFixed(2),
        leverage: leverage
      },
      riskManagement: {
        takeProfit: decision.takeProfit,
        stopLoss: decision.stopLoss,
        tpslOrders: tpslOrders.length > 0 ? tpslOrders : undefined,
        note: tpslOrders.length > 0 
          ? `已设置止盈止损单（${tpslOrders.length}个）` 
          : decision.takeProfit || decision.stopLoss 
            ? quantity < 1 
              ? `⚠️ 止盈止损单被跳过：仓位小于1张（${quantity.toFixed(8)}张），OKX条件单要求至少1张。建议：增加仓位或在OKX手动设置止盈止损。` 
              : '止盈止损单下单失败，请手动设置'
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

