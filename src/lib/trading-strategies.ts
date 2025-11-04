/**
 * 多策略融合框架
 * 
 * 支持多种交易策略并动态分配权重
 */

import { ema, macd, rsi } from './indicators';
import { bollingerBands, adx, marketStructure } from './advanced-indicators';

/**
 * 市场状态类型
 */
export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile';

/**
 * 策略信号
 */
export interface StrategySignal {
  action: 'LONG' | 'SHORT' | 'NEUTRAL';
  strength: number;  // 0-100
  confidence: number;  // 0-100
  reasoning: string;
}

/**
 * 策略权重配置
 */
export interface StrategyWeights {
  trendFollowing: number;
  meanReversion: number;
  breakout: number;
  momentum: number;
}

/**
 * 趋势跟随策略
 */
export class TrendFollowingStrategy {
  /**
   * 分析趋势跟随信号
   * 
   * @param indicators 技术指标
   * @returns 交易信号
   */
  static analyze(indicators: {
    price: number;
    ema20_3m: number[];
    ema20_4h: number[];
    macd_3m: number[];
    macd_4h: number[];
    adx?: number;
  }): StrategySignal {
    const ema20_3m = indicators.ema20_3m[indicators.ema20_3m.length - 1];
    const ema20_4h = indicators.ema20_4h[indicators.ema20_4h.length - 1];
    const macd_3m = indicators.macd_3m[indicators.macd_3m.length - 1];
    const macd_4h = indicators.macd_4h[indicators.macd_4h.length - 1];
    
    let strength = 0;
    const reasons: string[] = [];
    
    // 判断多头信号
    if (indicators.price > ema20_3m && indicators.price > ema20_4h) {
      strength += 30;
      reasons.push('价格在两个时间框架EMA之上');
    }
    
    if (macd_3m > 0 && macd_4h > 0) {
      strength += 30;
      reasons.push('MACD双时间框架金叉');
    }
    
    if (indicators.adx && indicators.adx > 25) {
      strength += 20;
      reasons.push(`ADX=${indicators.adx.toFixed(1)}表示强趋势`);
    }
    
    // 判断空头信号
    let shortStrength = 0;
    if (indicators.price < ema20_3m && indicators.price < ema20_4h) {
      shortStrength += 30;
    }
    
    if (macd_3m < 0 && macd_4h < 0) {
      shortStrength += 30;
    }
    
    if (indicators.adx && indicators.adx > 25 && shortStrength > 0) {
      shortStrength += 20;
    }
    
    // 确定最终信号
    let action: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
    let finalStrength = 50;
    
    if (strength > shortStrength && strength > 60) {
      action = 'LONG';
      finalStrength = strength;
    } else if (shortStrength > strength && shortStrength > 60) {
      action = 'SHORT';
      finalStrength = shortStrength;
    }
    
    return {
      action,
      strength: finalStrength,
      confidence: finalStrength,
      reasoning: reasons.join('; ') || '信号不明确'
    };
  }
}

/**
 * 均值回归策略
 */
export class MeanReversionStrategy {
  /**
   * 分析均值回归信号
   * 
   * @param indicators 技术指标
   * @returns 交易信号
   */
  static analyze(indicators: {
    price: number;
    bb: { upper: number; middle: number; lower: number; bandwidth: number };
    rsi: number;
    volume: number;
    avgVolume: number;
  }): StrategySignal {
    const { price, bb, rsi, volume, avgVolume } = indicators;
    
    let strength = 0;
    const reasons: string[] = [];
    
    // 判断超卖反弹（做多）
    if (price < bb.lower && rsi < 30) {
      strength += 40;
      reasons.push(`价格触及布林带下轨且RSI=${rsi.toFixed(1)}超卖`);
    }
    
    if (volume > avgVolume * 1.5 && price < bb.middle) {
      strength += 30;
      reasons.push('放量下跌，可能反弹');
    }
    
    // 判断超买回调（做空）
    let shortStrength = 0;
    if (price > bb.upper && rsi > 70) {
      shortStrength += 40;
    }
    
    if (volume > avgVolume * 1.5 && price > bb.middle) {
      shortStrength += 30;
    }
    
    let action: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
    let finalStrength = 50;
    
    if (strength > shortStrength && strength > 60) {
      action = 'LONG';
      finalStrength = strength;
    } else if (shortStrength > strength && shortStrength > 60) {
      action = 'SHORT';
      finalStrength = shortStrength;
    }
    
    return {
      action,
      strength: finalStrength,
      confidence: finalStrength,
      reasoning: reasons.join('; ') || '无明确均值回归信号'
    };
  }
}

