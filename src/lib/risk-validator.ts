/**
 * 交易前风险验证模块
 * 
 * 在执行交易前进行全面的风险检查，防止过度交易和资金风险
 */

import { ParsedDecision } from './ai-trading-prompt';

/**
 * 仓位接口（简化版本）
 */
export interface Position {
  coin: string;
  side: 'long' | 'short';
  notional: number;
  leverage: number;
  unrealizedPnl: number;
}

/**
 * 风险验证结果
 */
export interface RiskValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  riskMetrics: {
    totalExposure: number;          // 总风险敞口（所有仓位名义价值之和）
    totalExposurePercent: number;   // 占总资产百分比
    symbolExposure: number;         // 单币种风险敞口
    symbolExposurePercent: number;  // 单币种占比
    maxLeverage: number;            // 最大杠杆
    openPositionsCount: number;     // 开仓数量
    availableMargin: number;        // 可用保证金
    marginUsagePercent: number;     // 保证金使用率
  };
}

/**
 * 风险限制配置
 */
export const RISK_LIMITS = {
  /** 最大总风险敞口（占总资产百分比） */
  MAX_TOTAL_EXPOSURE_PERCENT: 80,
  
  /** 最大单币种风险敞口（占总资产百分比） */
  MAX_SYMBOL_EXPOSURE_PERCENT: 30,
  
  /** 最大同时开仓数量 */
  MAX_OPEN_POSITIONS: 6,
  
  /** 最大杠杆倍数 */
  MAX_LEVERAGE: 10,
  
  /** 最小可用保证金（USDT） */
  MIN_AVAILABLE_MARGIN: 50,
  
  /** 最大保证金使用率 */
  MAX_MARGIN_USAGE_PERCENT: 90,
  
  /** 单笔订单最小金额（USDT） */
  MIN_ORDER_SIZE: 10,
  
  /** 单笔订单最大金额占比（占可用资金） */
  MAX_SINGLE_ORDER_PERCENT: 50,
} as const;

/**
 * 交易前风险验证器
 */
export class PreTradeValidator {
  /**
   * 全面的交易前风险检查
   * 
   * @param currentPositions 当前持仓
   * @param decision AI决策
   * @param accountTotal 账户总资产
   * @param availableMargin 可用保证金
   * @param proposedNotional 拟开仓的名义价值
   * @returns 验证结果
   */
  static validateTrade(
    currentPositions: Position[],
    decision: ParsedDecision,
    accountTotal: number,
    availableMargin: number,
    proposedNotional: number
  ): RiskValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 1. 计算当前风险指标
    const currentTotalExposure = currentPositions.reduce((sum, p) => sum + p.notional, 0);
    const symbolExposure = currentPositions
      .filter(p => p.coin === decision.symbol)
      .reduce((sum, p) => sum + p.notional, 0);
    const maxLeverage = Math.max(...currentPositions.map(p => p.leverage), decision.leverage || 1);
    const openPositionsCount = currentPositions.length;
    
    // 2. 计算新订单后的风险指标
    const isClosing = decision.action.includes('CLOSE');
    const newTotalExposure = isClosing 
      ? currentTotalExposure - symbolExposure  // 平仓减少敞口
      : currentTotalExposure + proposedNotional;  // 开仓增加敞口
    
    const newSymbolExposure = isClosing 
      ? 0  // 平仓后该币种敞口为0
      : symbolExposure + proposedNotional;
    
    const totalExposurePercent = accountTotal > 0 ? (newTotalExposure / accountTotal) * 100 : 0;
    const symbolExposurePercent = accountTotal > 0 ? (newSymbolExposure / accountTotal) * 100 : 0;
    const marginUsagePercent = accountTotal > 0 ? ((accountTotal - availableMargin) / accountTotal) * 100 : 0;
    
