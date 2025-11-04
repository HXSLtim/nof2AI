import { NextRequest, NextResponse } from 'next/server';
import { fetchCandles, fetchFundingRate, fetchOpenInterest, fetchAccountTotal, fetchAvailableUSDT, fetchPositions, fetchTickers } from '@/lib/okx';
import { queryEquity, queryPrices, queryIndicators3m, queryLatestFundingRate, queryLatestOpenInterest, insertPriceSnapshot, insertIndicators3m, insertFundingRate, insertOpenInterest, queryActiveOpenDecisions } from '@/lib/db';
import { ema, macd, rsi, atr, midPrices } from '@/lib/indicators';
import { getSentimentIndicators, formatSentimentForPrompt } from '@/lib/sentiment';
import { parseDecisionFromText } from '@/lib/ai-trading-prompt';
import { SUPPORTED_COINS } from '@/lib/constants';
import { bollingerBands, adx, calculateSignalStrength } from '@/lib/advanced-indicators';
import { StrategyFusion, TrendFollowingStrategy, MeanReversionStrategy, BreakoutStrategy, MomentumStrategy } from '@/lib/trading-strategies';
import { getReflectionsForPromptOptimization } from '@/lib/trade-reflection';

/**
 * 生成符合 README 模板的 AI 提示词
 * GET /api/ai/prompt?symbol=BTC (可选，指定单个币种)
 * @remarks 按 3 分钟与 4 小时两条时间框架计算核心指标，并汇总账户信息。
 * @param symbol 可选参数，指定单个币种（如BTC），不传则分析所有币种
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetSymbol = searchParams.get('symbol')?.toUpperCase(); // 如 'BTC'
    
    /**
     * 目标合约（OKX SWAP）
     * @remarks 对应提示词的大写模块：ALL BTC/ETH/SOL/BNB/XRP/DOGE DATA
     */
    const ALL_INST_IDS = SUPPORTED_COINS.map(coin => `${coin}-USDT-SWAP`);
    
    // 如果指定了单个币种，只分析该币种
    const INST_IDS = targetSymbol 
      ? ALL_INST_IDS.filter(id => id.startsWith(targetSymbol + '-'))
      : ALL_INST_IDS;
    
    if (INST_IDS.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: `币种 ${targetSymbol} 不支持` 
      }, { status: 400 });
    }
    
    console.log(`[api/ai/prompt] 分析币种: ${targetSymbol || '全部(6个)'} - ${INST_IDS.join(', ')}`);

    // 拉取与计算每个币种的指标
    const sections: string[] = [];
    /**
     * 保存各币种的关键指标（供仓位出口使用）
     * @remarks key 为币种（如 BTC），value 为当前 EMA20（3m）等。
     */
    const latestEma20ByCoin: Record<string, number> = {};

    /**
     * 序列说明：调整为"最新 → 最旧"以便快速查看最近状态
     */
    const analysisScope = targetSymbol ? `${targetSymbol} ONLY` : 'ALL COINS';
    const header = `ALL OF THE PRICE OR SIGNAL DATA BELOW IS ORDERED: NEWEST → OLDEST\n\nTimeframes note: Unless stated otherwise in a section title, intraday series are provided at 3‑minute intervals. If a coin uses a different interval, it is explicitly stated in that coin's section.\n\nCURRENT MARKET STATE FOR ${analysisScope}\n\n⚠️ IMPORTANT: ${targetSymbol ? `You are analyzing ${targetSymbol} ONLY. DO NOT make decisions for other coins!` : 'Analyze all coins and make decisions for each.'}`;

    // === 优化：批量获取所有币种价格，减少请求次数 ===
    const now = Date.now();
    let allPrices: Record<string, number> = {};
    
    try {
      // 一次性获取所有价格
      allPrices = await fetchTickers(INST_IDS);
      // 批量存储
      for (const [instId, price] of Object.entries(allPrices)) {
        if (price > 0) {
          insertPriceSnapshot(now, instId, price);
        }
      }
      console.log('[api/ai/prompt] 批量获取价格成功');
    } catch (error) {
      console.warn('[api/ai/prompt] 批量获取价格失败，将从数据库读取:', error);
      // 从数据库读取备用
      for (const instId of INST_IDS) {
        const dbPrices = queryPrices(instId, now - 10 * 60 * 1000, 1);
        if (dbPrices.length > 0) {
          allPrices[instId] = dbPrices[dbPrices.length - 1].price;
        }
      }
    }

    for (const instId of INST_IDS) {
      const coin = instId.split('-')[0];
      
      // 1. 使用批量获取的价格
      const currentPrice = allPrices[instId] || 0;
      
      // 2. 获取3分钟K线数据并计算指标
      const candles3m = await fetchCandles(instId, '3m', 120);
      if (candles3m.length < 20) throw new Error(`3m candles too short for ${instId}`);
      
      const mids = midPrices(candles3m);
      const ema20_3m = ema(mids, 20);
      const macdHist_3m = macd(mids, 12, 26, 9);
      const rsi7_3m = rsi(mids, 7);
      const rsi14_3m = rsi(mids, 14);

      const currentEma20 = ema20_3m[ema20_3m.length - 1];
      const currentMacd = macdHist_3m[macdHist_3m.length - 1];
      const currentRsi7 = rsi7_3m[rsi7_3m.length - 1];
      latestEma20ByCoin[coin] = currentEma20;
      
      // 存储最新的3分钟指标
      try {
        insertIndicators3m(now, instId, {
          ema20: currentEma20,
          macd: currentMacd,
          rsi7: currentRsi7,
          rsi14: rsi14_3m[rsi14_3m.length - 1]
        });
      } catch {}

      // 3. 资金费率和持仓量：从数据库读取（data-collector已采集）
      const fundingRate = queryLatestFundingRate(instId) ?? 0;
      const openInterestData = queryLatestOpenInterest(instId);
      const openInterestLatest = openInterestData?.latest ?? 0;
      const openInterestAvg = openInterestData?.average ?? 0;

      // 序列输出采用最近 10 个点，且按“最新 → 最旧”排列
      const takeLastDesc = (arr: number[]) => arr.slice(Math.max(0, arr.length - 10)).reverse();
      const midsLast10 = takeLastDesc(mids);
      const ema20Last10 = takeLastDesc(ema20_3m);
      const macdLast10 = takeLastDesc(macdHist_3m);
      const rsi7Last10 = takeLastDesc(rsi7_3m);
      const rsi14Last10 = takeLastDesc(rsi14_3m);

      // 4 小时框架：EMA20 vs EMA50、ATR3 vs ATR14、成交量现值与 20 均值、MACD/RSI 最近 10
      const candles4h = await fetchCandles(instId, '4H', 60);
      const mids4h = midPrices(candles4h);
      const ema20_4h = ema(mids4h, 20);
      const ema50_4h = ema(mids4h, 50);
      const atr3_4h = atr(candles4h.map((c) => ({ high: c.high, low: c.low, close: c.close })), 3);
      const atr14_4h = atr(candles4h.map((c) => ({ high: c.high, low: c.low, close: c.close })), 14);
      const macdHist_4h = macd(mids4h, 12, 26, 9);
      const rsi14_4h = rsi(mids4h, 14);
      const vol4h = candles4h.map((c) => c.vol);
      const volCurr = vol4h[vol4h.length - 1] ?? 0;
      const volAvg20 = (() => {
        const last20 = vol4h.slice(Math.max(0, vol4h.length - 20));
        const s = last20.reduce((a, b) => a + b, 0);
        return last20.length ? s / last20.length : 0;
      })();

      const fmt = (n: number) => Number.isFinite(n) ? Number(n.toFixed(6)) : 0;

      // 资金费率使用科学计数法，便于与模板示例一致（如 1.25e-05）
      const fmtExp = (n: number) => (Number.isFinite(n) ? Number(n).toExponential(6) : '0');

      // 🎯 计算高级指标
      // 布林带
      const bbValues = bollingerBands(mids, 20, 2);
      const currentBB = bbValues.length > 0 ? bbValues[bbValues.length - 1] : null;
      
      // ADX趋势强度
      const adxValues = adx(candles3m, 14);
      const currentADX = adxValues.length > 0 ? adxValues[adxValues.length - 1] : null;
      
      // 📊 多策略信号分析
      let multiStrategyText = '';
      try {
        // 检测市场状态
        const marketRegime = StrategyFusion.detectMarketRegime({
          prices: mids,
          ema20: ema20_3m,
          atr: atr3_4h,
          adx: currentADX || undefined
        });
        
        // 获取策略权重
        const weights = StrategyFusion.allocateWeights(marketRegime);
        
        // 分析各策略信号
        const trendSignal = TrendFollowingStrategy.analyze({
          price: currentPrice,
          ema20_3m,
          ema20_4h,
          macd_3m: macdHist_3m,
          macd_4h: macdHist_4h,
          adx: currentADX || undefined
        });
        
        const meanReversionSignal = currentBB ? MeanReversionStrategy.analyze({
          price: currentPrice,
          bb: currentBB,
          rsi: rsi14_3m[rsi14_3m.length - 1],
          volume: volCurr,
          avgVolume: volAvg20
        }) : { action: 'NEUTRAL' as const, strength: 50, confidence: 50, reasoning: 'BB数据不足' };
        
        const high20 = Math.max(...mids.slice(-20));
        const low20 = Math.min(...mids.slice(-20));
        
        const breakoutSignal = currentBB ? BreakoutStrategy.analyze({
          price: currentPrice,
          high20,
          low20,
          volume: volCurr,
          avgVolume: volAvg20,
          bb: currentBB
        }) : { action: 'NEUTRAL' as const, strength: 50, confidence: 50, reasoning: 'BB数据不足' };
        
        const momentumSignal = MomentumStrategy.analyze({
          price: currentPrice,
          prices: mids,
          rsi: rsi14_3m[rsi14_3m.length - 1],
          macd: currentMacd,
          volume: volCurr,
          avgVolume: volAvg20
        });
        
        // 融合信号
        const fusedSignal = StrategyFusion.fuseSignals({
          trendFollowing: trendSignal,
          meanReversion: meanReversionSignal,
          breakout: breakoutSignal,
          momentum: momentumSignal
        }, weights);
        
        // 综合信号强度
        const signalStrength = calculateSignalStrength({
          price: currentPrice,
          ema20: currentEma20,
          macd: currentMacd,
          rsi: rsi14_3m[rsi14_3m.length - 1],
          bb: currentBB || undefined,
          adx: currentADX || undefined,
          volume: volCurr,
          avgVolume: volAvg20
        });
        
        multiStrategyText = `\n\n🎯 MULTI-STRATEGY ANALYSIS FOR ${coin}:
Market Regime: ${marketRegime.toUpperCase().replace('_', ' ')}
Strategy Weights: Trend=${(weights.trendFollowing*100).toFixed(0)}% | MeanRev=${(weights.meanReversion*100).toFixed(0)}% | Breakout=${(weights.breakout*100).toFixed(0)}% | Momentum=${(weights.momentum*100).toFixed(0)}%

Individual Strategies:
  - Trend Following: ${trendSignal.action} (strength: ${trendSignal.strength.toFixed(0)})
  - Mean Reversion: ${meanReversionSignal.action} (strength: ${meanReversionSignal.strength.toFixed(0)})
  - Breakout: ${breakoutSignal.action} (strength: ${breakoutSignal.strength.toFixed(0)})
  - Momentum: ${momentumSignal.action} (strength: ${momentumSignal.strength.toFixed(0)})

FUSED SIGNAL: ${fusedSignal.action} (confidence: ${fusedSignal.confidence.toFixed(0)})
Signal Strength: Long=${signalStrength.longStrength.toFixed(0)} | Short=${signalStrength.shortStrength.toFixed(0)} | Trend=${signalStrength.trend}
Reasoning: ${fusedSignal.reasoning}

Advanced Indicators:
  - Bollinger Bands: ${currentBB ? `Upper=${fmt(currentBB.upper)}, Middle=${fmt(currentBB.middle)}, Lower=${fmt(currentBB.lower)}, Width=${currentBB.bandwidth.toFixed(2)}%` : 'N/A'}
  - ADX (Trend Strength): ${currentADX ? currentADX.toFixed(2) + (currentADX > 25 ? ' (STRONG TREND)' : ' (weak trend)') : 'N/A'}
  - Price vs BB: ${currentBB ? (currentPrice > currentBB.upper ? 'ABOVE upper (overbought)' : currentPrice < currentBB.lower ? 'BELOW lower (oversold)' : 'within bands') : 'N/A'}`;
      } catch (error) {
        console.warn(`[api/ai/prompt] 多策略分析失败 ${coin}:`, error);
        multiStrategyText = '';
      }

      const section = [
        `ALL ${coin} DATA`,
        `current_price = ${fmt(currentPrice)}, current_ema20 = ${fmt(currentEma20)}, current_macd = ${fmt(currentMacd)}, current_rsi (7 period) = ${fmt(currentRsi7)}`,
        `\nIn addition, here is the latest ${coin} open interest and funding rate for perps:\n`,
        `Open Interest: Latest: ${fmt(openInterestLatest)} Average: ${fmt(openInterestAvg)}`,
        `\nFunding Rate: ${fmtExp(fundingRate)}`,
        `\nIntraday series (3‑minute intervals, newest → oldest):\n`,
        `${coin} mid prices: [${midsLast10.map(fmt).join(', ')}]`,
        `\nEMA indicators (20‑period): [${ema20Last10.map(fmt).join(', ')}]`,
        `\nMACD indicators: [${macdLast10.map(fmt).join(', ')}]`,
        `\nRSI indicators (7‑Period): [${rsi7Last10.map(fmt).join(', ')}]`,
        `\nRSI indicators (14‑Period): [${rsi14Last10.map(fmt).join(', ')}]`,
        `\n\nLonger‑term context (4‑hour timeframe):\n`,
        `20‑Period EMA: ${fmt(ema20_4h[ema20_4h.length - 1])} vs. 50‑Period EMA: ${fmt(ema50_4h[ema50_4h.length - 1])}`,
        `\n3‑Period ATR: ${fmt(atr3_4h[atr3_4h.length - 1])} vs. 14‑Period ATR: ${fmt(atr14_4h[atr14_4h.length - 1])}`,
        `\nCurrent Volume: ${fmt(volCurr)} vs. Average Volume: ${fmt(volAvg20)}`,
        `\nMACD indicators: [${takeLastDesc(macdHist_4h).map(fmt).join(', ')}]`,
        `\nRSI indicators (14‑Period): [${takeLastDesc(rsi14_4h).map(fmt).join(', ')}]`,
        multiStrategyText,
      ].join('\n');

      sections.push(section);
    }

    // 获取BTC情绪指标
    const sentimentBTC = await getSentimentIndicators('BTC');
    const sentimentText = formatSentimentForPrompt(sentimentBTC);
    
    // 拉取当前实际仓位（来自OKX）
    const positions = await fetchPositions().catch(() => [] as any[]);
    
    // 获取活跃的开仓决策（还未平仓的）- 需要与实际仓位对比
    const activeDecisions = queryActiveOpenDecisions();
    
    // 🔧 修复：只保留在实际交易所仓位中存在的决策（过滤掉已被止损的）
    // 🔧 如果指定了单个币种，只显示该币种的决策
    const actualActiveDecisions = activeDecisions.filter(d => {
      const parsed = parseDecisionFromText(d.reply || '');
      if (!parsed) return false;
      
      const symbol = parsed.symbol;
      
      // 如果指定了币种，只保留该币种
      if (targetSymbol && symbol !== targetSymbol) {
        return false;
      }
      
      const isLong = parsed.action.includes('LONG');
      
      // 检查是否在实际仓位中存在匹配的仓位
      return positions.some((p: any) => {
        const posCoin = String(p.coin || (p.symbol ? String(p.symbol).split('-')[0] : ''));
        const posSide = String(p.side || '').toLowerCase();
        const posQty = Math.abs(Number(p.contracts ?? p.quantity ?? 0));
        
        return posCoin === symbol && 
               ((isLong && posSide === 'long') || (!isLong && posSide === 'short')) &&
               posQty > 0;
      });
    });
    
    const activeDecisionsText = actualActiveDecisions.length > 0
      ? `\n\nYOUR ACTIVE OPEN POSITIONS FROM PREVIOUS DECISIONS (verified to still exist on exchange):\n${actualActiveDecisions.map((d, idx) => {
          const parsed = parseDecisionFromText(d.reply || '');
          const timeAgo = Math.floor((Date.now() - d.ts) / 60000); // 分钟前
          return `${idx + 1}. [Opened ${timeAgo} minutes ago] ${parsed ? JSON.stringify({
            symbol: parsed.symbol,
            action: parsed.action,
            confidence: parsed.confidence,
            entry_price: parsed.entryPrice,
            take_profit: parsed.takeProfit,
            stop_loss: parsed.stopLoss,
            leverage: parsed.leverage,
            reasoning: parsed.reasoning.substring(0, 80)
          }) : d.title}`;
        }).join('\n')}\n\nIMPORTANT: These positions are VERIFIED to still exist on the exchange. Consider whether to:\n- HOLD: Keep these positions if they're performing well\n- CLOSE: Exit if stop loss hit or take profit reached\n- Avoid opening the same position again if it's already active`
      : '';
    
    // 账户信息与绩效
    const hours = 72;
    const since = Date.now() - hours * 3600 * 1000;
    const eq = queryEquity(since);
    const totalEqLatest = eq.length ? eq[eq.length - 1].total : await fetchAccountTotal();
    const totalEqEarliest = eq.length ? eq[0].total : totalEqLatest;
    const totalReturnPct = totalEqEarliest > 0 ? ((totalEqLatest - totalEqEarliest) / totalEqEarliest) * 100 : 0;
    const cashUSDT = await fetchAvailableUSDT();

    /**
     * 格式化仓位为模板示例的字典串（扩展字段）
     * @param p 仓位对象（来自 OKX 私有接口）
     * @returns 形如：{'symbol': 'ETH', 'side': 'long', 'quantity': 4.57, 'entry_price': 3696.6, 'current_price': 3873.85, 'liquidation_price': 3397.58, 'unrealized_pnl': 810.03, 'leverage': 10, 'exit_plan': {...}, 'confidence': 0.7, 'risk_usd': 844.825, 'sl_oid': -1, 'tp_oid': -1, 'wait_for_fill': False, 'entry_oid': -1, 'notional_usd': 17703.49}
     */
    const formatPosition = (p: any) => {
      const f = (n: number) => (Number.isFinite(n) ? Number(n.toFixed(6)) : 0);
      const sym = String(p.coin || (p.symbol ? String(p.symbol).split('-')[0] : ''));
      const side = String(p.side || '').toLowerCase() === 'short' ? 'short' : 'long';
      const qtyRaw = Number(p.contracts ?? p.quantity ?? 0);
      const qty = Math.abs(qtyRaw);
      const entry = Number(p.entryPrice ?? 0);
      const mark = Number(p.markPrice ?? 0);
      const liq = Number(p.liquidationPrice ?? 0);
      const upl = Number(p.unrealizedPnl ?? 0);
      const lev = Number(p.leverage ?? 0);
      const notional = Number(p.notional ?? qty * mark);
      const ema20 = latestEma20ByCoin[sym] ?? mark;

      // 简化版退出计划：
      // - 多头：止盈 10%，止损 5%，失效条件为 3m 收盘价跌破 EMA20
      // - 空头：止盈 -10%，止损 +5%，失效条件为 3m 收盘价突破 EMA20
      const profitTarget = side === 'long' ? entry * 1.10 : entry * 0.90;
      const stopLoss = side === 'long' ? entry * 0.95 : entry * 1.05;
      const invalidation = side === 'long'
        ? `If the price closes below ${f(ema20)} on a 3-minute candle`
        : `If the price closes above ${f(ema20)} on a 3-minute candle`;
      const riskUsd = Math.abs(stopLoss - entry) * qty;
      const confidence = 0.7;

      const exitPlan = `{'profit_target': ${f(profitTarget)}, 'stop_loss': ${f(stopLoss)}, 'invalidation_condition': '${invalidation}'}`;

      return `{'symbol': '${sym}', 'side': '${side}', 'quantity': ${f(qty)}, 'entry_price': ${f(entry)}, 'current_price': ${f(mark)}, 'liquidation_price': ${f(liq)}, 'unrealized_pnl': ${f(upl)}, 'leverage': ${f(lev)}, 'exit_plan': ${exitPlan}, 'confidence': ${f(confidence)}, 'risk_usd': ${f(riskUsd)}, 'sl_oid': -1, 'tp_oid': -1, 'wait_for_fill': False, 'entry_oid': -1, 'notional_usd': ${f(notional)}}`;
    };
    
    // 🔧 过滤仓位：如果指定了单个币种，只显示该币种的仓位
    const filteredPositions = targetSymbol 
      ? positions.filter(p => String(p.coin || '').toUpperCase() === targetSymbol)
      : positions;
    
    // 格式化仓位行
    const positionsLine = filteredPositions.length
      ? `\n\nCURRENT LIVE POSITIONS (from OKX exchange, these are your ACTUAL positions right now): ${filteredPositions.map(formatPosition).join(' ')}`
      : `\n\nCURRENT LIVE POSITIONS (from OKX exchange): None - You have NO open positions${targetSymbol ? ` for ${targetSymbol}` : ''} currently`;
    
    // 生成仓位摘要（方便AI快速识别，包含手续费计算）
    const positionSummary = filteredPositions.length > 0
      ? `\n\nQUICK SUMMARY - You currently have${targetSymbol ? ` (${targetSymbol} only)` : ''}:\n${filteredPositions.map(p => {
          const sym = String(p.coin || '');
          const side = String(p.side || '').toLowerCase();
          const upl = Number(p.unrealizedPnl || 0);
          const entry = Number(p.entryPrice || 0);
          const mark = Number(p.markPrice || 0);
          const notional = Number(p.notional || 0);
          const uplPct = entry > 0 ? ((mark - entry) / entry * 100) : 0;
          
          // 计算手续费（OKX taker费率约0.05%，开仓+平仓=0.1%）
          const totalFeeRate = 0.001; // 0.1%
          const estimatedFee = notional * totalFeeRate;
          const netProfit = upl - estimatedFee;
          const netProfitPct = entry > 0 ? (netProfit / (notional / (Number(p.leverage) || 1)) * 100) : 0;
          
          return `- ${sym} ${side.toUpperCase()}: 未实现盈亏=${upl >= 0 ? '+' : ''}$${upl.toFixed(2)} (${uplPct >= 0 ? '+' : ''}${uplPct.toFixed(2)}%), 扣除手续费后净收益≈${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(2)} (${netProfitPct >= 0 ? '+' : ''}${netProfitPct.toFixed(2)}%)`;
        }).join('\n')}\n\nNOTE: Fee calculation assumes 0.05% taker fee × 2 (open + close) = 0.1% total. Actual profit after fees is what matters for decisions.`
      : '';

    const footer = [
      'HERE IS YOUR ACCOUNT INFORMATION & PERFORMANCE',
      `Current Total Return (percent): ${Number(totalReturnPct.toFixed(2))}%`,
      `\nAvailable Cash: ${Number(cashUSDT.toFixed(2))}`,
      `\nCurrent Account Value: ${Number(totalEqLatest.toFixed(2))}`,
      positionsLine,
      positionSummary,
      `\n\n${sentimentText}`,
      activeDecisionsText,
      await generateReflectionSection(targetSymbol),  // 🔥 添加反思数据
      targetSymbol ? `\n\n🎯 ANALYSIS SCOPE RESTRICTION:\n⚠️ YOU ARE ANALYZING ${targetSymbol} ONLY!\n⚠️ DO NOT make decisions for other coins (BTC, ETH, SOL, etc.)\n⚠️ Your decision MUST have "symbol": "${targetSymbol}"\n⚠️ If you suggest a different coin, your decision will be REJECTED!\n\nExample CORRECT decision:\n{\n  "symbol": "${targetSymbol}",\n  "action": "OPEN_LONG",\n  "confidence": 75,\n  "position_size_percent": 25,\n  "leverage": 5,\n  ...\n}\n\nExample WRONG decision (will be rejected):\n{\n  "symbol": "BTC",  ← WRONG! You are analyzing ${targetSymbol}!\n  ...\n}` : '',
      `\n\n⚠️ CRITICAL RULES FOR CLOSE ACTIONS:
1. ONLY close positions that exist in "CURRENT LIVE POSITIONS" section above
2. If "CURRENT LIVE POSITIONS" shows "None", DO NOT issue any CLOSE action
3. If a position was in your history but NOT in current live positions, it means:
   - Already closed by Take Profit (TP)
   - Already closed by Stop Loss (SL)
   - The open order failed or was cancelled
4. DO NOT try to close a position that doesn't exist - this will cause an error
5. Before any CLOSE_LONG or CLOSE_SHORT action, VERIFY the position exists in live positions${targetSymbol ? ` for ${targetSymbol}` : ''}

Example check:
- If you see ${targetSymbol || 'BTC'} LONG in live positions → OK to issue CLOSE_LONG for ${targetSymbol || 'BTC'}
- If you DON'T see ${targetSymbol || 'BTC'} LONG in live positions → DO NOT issue CLOSE_LONG for ${targetSymbol || 'BTC'} (already closed)`,
    ].join('\n');

    const prompt = [header, '', sections.join('\n\n'), '', footer].join('\n');
    return NextResponse.json({ success: true, prompt });
  } catch (err: any) {
    console.error('[api/ai/prompt] error', err);
    return NextResponse.json({ success: false, error: err?.message || 'failed to compose prompt' }, { status: 500 });
  }
}
/**
 * 生成反思数据部分
 * 为AI提供历史交易的经验教训
 */
