/**
 * 交易反思模块
 * 
 * 实现第一阶段：反思学习系统
 * - 记录每笔交易的决策逻辑和市场条件
 * - 自动跟踪交易结果（盈亏、持仓时间）
 * - 生成交易失败/成功的分析报告
 * - 为提示词优化提供数据支持
 */

import { 
  insertTradeReflection, 
  updateTradeReflection, 
  getTradeReflectionByDecisionId,
  queryTradeReflections,
  getTradeStatistics,
  TradeReflectionRow 
} from './db';
import { ParsedDecision } from './ai-trading-prompt';
import { fetchPositions } from './okx';

/**
 * 交易反思接口（扩展版本）
 */
export interface TradeReflection extends TradeReflectionRow {
  // 继承所有数据库字段
}

/**
 * 记录交易开仓（创建初始反思记录）
 * 在execute-decision开仓成功后调用
 */
export function recordTradeOpen(params: {
  decisionId: string;
  decision: ParsedDecision;
  entryPrice: number;
  marketConditions?: string;
}): void {
  const { decisionId, decision, entryPrice, marketConditions } = params;
  
  const reflection: TradeReflectionRow = {
    decision_id: decisionId,
    symbol: decision.symbol,
    action: decision.action,
    outcome: 'pending',
    reasoning: decision.reasoning || '',
    market_conditions: marketConditions || generateMarketConditionsSnapshot(),
    entry_price: entryPrice,
    entry_ts: Date.now(),
    confidence: decision.confidence || 0,
    leverage: decision.leverage || 1,
    size_usdt: decision.sizeUSDT || 0,
    created_at: Date.now()
  };
  
  try {
    insertTradeReflection(reflection);
    console.log(`[trade-reflection] ✅ 开仓记录已创建: ${decisionId}`);
  } catch (error) {
    console.error(`[trade-reflection] ❌ 创建开仓记录失败:`, error);
  }
}

/**
 * 记录交易平仓（更新反思记录）
 * 在execute-decision平仓成功后调用
 */
export async function recordTradeClose(params: {
  openDecisionId: string;
  closeDecisionId: string;
  exitPrice: number;
  pnlAmount: number;
}): Promise<void> {
  const { openDecisionId, exitPrice, pnlAmount } = params;
  
  try {
    // 获取原始记录
    const existingReflection = getTradeReflectionByDecisionId(openDecisionId);
    
    if (!existingReflection) {
      console.warn(`[trade-reflection] ⚠️ 未找到开仓记录: ${openDecisionId}`);
      return;
    }
    
    // 计算持仓时间
    const exitTs = Date.now();
    const holdingTimeMinutes = existingReflection.entry_ts 
      ? Math.round((exitTs - existingReflection.entry_ts) / 60000)
      : 0;
    
    // 计算盈亏百分比
    const pnlPercentage = existingReflection.size_usdt && existingReflection.size_usdt > 0
      ? (pnlAmount / existingReflection.size_usdt) * 100
      : 0;
    
    // 确定结果类型
    let outcome: 'profit' | 'loss' | 'breakeven' = 'breakeven';
    if (pnlAmount > 1) outcome = 'profit';
    else if (pnlAmount < -1) outcome = 'loss';
    
    // 生成AI反思分析
    const aiInsights = await generateAIReflection({
      ...existingReflection,
      exit_price: exitPrice,
      pnl_amount: pnlAmount,
      pnl_percentage: pnlPercentage,
      holding_time_minutes: holdingTimeMinutes,
      outcome
    });
    
    // 更新记录
    updateTradeReflection(openDecisionId, {
      outcome,
      exit_price: exitPrice,
      exit_ts: exitTs,
      pnl_amount: pnlAmount,
      pnl_percentage: pnlPercentage,
      holding_time_minutes: holdingTimeMinutes,
      mistakes: aiInsights.mistakes,
      insights: aiInsights.insights,
      improvement: aiInsights.improvement,
      actual_vs_expected: aiInsights.actualVsExpected
    });
    
    console.log(`[trade-reflection] ✅ 平仓记录已更新: ${openDecisionId}`);
    console.log(`  - 结果: ${outcome}`);
    console.log(`  - 盈亏: $${pnlAmount.toFixed(2)} (${pnlPercentage.toFixed(2)}%)`);
    console.log(`  - 持仓时间: ${holdingTimeMinutes}分钟`);
  } catch (error) {
    console.error(`[trade-reflection] ❌ 更新平仓记录失败:`, error);
  }
}