    // 3. 仅对开仓操作进行风险检查
    if (!isClosing) {
      // 检查1: 可用保证金是否足够
      if (availableMargin < RISK_LIMITS.MIN_AVAILABLE_MARGIN) {
        errors.push(`可用保证金不足：$${availableMargin.toFixed(2)} < $${RISK_LIMITS.MIN_AVAILABLE_MARGIN}最低要求`);
      }
      
      // 检查2: 总风险敞口是否超限
      if (totalExposurePercent > RISK_LIMITS.MAX_TOTAL_EXPOSURE_PERCENT) {
        errors.push(`总风险敞口超限：${totalExposurePercent.toFixed(1)}% > ${RISK_LIMITS.MAX_TOTAL_EXPOSURE_PERCENT}%限制`);
      }
      
      // 检查3: 单币种风险敞口是否超限
      if (symbolExposurePercent > RISK_LIMITS.MAX_SYMBOL_EXPOSURE_PERCENT) {
        errors.push(`${decision.symbol}单币种风险超限：${symbolExposurePercent.toFixed(1)}% > ${RISK_LIMITS.MAX_SYMBOL_EXPOSURE_PERCENT}%限制`);
      }
      
      // 检查4: 是否超过最大持仓数
      if (openPositionsCount >= RISK_LIMITS.MAX_OPEN_POSITIONS) {
        errors.push(`持仓数量已达上限：${openPositionsCount} >= ${RISK_LIMITS.MAX_OPEN_POSITIONS}`);
      }
      
      // 检查5: 杠杆是否超限
      if ((decision.leverage || 1) > RISK_LIMITS.MAX_LEVERAGE) {
        errors.push(`杠杆倍数超限：${decision.leverage}x > ${RISK_LIMITS.MAX_LEVERAGE}x限制`);
      }
      
      // 检查6: 订单金额是否过小
      if (proposedNotional < RISK_LIMITS.MIN_ORDER_SIZE) {
        errors.push(`订单金额过小：$${proposedNotional.toFixed(2)} < $${RISK_LIMITS.MIN_ORDER_SIZE}最低要求`);
      }
      
      // 检查7: 单笔订单是否过大
      const orderSizePercent = availableMargin > 0 ? (proposedNotional / (decision.leverage || 1) / availableMargin) * 100 : 0;
      if (orderSizePercent > RISK_LIMITS.MAX_SINGLE_ORDER_PERCENT) {
        warnings.push(`单笔订单占用过大：${orderSizePercent.toFixed(1)}% > ${RISK_LIMITS.MAX_SINGLE_ORDER_PERCENT}%建议值`);
      }
      
      // 检查8: 保证金使用率是否过高
      if (marginUsagePercent > RISK_LIMITS.MAX_MARGIN_USAGE_PERCENT) {
        warnings.push(`保证金使用率过高：${marginUsagePercent.toFixed(1)}% > ${RISK_LIMITS.MAX_MARGIN_USAGE_PERCENT}%警戒线`);
      }
      
      // 检查9: 是否有相同方向的仓位（防止重复开仓）
      const sameDirection = currentPositions.find(p => {
        const isLong = decision.action === 'OPEN_LONG';
        return p.coin === decision.symbol && ((isLong && p.side === 'long') || (!isLong && p.side === 'short'));
      });
      
      if (sameDirection) {
        errors.push(`已存在${decision.symbol}的${sameDirection.side === 'long' ? '多头' : '空头'}仓位，请勿重复开仓`);
      }
      
      // 检查10: 止盈止损是否设置
      if (!decision.takeProfit || !decision.stopLoss) {
        warnings.push('未设置止盈或止损，建议补充风控参数');
      } else {
        // 验证止盈止损是否合理
        const tpDistance = Math.abs((decision.takeProfit - (decision.entryPrice || 0)) / (decision.entryPrice || 1)) * 100;
        const slDistance = Math.abs((decision.stopLoss - (decision.entryPrice || 0)) / (decision.entryPrice || 1)) * 100;
        
        if (slDistance > 10) {
          warnings.push(`止损距离过大：${slDistance.toFixed(1)}% > 10%建议值，可能造成大额亏损`);
        }
        
        if (tpDistance < slDistance) {
          warnings.push(`风险收益比不佳：止盈${tpDistance.toFixed(1)}% < 止损${slDistance.toFixed(1)}%`);
        }
      }
    }
    