async function generateReflectionSection(targetSymbol?: string): Promise<string> {
  try {
    const reflectionData = getReflectionsForPromptOptimization();
    
    // 如果指定了币种，过滤该币种的反思
    const losses = targetSymbol
      ? reflectionData.recentLosses.filter(r => r.symbol === targetSymbol)
      : reflectionData.recentLosses;
    
    const wins = targetSymbol
      ? reflectionData.recentWins.filter(r => r.symbol === targetSymbol)
      : reflectionData.recentWins;
    
    if (losses.length === 0 && wins.length === 0) {
      return '\n\n📚 TRADING REFLECTIONS: No historical trades yet. This is your first trading session.';
    }
    
    const sections: string[] = ['\n\n📚 TRADING REFLECTIONS (Learn from History):'];
    
    // 最近亏损交易的教训
    if (losses.length > 0) {
      sections.push('\n🔴 RECENT LOSSES (What to AVOID):');
      losses.slice(0, 3).forEach((loss, i) => {
        const pnlPct = loss.pnl_percentage ? `${loss.pnl_percentage.toFixed(2)}%` : 'N/A';
        const mistakes = loss.mistakes || '未分析';
        const improvement = loss.improvement || '';
        sections.push(`${i + 1}. ${loss.symbol} ${loss.action}: Loss ${pnlPct}`);
        sections.push(`   Mistakes: ${mistakes}`);
        if (improvement) {
          sections.push(`   Learn: ${improvement.substring(0, 150)}`);
        }
      });
    }
    
    // 最近盈利交易的成功模式
    if (wins.length > 0) {
      sections.push('\n✅ RECENT WINS (What WORKED):');
      wins.slice(0, 3).forEach((win, i) => {
        const pnlPct = win.pnl_percentage ? `+${win.pnl_percentage.toFixed(2)}%` : 'N/A';
        const insights = win.insights || '未分析';
        sections.push(`${i + 1}. ${win.symbol} ${win.action}: Profit ${pnlPct}`);
        sections.push(`   Success: ${insights.substring(0, 150)}`);
      });
    }
    
    // 常见错误模式（去重）
    if (reflectionData.commonMistakes.length > 0) {
      sections.push('\n⚠️ COMMON MISTAKES TO AVOID:');
      reflectionData.commonMistakes.slice(0, 5).forEach((mistake, i) => {
        sections.push(`${i + 1}. ${mistake}`);
      });
    }
    
    // 成功模式（去重）
    if (reflectionData.successPatterns.length > 0) {
      sections.push('\n🎯 SUCCESS PATTERNS TO FOLLOW:');
      reflectionData.successPatterns.slice(0, 5).forEach((pattern, i) => {
        sections.push(`${i + 1}. ${pattern}`);
      });
    }
    
    sections.push('\n💡 APPLY THESE LESSONS: Use the mistakes to avoid bad trades, and success patterns to identify good opportunities.');
    
    return sections.join('\n');
    
  } catch (error) {
    console.error('[generateReflectionSection] Error:', error);
    return '\n\n📚 TRADING REFLECTIONS: Error loading reflection data.';
  }
}

/**
 * 指定 Node.js 运行时
 * @remarks 路由依赖 SQLite 与 Node 内置模块，需使用 Node 运行时。
 */
export const runtime = 'nodejs';