/**
 * 突破策略
 */
export class BreakoutStrategy {
  /**
   * 分析突破信号
   * 
   * @param indicators 技术指标
   * @returns 交易信号
   */
  static analyze(indicators: {
    price: number;
    high20: number;  // 20周期最高价
    low20: number;   // 20周期最低价
    volume: number;
    avgVolume: number;
    bb: { upper: number; lower: number; bandwidth: number };
  }): StrategySignal {
    const { price, high20, low20, volume, avgVolume, bb } = indicators;
    
    let strength = 0;
    const reasons: string[] = [];
    
    // 向上突破
    if (price > high20 && volume > avgVolume * 1.3) {
      strength += 50;
      reasons.push('放量突破20周期新高');
    }
    
    if (bb.bandwidth < 10 && price > bb.upper) {
      strength += 30;
      reasons.push('布林带收窄后向上突破');
    }
    
    // 向下突破
    let shortStrength = 0;
    if (price < low20 && volume > avgVolume * 1.3) {
      shortStrength += 50;
    }
    
    if (bb.bandwidth < 10 && price < bb.lower) {
      shortStrength += 30;
    }
    
    let action: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
    let finalStrength = 50;
    
    if (strength > shortStrength && strength > 60) {
      action = 'LONG';
      finalStrength = strength;
    } else if (shortStrength > strength && shortStrength > 60) {
      action = 'SHORT';
      finalStrength = shortStrength;
    }
    
    return {
      action,
      strength: finalStrength,
      confidence: finalStrength,
      reasoning: reasons.join('; ') || '无突破信号'
    };
  }
}

/**
 * 动量策略
 */
export class MomentumStrategy {
  /**
   * 分析动量信号
   * 
   * @param indicators 技术指标
   * @returns 交易信号
   */
  static analyze(indicators: {
    price: number;
    prices: number[];  // 价格序列
    rsi: number;
    macd: number;
    volume: number;
    avgVolume: number;
  }): StrategySignal {
    const { price, prices, rsi, macd, volume, avgVolume } = indicators;
    
    if (prices.length < 10) {
      return { action: 'NEUTRAL', strength: 50, confidence: 0, reasoning: '数据不足' };
    }
    
    // 计算价格变化率
    const priceChange10 = ((price - prices[prices.length - 10]) / prices[prices.length - 10]) * 100;
    const priceChange5 = ((price - prices[prices.length - 5]) / prices[prices.length - 5]) * 100;
    
    let strength = 0;
    const reasons: string[] = [];
    
    // 强势上涨动量
    if (priceChange10 > 5 && priceChange5 > 2) {
      strength += 35;
      reasons.push(`强势上涨：10期+${priceChange10.toFixed(1)}%, 5期+${priceChange5.toFixed(1)}%`);
    }
    
    if (rsi > 50 && rsi < 80 && macd > 0) {
      strength += 30;
      reasons.push('RSI和MACD显示持续动量');
    }
    
    if (volume > avgVolume * 1.2) {
      strength += 20;
      reasons.push('成交量确认');
    }
    
    // 强势下跌动量
    let shortStrength = 0;
    if (priceChange10 < -5 && priceChange5 < -2) {
      shortStrength += 35;
    }
    
    if (rsi < 50 && rsi > 20 && macd < 0) {
      shortStrength += 30;
    }
    
    if (volume > avgVolume * 1.2) {
      shortStrength += 20;
    }
    
    let action: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
    let finalStrength = 50;
    
    if (strength > shortStrength && strength > 60) {
      action = 'LONG';
      finalStrength = strength;
    } else if (shortStrength > strength && shortStrength > 60) {
      action = 'SHORT';
      finalStrength = shortStrength;
    }
    
    return {
      action,
      strength: finalStrength,
      confidence: finalStrength,
      reasoning: reasons.join('; ') || '无明显动量'
    };
  }
}