    // 4. 返回验证结果
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      riskMetrics: {
        totalExposure: newTotalExposure,
        totalExposurePercent,
        symbolExposure: newSymbolExposure,
        symbolExposurePercent,
        maxLeverage,
        openPositionsCount: isClosing ? openPositionsCount - 1 : openPositionsCount + 1,
        availableMargin,
        marginUsagePercent
      }
    };
  }
  
  /**
   * 格式化风险验证结果为可读字符串
   */
  static formatValidationResult(result: RiskValidationResult): string {
    const lines: string[] = [];
    
    lines.push('【交易前风险检查】');
    lines.push('');
    
    // 风险指标
    lines.push('风险指标:');
    lines.push(`  总风险敞口: $${result.riskMetrics.totalExposure.toFixed(2)} (${result.riskMetrics.totalExposurePercent.toFixed(1)}%)`);
    lines.push(`  单币种敞口: $${result.riskMetrics.symbolExposure.toFixed(2)} (${result.riskMetrics.symbolExposurePercent.toFixed(1)}%)`);
    lines.push(`  持仓数量: ${result.riskMetrics.openPositionsCount}`);
    lines.push(`  保证金使用: ${result.riskMetrics.marginUsagePercent.toFixed(1)}%`);
    lines.push(`  可用保证金: $${result.riskMetrics.availableMargin.toFixed(2)}`);
    lines.push('');
    
    // 错误信息
    if (result.errors.length > 0) {
      lines.push('❌ 风险检查失败:');
      result.errors.forEach((err, idx) => {
        lines.push(`  ${idx + 1}. ${err}`);
      });
      lines.push('');
    }
    
    // 警告信息
    if (result.warnings.length > 0) {
      lines.push('⚠️  风险警告:');
      result.warnings.forEach((warn, idx) => {
        lines.push(`  ${idx + 1}. ${warn}`);
      });
      lines.push('');
    }
    
    if (result.isValid && result.warnings.length === 0) {
      lines.push('✅ 风险检查通过，可以安全交易');
    } else if (result.isValid) {
      lines.push('✅ 风险检查通过，但存在警告，请谨慎交易');
    } else {
      lines.push('❌ 风险检查未通过，建议调整订单参数或等待市场条件改善');
    }
    
    return lines.join('\n');
  }
  
  /**
   * 快速检查：是否可以开仓
   * 简化版本，用于AI提示词生成时的快速判断
   */
  static canOpenPosition(
    currentPositions: Position[],
    availableMargin: number,
    symbol: string,
    side: 'long' | 'short'
  ): { allowed: boolean; reason?: string } {
    // 检查是否已有相同仓位
    const existing = currentPositions.find(p => p.coin === symbol && p.side === side);
    if (existing) {
      return { allowed: false, reason: `已存在${symbol}的${side}仓位` };
    }
    
    // 检查持仓数量
    if (currentPositions.length >= RISK_LIMITS.MAX_OPEN_POSITIONS) {
      return { allowed: false, reason: `持仓数量已达上限(${RISK_LIMITS.MAX_OPEN_POSITIONS})` };
    }
    
    // 检查可用保证金
    if (availableMargin < RISK_LIMITS.MIN_AVAILABLE_MARGIN) {
      return { allowed: false, reason: `可用保证金不足($${availableMargin.toFixed(2)} < $${RISK_LIMITS.MIN_AVAILABLE_MARGIN})` };
    }
    
    return { allowed: true };
  }
}

/**
 * 动态止损计算器
 * 基于ATR波动率动态调整止损距离
 */
export class DynamicStopLossCalculator {
  /**
   * 计算动态止损和止盈价格
   * 
   * @param params 参数
   * @returns 止损止盈价格
   */
  static calculate(params: {
    symbol: string;
    side: 'long' | 'short';
    entryPrice: number;
    atr: number;                    // ATR波动率
    leverage: number;
    marketCondition?: 'trending' | 'ranging' | 'volatile';
    riskRewardRatio?: number;       // 风险收益比，默认1:2
  }): {
    stopLoss: number;
    takeProfit: number;
    stopLossDistance: number;
    takeProfitDistance: number;
    riskAmount: number;            // 风险金额（基于仓位大小）
  } {
    const { symbol, side, entryPrice, atr, leverage, marketCondition = 'trending', riskRewardRatio = 2 } = params;
    
    // 1. 计算基础止损距离（基于ATR）
    // 趋势市场：2倍ATR
    // 震荡市场：1.5倍ATR
    // 波动市场：2.5倍ATR
    const atrMultiplier = {
      'trending': 2.0,
      'ranging': 1.5,
      'volatile': 2.5
    }[marketCondition];
    
    let baseStopDistance = atr * atrMultiplier;
    
    // 2. 杠杆调整：高杠杆需要更紧的止损
    const leverageAdjustment = leverage > 5 ? 0.8 : 1.0;
    baseStopDistance = baseStopDistance * leverageAdjustment;
    
    // 3. 确保止损在合理范围内（3%-10%）
    const minStopPercent = 0.03;  // 最小3%
    const maxStopPercent = 0.10;  // 最大10%
    
    let stopDistancePercent = baseStopDistance / entryPrice;
    stopDistancePercent = Math.max(minStopPercent, Math.min(maxStopPercent, stopDistancePercent));
    
    // 4. 计算止损价格
    const stopLossDistance = entryPrice * stopDistancePercent;
    const stopLoss = side === 'long' 
      ? entryPrice - stopLossDistance 
      : entryPrice + stopLossDistance;
    
    // 5. 计算止盈价格（基于风险收益比）
    const takeProfitDistance = stopLossDistance * riskRewardRatio;
    const takeProfit = side === 'long'
      ? entryPrice + takeProfitDistance
      : entryPrice - takeProfitDistance;
    
    // 6. 估算风险金额（假设1000 USDT仓位）
    const estimatedPositionSize = 1000;  // 假设
    const riskAmount = (stopLossDistance / entryPrice) * estimatedPositionSize * leverage;
    
    return {
      stopLoss: Number(stopLoss.toFixed(2)),
      takeProfit: Number(takeProfit.toFixed(2)),
      stopLossDistance: Number(stopLossDistance.toFixed(2)),
      takeProfitDistance: Number(takeProfitDistance.toFixed(2)),
      riskAmount: Number(riskAmount.toFixed(2))
    };
  }
  
