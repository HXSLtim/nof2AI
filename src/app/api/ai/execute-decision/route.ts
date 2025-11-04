import { NextRequest, NextResponse } from 'next/server';
import { placeOrder, fetchAvailableUSDT, fetchTickers, placeTPSL, setLeverage, fetchPositions, fetchAccountTotal } from '@/lib/okx';
import { ParsedDecision } from '@/lib/ai-trading-prompt';
import { 
  calculateMarginRequirement, 
  validateSufficientMargin, 
  adjustOrderToAvailableFunds,
  formatMarginCalculation 
} from '@/lib/margin-calculator';
import { MAX_ORDER_LIMITS } from '@/lib/constants';
import { recordTradeOpen, recordTradeClose } from '@/lib/trade-reflection';
import { PreTradeValidator } from '@/lib/risk-validator';

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
    const accountTotal = await fetchAccountTotal();
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
    
    // ========== 平仓操作：提前处理，不需要保证金计算 ==========
    const isClosing = decision.action === 'CLOSE_LONG' || decision.action === 'CLOSE_SHORT';
    
    if (isClosing) {
      console.log('\n[execute-decision] ========================================');
      console.log('[execute-decision] 🔄 平仓操作开始');
      console.log('[execute-decision] ========================================');
      
      // 🔍 检查账户持仓模式
      const { fetchAccountConfig } = await import('@/lib/okx');
      const accountConfig = await fetchAccountConfig();
      console.log(`[execute-decision] 🔍 账户持仓模式: ${accountConfig.posMode}`);
      console.log(`[execute-decision] 配置详情:`, JSON.stringify(accountConfig.raw, null, 2));
      
      // 构建交易对
      const symbol = `${decision.symbol}/USDT:USDT`;
      
      // 确定方向
      const side: 'buy' | 'sell' = decision.action === 'CLOSE_LONG' ? 'sell' : 'buy';
      const posSide: 'long' | 'short' = decision.action === 'CLOSE_LONG' ? 'long' : 'short';
      
      console.log(`[execute-decision] 平仓目标:`);
      console.log(`  - 币种: ${decision.symbol}`);
      console.log(`  - 仓位方向: ${posSide} (${posSide === 'long' ? '多头' : '空头'})`);
      console.log(`  - 平仓操作: ${side} (${side === 'buy' ? '买入平空' : '卖出平多'})`);
      console.log(`  - 交易对: ${symbol}`);
      
      // 检查是否有对应仓位
      console.log(`[execute-decision] 🔍 查找当前仓位...`);
      console.log(`[execute-decision] 当前所有仓位:`, JSON.stringify(currentPositions.map(p => ({
        coin: p.coin,
        side: p.side,
        contracts: p.contracts
      })), null, 2));
      
      const targetPosition = currentPositions.find(p => 
        p.coin === decision.symbol && 
        ((decision.action === 'CLOSE_LONG' && p.side === 'long') ||
         (decision.action === 'CLOSE_SHORT' && p.side === 'short'))
      );
      
      if (!targetPosition) {
        console.error(`[execute-decision] ❌ 未找到匹配的仓位`);
        console.error(`[execute-decision] 查找条件: 币种=${decision.symbol}, 方向=${posSide}`);
        return NextResponse.json({ 
          success: false, 
          error: `无法平仓：账户中没有${decision.symbol}的${decision.action === 'CLOSE_LONG' ? '多头' : '空头'}仓位。可能已被止盈止损自动平仓，或之前开仓失败。` 
        }, { status: 400 });
      }
      
      // ⚠️ 检查仓位大小是否满足最小精度要求
      const actualQuantity = Math.abs(Number(targetPosition.contracts || 0));
      if (actualQuantity < 0.01) {
        console.warn(`[execute-decision] ⚠️ 仓位过小（${actualQuantity.toFixed(8)}张 < 0.01），无法通过API平仓`);
        return NextResponse.json({ 
          success: false, 
          error: `该${decision.symbol}仓位过小（${actualQuantity.toFixed(8)}张），不满足OKX最小交易精度（0.01张）。请在OKX网页或APP上手动平仓，或等待止盈止损自动平仓。` 
        }, { status: 400 });
      }
      
      console.log(`[execute-decision] ✅ 找到目标仓位:`);
      console.log(`  - 币种: ${targetPosition.coin}`);
      console.log(`  - 方向: ${targetPosition.side}`);
      console.log(`  - 合约数: ${targetPosition.contracts}张`);
      console.log(`  - 入场价: $${targetPosition.entryPrice}`);
      console.log(`  - 未实现盈亏: $${targetPosition.unrealizedPnl}`);
      console.log(`  - 保证金模式: ${(targetPosition as any).mgnMode || 'cross'}`);
      
      // 使用实际仓位的数量和保证金模式（已在上面检查过精度）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const positionMgnMode = ((targetPosition as any).mgnMode as 'cross' | 'isolated' | undefined) || 'cross';
      
      // 🔧 根据账户持仓模式决定是否传递posSide
      const isLongShortMode = accountConfig.posMode === 'long_short_mode';
      const closingPosSide = isLongShortMode ? posSide : undefined;
      
      // 🔧 检查是否为限价平仓（有entryPrice参数）
      const isLimitOrder = decision.entryPrice && decision.entryPrice > 0;
      const orderType = isLimitOrder ? 'limit' : 'market';
      const limitPrice = isLimitOrder ? decision.entryPrice : undefined;
      
      console.log(`[execute-decision] 📋 平仓参数:`);
      console.log(`  - 交易对: ${symbol}`);
      console.log(`  - 订单类型: ${orderType} ${isLimitOrder ? `@ $${limitPrice}` : ''}`);
      console.log(`  - 方向: ${side}`);
      console.log(`  - 数量: ${actualQuantity}张`);
      console.log(`  - 保证金模式: ${positionMgnMode}`);
      console.log(`  - 持仓模式: ${accountConfig.posMode}`);
      console.log(`  - posSide: ${closingPosSide || 'undefined'} ${isLongShortMode ? '(双向持仓需要)' : '(单向持仓不传)'}`);
      console.log(`  - reduceOnly: false (不使用，让OKX自动判断)`);

      const mainOrder = await placeOrder(
        symbol,
        side,
        orderType, // 🔧 支持限价单
        actualQuantity,
        limitPrice, // 🔧 限价单传入价格
        closingPosSide, // 🔧 双向持仓传入posSide，单向持仓传undefined
        false, // 🔧 不使用reduceOnly
        positionMgnMode
      );
      
      console.log(`[execute-decision] ✅ 平仓成功!`);
      console.log(`[execute-decision] 订单ID: ${mainOrder.id}`);
      console.log(`[execute-decision] 订单状态: ${mainOrder.status}`);
      console.log('[execute-decision] ========================================\n');
      
      // 🔄 记录平仓反思（异步，不阻塞响应）
      const exitPrice = mainOrder.average || (mainOrder as unknown as { price?: number }).price || 0;
      const pnlAmount = targetPosition.unrealizedPnl || 0;
      
      // 查找对应的开仓决策ID（从活跃决策中查找）
      const { queryActiveOpenDecisions } = await import('@/lib/db');
      const activeDecisions = queryActiveOpenDecisions();
      const matchingOpenDecision = activeDecisions.find(d => {
        const titleUpper = d.title.toUpperCase();
        return titleUpper.includes(decision.symbol) && 
               ((posSide === 'long' && titleUpper.includes('OPEN_LONG')) ||
                (posSide === 'short' && titleUpper.includes('OPEN_SHORT')));
      });
      
      if (matchingOpenDecision) {
        console.log(`[execute-decision] 📊 记录平仓反思: ${matchingOpenDecision.id}`);
        try {
          await recordTradeClose({
            openDecisionId: matchingOpenDecision.id,
            closeDecisionId: body.decisionId || 'manual-close',
            exitPrice,
            pnlAmount
          });
          console.log(`[execute-decision] ✅ 平仓反思记录已更新`);
        } catch (reflectionError) {
          console.error('[execute-decision] ⚠️ 记录平仓反思失败（不影响交易）:', reflectionError);
          // 不影响交易执行，继续返回成功
        }
      } else {
        console.warn('[execute-decision] ⚠️ 未找到对应的开仓决策，无法记录完整反思');
        console.warn('[execute-decision] 提示：可能是手动平仓或该仓位由自动止损触发');
      }
      
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
    
    // ========== 以下是开仓逻辑 ==========
    
    // 检查开仓资金
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
    
    // 🔧 重构：基于百分比计算实际USDT金额
    console.log(`\n[execute-decision] ========== 仓位计算开始 ==========`);
    console.log(`[execute-decision] 可用资金: $${availableCash.toFixed(2)}`);
    
    let requestedUSDT = 0;
    let positionPercent = 0;
    
    // 优先使用position_size_percent（新格式）
    if (decision.positionSizePercent && decision.positionSizePercent > 0) {
      positionPercent = decision.positionSizePercent;
      
      // 限制百分比范围：5-50%
      if (positionPercent < 5) {
        console.warn(`[execute-decision] ⚠️ 仓位百分比过小(${positionPercent}%)，调整为5%`);
        positionPercent = 5;
      } else if (positionPercent > 50) {
        console.warn(`[execute-decision] ⚠️ 仓位百分比过大(${positionPercent}%)，限制为50%`);
        positionPercent = 50;
      }
      
      // 计算实际USDT金额 = 可用资金 × 百分比
      requestedUSDT = availableCash * (positionPercent / 100);
      
      console.log(`[execute-decision] 💡 AI指定百分比: ${decision.positionSizePercent}%`);
      console.log(`[execute-decision] 实际使用百分比: ${positionPercent}%`);
      console.log(`[execute-decision] 计算金额: $${availableCash.toFixed(2)} × ${positionPercent}% = $${requestedUSDT.toFixed(2)}`);
      
    } else if (decision.sizeUSDT && decision.sizeUSDT > 0) {
      // 兼容旧格式：直接指定USDT金额
      requestedUSDT = decision.sizeUSDT;
      positionPercent = availableCash > 0 ? (requestedUSDT / availableCash * 100) : 0;
      
      console.log(`[execute-decision] 💡 AI指定金额(旧格式): $${decision.sizeUSDT}`);
      console.log(`[execute-decision] 相当于: ${positionPercent.toFixed(1)}% 可用资金`);
      
      // 限制：不超过可用资金的90%
      const maxUsable = availableCash * 0.9;
      if (requestedUSDT > maxUsable) {
        requestedUSDT = maxUsable;
        positionPercent = 90;
        console.log(`[execute-decision] ⚠️ 限制为可用资金90%: $${requestedUSDT.toFixed(2)}`);
      }
      
    } else {
      // AI未提供任何金额信息，系统兜底
      console.warn(`[execute-decision] ⚠️ AI未提供仓位大小，使用默认30%`);
      positionPercent = 30;
      requestedUSDT = availableCash * 0.3;
      console.log(`[execute-decision] 系统默认: $${requestedUSDT.toFixed(2)} (30%可用资金)`);
    }
    
    // 检查最小金额要求
    const MIN_ORDER_USDT = 5;  // 最小5u
    if (requestedUSDT < MIN_ORDER_USDT) {
      return NextResponse.json({
        success: false,
        error: `订单金额过小：$${requestedUSDT.toFixed(2)} < $${MIN_ORDER_USDT}最低要求。可用资金仅$${availableCash.toFixed(2)}，建议等待资金充足后再开仓。`
      }, { status: 400 });
    }
    
    console.log(`[execute-decision] ========== 仓位计算结束 ==========\n`);
    
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
    
    // 🔒 交易前风险验证
    console.log(`[execute-decision] ========== 风险验证开始 ==========`);
    const riskValidation = PreTradeValidator.validateTrade(
      currentPositions,
      decision,
      accountTotal,
      availableCash,
      marginCalc.notionalValue
    );
    
    console.log(PreTradeValidator.formatValidationResult(riskValidation));
    console.log(`[execute-decision] ========== 风险验证结束 ==========\n`);
    
    // 如果风险检查不通过，拒绝交易
    if (!riskValidation.isValid) {
      console.error(`[execute-decision] ❌ 风险检查失败，拒绝交易`);
      return NextResponse.json({
        success: false,
        error: '交易风险过高，已拒绝',
        riskCheck: {
          errors: riskValidation.errors,
          warnings: riskValidation.warnings,
          metrics: riskValidation.riskMetrics
        }
      }, { status: 400 });
    }
    
    // 如果有警告，记录但继续执行
    if (riskValidation.warnings.length > 0) {
      console.warn(`[execute-decision] ⚠️ 存在${riskValidation.warnings.length}个风险警告，但仍可交易`);
    }
    
    // 使用计算出的合约张数
    const quantity = marginCalc.contractSize;

    // ========== 执行开仓订单 ==========
    console.log('\n[execute-decision] ========================================');
    console.log('[execute-decision] 🚀 开仓操作开始');
    console.log('[execute-decision] ========================================');
    console.log(`[execute-decision] 开仓决策:`);
    console.log(`  - 币种: ${decision.symbol}`);
    console.log(`  - 操作: ${decision.action} (${decision.action === 'OPEN_LONG' ? '开多' : '开空'})`);
    console.log(`  - 合约张数: ${quantity.toFixed(8)}张`);
    console.log(`  - 名义价值: $${marginCalc.notionalValue.toFixed(2)}`);
    console.log(`  - 所需保证金: $${marginCalc.requiredMargin.toFixed(2)}`);
    console.log(`  - 手续费: $${marginCalc.totalFees.toFixed(4)}`);
    console.log(`  - 总资金占用: $${marginCalc.recommendedAmount.toFixed(2)}`);

    // 构建交易对
    const symbol = `${decision.symbol}/USDT:USDT`;
    const side: 'buy' | 'sell' = decision.action === 'OPEN_LONG' ? 'buy' : 'sell';
    const tdMode: 'cross' | 'isolated' = 'cross';
    const instId = `${decision.symbol}-USDT-SWAP`;
    
    console.log(`[execute-decision] 订单参数:`);
    console.log(`  - 交易对: ${symbol}`);
    console.log(`  - instId: ${instId}`);
    console.log(`  - 方向: ${side} (${side === 'buy' ? '买入' : '卖出'})`);
    console.log(`  - 杠杆: ${leverage}x`);
    console.log(`  - 保证金模式: ${tdMode}`);
    console.log(`  - 当前价格: $${entryPrice}`);
    console.log(`  - 止盈: ${decision.takeProfit ? '$' + decision.takeProfit : '无'}`);
    console.log(`  - 止损: ${decision.stopLoss ? '$' + decision.stopLoss : '无'}`);
    
    // 1. 设置杠杆（不传posSide，兼容单向持仓模式）
    console.log(`\n[execute-decision] 步骤1: 设置杠杆...`);
    await setLeverage(instId, leverage, tdMode);
    console.log(`[execute-decision] ✅ 杠杆已设置: ${leverage}x, 模式: ${tdMode}`);

    // 2. 执行主订单（传递posSide参数）
    // 🔧 修复：明确传递posSide参数以避免51000错误
    console.log(`\n[execute-decision] 步骤2: 执行主订单...`);
    const orderPosSide: 'long' | 'short' = decision.action === 'OPEN_LONG' ? 'long' : 'short';
    console.log(`[execute-decision] posSide: ${orderPosSide} (${orderPosSide === 'long' ? '多头' : '空头'})`);
    
    const mainOrder = await placeOrder(
      symbol,
      side,
      'market',
      quantity,
      undefined,
      orderPosSide, // 🔧 明确传递posSide参数
      false,
      tdMode
    );

    console.log(`[execute-decision] ✅ 主订单已执行!`);
    console.log(`  - 订单ID: ${mainOrder.id}`);
    console.log(`  - 状态: ${mainOrder.status}`);
    if (mainOrder.filled) console.log(`  - 成交数量: ${mainOrder.filled}`);
    if (mainOrder.average) console.log(`  - 成交均价: $${mainOrder.average}`);

    // 3. 下止盈止损单
    console.log(`\n[execute-decision] 步骤3: 设置止盈止损...`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tpslOrders: any[] = [];
    if (decision.takeProfit || decision.stopLoss) {
      try {
        // 止盈止损需要posSide（判断方向）
        const tpslPosSide: 'long' | 'short' = decision.action === 'OPEN_LONG' ? 'long' : 'short';
        console.log(`[execute-decision] 止盈止损参数:`);
        console.log(`  - 仓位方向: ${tpslPosSide}`);
        console.log(`  - 数量: ${quantity.toFixed(8)}张`);
        console.log(`  - 止盈价: ${decision.takeProfit ? '$' + decision.takeProfit : '无'}`);
        console.log(`  - 止损价: ${decision.stopLoss ? '$' + decision.stopLoss : '无'}`);
        
        tpslOrders = await placeTPSL(
          instId,
          tpslPosSide,
          quantity,
          decision.takeProfit,
          decision.stopLoss,
          tdMode
        );
        console.log(`[execute-decision] ✅ 止盈止损已设置: ${tpslOrders.length}个订单`);
        tpslOrders.forEach((order, idx) => {
          console.log(`  [${idx + 1}] 类型: ${order.type}, 价格: $${order.price}`);
        });
      } catch (tpslError) {
        console.error('[execute-decision] ⚠️ 止盈止损设置失败:', tpslError);
      }
    } else {
      console.log(`[execute-decision] ⚠️ 未设置止盈止损（AI未提供）`);
    }
    
    console.log('[execute-decision] ========================================');
    console.log('[execute-decision] ✅ 开仓操作完成!');
    console.log('[execute-decision] ========================================\n');

    // 为开仓定义posSide（用于返回结果）
    const posSide: 'long' | 'short' = decision.action === 'OPEN_LONG' ? 'long' : 'short';
    
    // 📊 记录开仓反思（异步，不阻塞响应）
    const decisionId = body.decisionId || `decision-${Date.now()}`;
    const actualEntryPrice = mainOrder.average || entryPrice;
    
    console.log(`[execute-decision] 📊 记录开仓反思: ${decisionId}`);
    try {
      // 创建反思记录时，附加实际使用的USDT金额
      const decisionWithActualSize = {
        ...decision,
        sizeUSDT: requestedUSDT  // 保存实际使用的金额
      };
      
      recordTradeOpen({
        decisionId,
        decision: decisionWithActualSize,
        entryPrice: actualEntryPrice,
        marketConditions: `开仓时市价: $${actualEntryPrice}, 杠杆: ${leverage}x, 合约数: ${quantity}, 仓位: ${positionPercent.toFixed(1)}%`
      });
      console.log(`[execute-decision] ✅ 反思记录已创建（仓位: ${positionPercent.toFixed(1)}%, 金额: $${requestedUSDT.toFixed(2)}）`);
    } catch (reflectionError) {
      console.error(`[execute-decision] ⚠️ 反思记录创建失败（不影响交易）:`, reflectionError);
      // 不影响交易执行，继续返回成功
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