/**
 * 策略融合引擎
 */
export class StrategyFusion {
  /**
   * 根据市场状态分配策略权重
   * 
   * @param marketRegime 市场状态
   * @returns 策略权重
   */
  static allocateWeights(marketRegime: MarketRegime): StrategyWeights {
    switch (marketRegime) {
      case 'trending_up':
      case 'trending_down':
        return {
          trendFollowing: 0.5,
          meanReversion: 0.1,
          breakout: 0.2,
          momentum: 0.2
        };
      
      case 'ranging':
        return {
          trendFollowing: 0.1,
          meanReversion: 0.5,
          breakout: 0.3,
          momentum: 0.1
        };
      
      case 'volatile':
        return {
          trendFollowing: 0.2,
          meanReversion: 0.3,
          breakout: 0.3,
          momentum: 0.2
        };
      
      default:
        return {
          trendFollowing: 0.25,
          meanReversion: 0.25,
          breakout: 0.25,
          momentum: 0.25
        };
    }
  }
  
  /**
   * 融合多个策略信号
   * 
   * @param signals 各策略信号
   * @param weights 策略权重
   * @returns 综合信号
   */
  static fuseSignals(
    signals: {
      trendFollowing: StrategySignal;
      meanReversion: StrategySignal;
      breakout: StrategySignal;
      momentum: StrategySignal;
    },
    weights: StrategyWeights
  ): StrategySignal {
    // 计算加权分数
    const longScore = 
      (signals.trendFollowing.action === 'LONG' ? signals.trendFollowing.strength : 0) * weights.trendFollowing +
      (signals.meanReversion.action === 'LONG' ? signals.meanReversion.strength : 0) * weights.meanReversion +
      (signals.breakout.action === 'LONG' ? signals.breakout.strength : 0) * weights.breakout +
      (signals.momentum.action === 'LONG' ? signals.momentum.strength : 0) * weights.momentum;
    
    const shortScore =
      (signals.trendFollowing.action === 'SHORT' ? signals.trendFollowing.strength : 0) * weights.trendFollowing +
      (signals.meanReversion.action === 'SHORT' ? signals.meanReversion.strength : 0) * weights.meanReversion +
      (signals.breakout.action === 'SHORT' ? signals.breakout.strength : 0) * weights.breakout +
      (signals.momentum.action === 'SHORT' ? signals.momentum.strength : 0) * weights.momentum;
    
    // 确定最终信号
    let action: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 50;
    
    if (longScore > shortScore && longScore > 50) {
      action = 'LONG';
      strength = longScore;
    } else if (shortScore > longScore && shortScore > 50) {
      action = 'SHORT';
      strength = shortScore;
    }
    
    // 收集reasoning
    const activeSignals: string[] = [];
    if (signals.trendFollowing.action === action) {
      activeSignals.push(`趋势跟随(${signals.trendFollowing.strength.toFixed(0)}): ${signals.trendFollowing.reasoning}`);
    }
    if (signals.meanReversion.action === action) {
      activeSignals.push(`均值回归(${signals.meanReversion.strength.toFixed(0)}): ${signals.meanReversion.reasoning}`);
    }
    if (signals.breakout.action === action) {
      activeSignals.push(`突破(${signals.breakout.strength.toFixed(0)}): ${signals.breakout.reasoning}`);
    }
    if (signals.momentum.action === action) {
      activeSignals.push(`动量(${signals.momentum.strength.toFixed(0)}): ${signals.momentum.reasoning}`);
    }
    
    const reasoning = activeSignals.length > 0 
      ? activeSignals.join(' | ')
      : '各策略信号不一致，建议观望';
    
    return {
      action,
      strength: Number(strength.toFixed(2)),
      confidence: Number(strength.toFixed(2)),
      reasoning
    };
  }
  