  /**
   * 根据市场条件判断当前市场类型
   */
  static detectMarketCondition(indicators: {
    ema20_3m: number[];
    ema20_4h: number[];
    atr: number;
    avgAtr: number;
  }): 'trending' | 'ranging' | 'volatile' {
    // 波动率判断
    const volatilityRatio = indicators.atr / indicators.avgAtr;
    if (volatilityRatio > 1.5) {
      return 'volatile';  // 高波动
    }
    
    // 趋势判断（EMA斜率）
    const ema3m = indicators.ema20_3m;
    const ema4h = indicators.ema20_4h;
    
    if (ema3m.length < 10 || ema4h.length < 10) {
      return 'ranging';  // 数据不足，默认震荡
    }
    
    // 计算EMA斜率
    const slope3m = (ema3m[ema3m.length - 1] - ema3m[ema3m.length - 10]) / ema3m[ema3m.length - 10];
    const slope4h = (ema4h[ema4h.length - 1] - ema4h[ema4h.length - 5]) / ema4h[ema4h.length - 5];
    
    // 如果两个时间框架都有明显斜率，判断为趋势
    if (Math.abs(slope3m) > 0.01 && Math.abs(slope4h) > 0.01) {
      return 'trending';
    }
    
    return 'ranging';
  }
}

/**
 * 仓位规模计算器
 * 基于ATR和账户风险动态调整仓位大小
 */
export class PositionSizeCalculator {
  /**
   * 计算最优仓位大小
   * 
   * @param params 参数
   * @returns 推荐的仓位大小（USDT名义价值）
   */
  static calculateOptimalSize(params: {
    availableMargin: number;
    accountTotal: number;
    symbol: string;
    entryPrice: number;
    stopLoss: number;
    riskPercentPerTrade?: number;  // 单笔交易最大风险百分比，默认2%
    leverage: number;
  }): {
    recommendedNotional: number;
    recommendedMargin: number;
    maxLoss: number;
    maxLossPercent: number;
  } {
    const { availableMargin, accountTotal, entryPrice, stopLoss, riskPercentPerTrade = 2, leverage } = params;
    
    // 1. 计算单笔交易最大可承受亏损
    const maxRiskAmount = accountTotal * (riskPercentPerTrade / 100);
    
    // 2. 计算止损距离（百分比）
    const stopLossDistancePercent = Math.abs((entryPrice - stopLoss) / entryPrice);
    
    // 3. 计算推荐的名义价值
    // 公式: 名义价值 = 最大风险金额 / (止损距离 × 杠杆)
    // 因为: 亏损 = 名义价值 × 止损距离 / 杠杆
    const recommendedNotional = maxRiskAmount / stopLossDistancePercent;
    
    // 4. 计算所需保证金
    const recommendedMargin = recommendedNotional / leverage;
    
    // 5. 限制：不超过可用保证金的50%
    const maxMargin = availableMargin * 0.5;
    const finalMargin = Math.min(recommendedMargin, maxMargin);
    const finalNotional = finalMargin * leverage;
    
    // 6. 计算最大亏损
    const maxLoss = finalNotional * stopLossDistancePercent;
    const maxLossPercent = (maxLoss / accountTotal) * 100;
    
    return {
      recommendedNotional: Number(finalNotional.toFixed(2)),
      recommendedMargin: Number(finalMargin.toFixed(2)),
      maxLoss: Number(maxLoss.toFixed(2)),
      maxLossPercent: Number(maxLossPercent.toFixed(2))
    };
  }
}