/**
 * 自动检测并更新交易结果
 * 定期调用（如每5分钟），检查待定交易是否已平仓
 * 🔧 改进：尝试从OKX获取准确的盈亏数据
 */
export async function autoUpdateTradeOutcomes(): Promise<void> {
  const startTime = Date.now();
  
  try {
    // 获取所有pending状态的反思记录
    const pendingReflections = queryTradeReflections({ 
      outcome: 'pending',
      limit: 50 
    });
    
    if (pendingReflections.length === 0) {
      console.log(`[trade-reflection] ✅ 无待定交易需要更新`);
      return;
    }
    
    console.log(`[trade-reflection] 🔍 开始检查${pendingReflections.length}个待定交易...`);
    console.log(`[trade-reflection] 待定交易列表:`, pendingReflections.map(r => ({
      id: r.decision_id,
      symbol: r.symbol,
      action: r.action,
      age_minutes: Math.floor((Date.now() - (r.entry_ts || 0)) / 60000)
    })));
    
    // 获取当前持仓
    const currentPositions = await fetchPositions();
    
    // 🔧 获取已关闭仓位的盈亏历史
    let closedPnLData: Array<{
      coin: string;
      direction: 'long' | 'short';
      pnl: number;
      closeTime: number;
      closeAvgPx: number;
      openAvgPx: number;
    }> = [];
    
    try {
      const { fetchClosedPnL } = await import('./okx');
      closedPnLData = await fetchClosedPnL(100);
      if (closedPnLData.length > 0) {
        console.log(`[trade-reflection] 📊 获取到${closedPnLData.length}条历史盈亏记录`);
      }
    } catch (error) {
      console.warn(`[trade-reflection] ⚠️ 无法获取历史盈亏数据:`, error);
    }
    
    for (const reflection of pendingReflections) {
      // 检查是否还有对应的持仓
      const matchingPosition = currentPositions.find(pos => {
        const symbolMatch = pos.coin === reflection.symbol;
        const sideMatch = (
          (reflection.action.includes('LONG') && pos.side === 'long') ||
          (reflection.action.includes('SHORT') && pos.side === 'short')
        );
        return symbolMatch && sideMatch;
      });
      
      if (!matchingPosition) {
        // 持仓已关闭，但我们没有记录到平仓事件
        // 可能是被止盈止损自动平仓
        const ageMinutes = reflection.entry_ts ? Math.floor((Date.now() - reflection.entry_ts) / 60000) : 0;
        console.log(`[trade-reflection] ⚠️ 检测到已平仓但未记录: ${reflection.symbol} ${reflection.action} (持仓${ageMinutes}分钟)`);
        
        // 🔧 尝试从历史盈亏数据中匹配
        const direction = reflection.action.includes('LONG') ? 'long' : 'short';
        const entryTs = reflection.entry_ts || 0;
        
        // 查找匹配的历史记录（时间窗口：开仓后到现在）
        const matchingHistory = closedPnLData.find(item => {
          const coinMatch = item.coin === reflection.symbol;
          const directionMatch = item.direction === direction;
          const timeMatch = item.closeTime >= entryTs && item.closeTime <= Date.now();
          return coinMatch && directionMatch && timeMatch;
        });
        
        if (matchingHistory) {
          // 🎯 找到准确的盈亏数据！
          const pnlAmount = matchingHistory.pnl;
          const exitPrice = matchingHistory.closeAvgPx;
          const exitTs = matchingHistory.closeTime;
          const holdingTimeMinutes = entryTs ? Math.round((exitTs - entryTs) / 60000) : 0;
          
          // 计算盈亏百分比
          const pnlPercentage = reflection.size_usdt && reflection.size_usdt > 0
            ? (pnlAmount / reflection.size_usdt) * 100
            : 0;
          
          // 确定结果类型
          let outcome: 'profit' | 'loss' | 'breakeven' = 'breakeven';
          if (pnlAmount > 1) outcome = 'profit';
          else if (pnlAmount < -1) outcome = 'loss';
          
          // 生成AI反思分析
          const aiInsights = await generateAIReflection({
            ...reflection,
            exit_price: exitPrice,
            pnl_amount: pnlAmount,
            pnl_percentage: pnlPercentage,
            holding_time_minutes: holdingTimeMinutes,
            outcome
          });
          
          updateTradeReflection(reflection.decision_id, {
            outcome,
            exit_price: exitPrice,
            exit_ts: exitTs,
            pnl_amount: pnlAmount,
            pnl_percentage: pnlPercentage,
            holding_time_minutes: holdingTimeMinutes,
            mistakes: aiInsights.mistakes,
            insights: (aiInsights.insights || '') + ' [自动检测：被止盈/止损平仓]',
            improvement: aiInsights.improvement,
            actual_vs_expected: aiInsights.actualVsExpected
          });
          
          console.log(`[trade-reflection] ✅ 已更新止损/止盈记录: ${reflection.symbol} ${reflection.action}`);
          console.log(`  - 结果: ${outcome}`);
          console.log(`  - 盈亏: $${pnlAmount.toFixed(2)} (${pnlPercentage.toFixed(2)}%)`);
          console.log(`  - 平仓价: $${exitPrice.toFixed(2)}`);
        } else {
          // 没有找到匹配的历史数据，使用默认值
          const holdingTimeMinutes = entryTs ? Math.round((Date.now() - entryTs) / 60000) : 0;
          
          updateTradeReflection(reflection.decision_id, {
            outcome: 'breakeven', // 默认为breakeven，因为无法确定
            exit_ts: Date.now(),
            holding_time_minutes: holdingTimeMinutes,
            insights: '此交易可能被止盈止损自动平仓，但未能从OKX获取准确的平仓信息（可能是数据延迟或时间窗口外）。',
            improvement: '建议：确保所有平仓操作都通过系统记录，或增加历史数据查询范围。'
          });
          
          console.log(`[trade-reflection] ⚠️ 未找到准确盈亏数据: ${reflection.symbol} ${reflection.action}`);
        }
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`[trade-reflection] ✅ 自动更新完成，耗时${elapsed}ms`);
    
  } catch (error) {
    console.error(`[trade-reflection] ❌ 自动更新失败:`, error);
    console.error(`[trade-reflection] 错误堆栈:`, (error as Error).stack);
  }
}

/**
 * 生成市场条件快照
 */
function generateMarketConditionsSnapshot(): string {
  // 简化版本 - 记录时间戳
  // 可以后续扩展为记录更多市场数据
  return `市场快照 @ ${new Date().toISOString()}`;
}

/**
 * 生成AI反思分析
 * 分析交易结果，提取经验教训
 */
async function generateAIReflection(trade: TradeReflectionRow & {
  exit_price: number;
  pnl_amount: number;
  pnl_percentage: number;
  holding_time_minutes: number;
  outcome: 'profit' | 'loss' | 'breakeven';
}): Promise<{
  mistakes: string;
  insights: string;
  improvement: string;
  actualVsExpected: string;
}> {
  // 基础规则分析（未来可以调用GPT进行深度分析）
  const mistakes: string[] = [];
  const insights: string[] = [];
  const improvements: string[] = [];
  
  // 分析盈亏结果
  if (trade.outcome === 'loss') {
    if (trade.pnl_percentage && trade.pnl_percentage < -8) {
      mistakes.push('亏损超过8%，止损可能设置不当或未及时执行');
      improvements.push('优化止损策略，严格执行风控规则');
    }
    
    if (trade.holding_time_minutes < 30) {
      mistakes.push('持仓时间不足30分钟就亏损离场，可能是入场时机不佳');
      improvements.push('提高入场信号的确认标准，等待更强的技术确认');
    }
    
    insights.push(`亏损交易：需要重点分析入场逻辑是否存在问题`);
  } else if (trade.outcome === 'profit') {
    if (trade.pnl_percentage && trade.pnl_percentage < 3) {
      insights.push('盈利较小，可能过早离场');
      improvements.push('考虑优化止盈策略，让利润充分奔跑');
    } else if (trade.pnl_percentage && trade.pnl_percentage > 15) {
      insights.push('获得显著盈利！记录此次成功的技术设置和市场条件');
    }
    
    if (trade.holding_time_minutes > 360) {
      insights.push('长时间持仓获利，说明趋势判断准确');
    }
  }
  
  // 分析置信度 vs 结果
  const confidenceMatch = (trade.confidence && trade.confidence > 75 && trade.outcome === 'profit') ||
                          (trade.confidence && trade.confidence < 60 && trade.outcome === 'loss');
  
  const actualVsExpected = confidenceMatch 
    ? '✅ 结果与预期置信度一致'
    : '⚠️ 结果与预期置信度不符，需要校准信号判断';
  
  if (!confidenceMatch && trade.outcome === 'loss') {
    improvements.push('高置信度交易仍然失败，需要重新审视该类型的信号判断标准');
  }
  
  return {
    mistakes: mistakes.length > 0 ? mistakes.join('; ') : '无明显错误',
    insights: insights.length > 0 ? insights.join('; ') : '常规交易',
    improvement: improvements.length > 0 ? improvements.join('; ') : '继续保持',
    actualVsExpected
  };
}

/**
 * 获取最近的反思报告（用于提示词优化）
 * @param limit 返回最近N条记录
 * @param daysBack 查询最近N天的数据
 */
export function getRecentReflections(limit = 20, daysBack = 7): TradeReflectionRow[] {
  const since = Date.now() - daysBack * 24 * 3600 * 1000;
  return queryTradeReflections({ since, limit });
}

/**
 * 生成反思摘要报告
 */
export function generateReflectionSummary(options?: { 
  symbol?: string; 
  days?: number 
}): {
  stats: ReturnType<typeof getTradeStatistics>;
  topMistakes: string[];
  topInsights: string[];
  recommendations: string[];
} {
  const stats = getTradeStatistics(options);
  const reflections = queryTradeReflections({
    symbol: options?.symbol,
    since: options?.days ? Date.now() - options.days * 24 * 3600 * 1000 : undefined,
    limit: 100
  });
  
  // 统计最常见的错误
  const mistakesMap: Record<string, number> = {};
  const insightsMap: Record<string, number> = {};
  
  reflections.forEach(r => {
    if (r.mistakes) {
      r.mistakes.split(';').forEach(m => {
        const mistake = m.trim();
        if (mistake && mistake !== '无明显错误') {
          mistakesMap[mistake] = (mistakesMap[mistake] || 0) + 1;
        }
      });
    }
    
    if (r.insights) {
      r.insights.split(';').forEach(i => {
        const insight = i.trim();
        if (insight && insight !== '常规交易') {
          insightsMap[insight] = (insightsMap[insight] || 0) + 1;
        }
      });
    }
  });
  
  // 排序并取前5个
  const topMistakes = Object.entries(mistakesMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([mistake, count]) => `${mistake} (${count}次)`);
  
  const topInsights = Object.entries(insightsMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([insight, count]) => `${insight} (${count}次)`);
  
  // 生成改进建议
  const recommendations: string[] = [];
  
  if (stats.winRate < 50) {
    recommendations.push('⚠️ 胜率低于50%，建议提高入场信号的筛选标准');
  }
  
  if (stats.avgPnl < 0) {
    recommendations.push('⚠️ 平均盈亏为负，建议优化止损和止盈策略');
  }
  
  if (stats.avgHoldingTime < 30) {
    recommendations.push('⚠️ 平均持仓时间过短，可能频繁交易，建议提高信号质量');
  }
  
  if (stats.totalTrades < 10) {
    recommendations.push('📊 样本数量较少，继续积累交易数据以获得更准确的分析');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('✅ 整体表现良好，继续保持当前策略');
  }
  
  return {
    stats,
    topMistakes,
    topInsights,
    recommendations
  };
}

/**
 * 为提示词优化提供反思数据
 * 返回结构化的反思数据，用于动态调整提示词
 */
export function getReflectionsForPromptOptimization(): {
  recentLosses: TradeReflectionRow[];
  recentWins: TradeReflectionRow[];
  commonMistakes: string[];
  successPatterns: string[];
} {
  const recentReflections = getRecentReflections(30, 7);
  
  const recentLosses = recentReflections
    .filter(r => r.outcome === 'loss')
    .slice(0, 10);
  
  const recentWins = recentReflections
    .filter(r => r.outcome === 'profit')
    .slice(0, 10);
  
  // 提取常见错误和成功模式
  const mistakes = new Set<string>();
  const successPatterns = new Set<string>();
  
  recentLosses.forEach(loss => {
    if (loss.mistakes) {
      loss.mistakes.split(';').forEach(m => {
        const mistake = m.trim();
        if (mistake && mistake !== '无明显错误') {
          mistakes.add(mistake);
        }
      });
    }
  });
  
  recentWins.forEach(win => {
    if (win.insights) {
      win.insights.split(';').forEach(i => {
        const insight = i.trim();
        if (insight && insight !== '常规交易') {
          successPatterns.add(insight);
        }
      });
    }
  });
  
  return {
    recentLosses,
    recentWins,
    commonMistakes: Array.from(mistakes).slice(0, 5),
    successPatterns: Array.from(successPatterns).slice(0, 5)
  };
}