  /**
   * 检测市场状态
   * 
   * @param indicators 技术指标
   * @returns 市场状态
   */
  static detectMarketRegime(indicators: {
    prices: number[];
    ema20: number[];
    atr: number[];
    adx?: number;
  }): MarketRegime {
    if (indicators.prices.length < 20 || indicators.atr.length === 0) {
      return 'ranging';
    }
    
    // 1. 波动性检测
    const currentAtr = indicators.atr[indicators.atr.length - 1];
    const avgAtr = indicators.atr.reduce((a, b) => a + b, 0) / indicators.atr.length;
    const volatilityRatio = currentAtr / avgAtr;
    
    if (volatilityRatio > 1.5) {
      return 'volatile';
    }
    
    // 2. 趋势检测
    const currentPrice = indicators.prices[indicators.prices.length - 1];
    const currentEma = indicators.ema20[indicators.ema20.length - 1];
    const price20ago = indicators.prices[Math.max(0, indicators.prices.length - 20)];
    const ema20ago = indicators.ema20[Math.max(0, indicators.ema20.length - 20)];
    
    const priceChange = ((currentPrice - price20ago) / price20ago) * 100;
    const emaChange = ((currentEma - ema20ago) / ema20ago) * 100;
    
    // 3. 使用ADX确认
    const hasTrend = indicators.adx ? indicators.adx > 25 : Math.abs(priceChange) > 5;
    
    if (hasTrend) {
      if (priceChange > 0 && emaChange > 0) {
        return 'trending_up';
      } else if (priceChange < 0 && emaChange < 0) {
        return 'trending_down';
      }
    }
    
    return 'ranging';
  }
}

/**
 * 策略性能评估
 */
export interface StrategyPerformance {
  strategyName: string;
  winRate: number;
  avgProfit: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
}

/**
 * 自适应策略选择器
 * 根据历史表现动态调整策略权重
 */
export class AdaptiveStrategySelector {
  /**
   * 根据历史表现调整策略权重
   * 
   * @param performances 各策略历史表现
   * @param baseWeights 基础权重
   * @returns 调整后的权重
   */
  static adjustWeights(
    performances: Record<string, StrategyPerformance>,
    baseWeights: StrategyWeights
  ): StrategyWeights {
    // 计算性能分数（综合胜率、平均盈利、夏普比率）
    const performanceScores: Record<string, number> = {};
    
    Object.entries(performances).forEach(([name, perf]) => {
      if (perf.totalTrades < 10) {
        // 样本不足，使用基础权重
        performanceScores[name] = 1.0;
      } else {
        // 综合评分：胜率40% + 平均盈利30% + 夏普比率30%
        const winRateScore = perf.winRate / 100;
        const profitScore = Math.min(perf.avgProfit / 100, 1);  // 归一化
        const sharpeScore = Math.min(Math.max(perf.sharpeRatio / 2, 0), 1);  // 归一化
        
        performanceScores[name] = winRateScore * 0.4 + profitScore * 0.3 + sharpeScore * 0.3;
      }
    });
    
    // 调整权重
    const adjust = (basWeight: number, strategyKey: string): number => {
      const score = performanceScores[strategyKey] || 1.0;
      return baseWeight * score;
    };
    
    const adjusted = {
      trendFollowing: adjust(baseWeights.trendFollowing, 'trendFollowing'),
      meanReversion: adjust(baseWeights.meanReversion, 'meanReversion'),
      breakout: adjust(baseWeights.breakout, 'breakout'),
      momentum: adjust(baseWeights.momentum, 'momentum')
    };
    
    // 归一化权重（总和=1）
    const sum = Object.values(adjusted).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      return {
        trendFollowing: adjusted.trendFollowing / sum,
        meanReversion: adjusted.meanReversion / sum,
        breakout: adjusted.breakout / sum,
        momentum: adjusted.momentum / sum
      };
    }
    
    return baseWeights;
  }
}

