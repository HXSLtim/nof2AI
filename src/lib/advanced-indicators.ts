/**
 * 高级技术指标模块
 * 
 * 包含布林带、斐波那契、成交量分析等高级指标
 */

/**
 * K线数据接口
 */
export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
}

/**
 * 布林带计算
 * 
 * @param prices 价格数组
 * @param period 周期，默认20
 * @param stdDev 标准差倍数，默认2
 * @returns 布林带上中下轨数组
 */
export function bollingerBands(
  prices: number[],
  period = 20,
  stdDev = 2
): Array<{ upper: number; middle: number; lower: number; bandwidth: number }> {
  if (prices.length < period) {
    return [];
  }
  
  const result: Array<{ upper: number; middle: number; lower: number; bandwidth: number }> = [];
  
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    
    // 计算SMA（中轨）
    const middle = slice.reduce((sum, p) => sum + p, 0) / period;
    
    // 计算标准差
    const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    // 计算上下轨
    const upper = middle + stdDev * std;
    const lower = middle - stdDev * std;
    
    // 带宽（衡量波动性）
    const bandwidth = (upper - lower) / middle * 100;
    
    result.push({ upper, middle, lower, bandwidth });
  }
  
  return result;
}

/**
 * 斐波那契回撤位计算
 * 
 * @param high 最高价
 * @param low 最低价
 * @returns 斐波那契各级别价位
 */
export function fibonacciRetracements(high: number, low: number): {
  level_0: number;     // 0%
  level_236: number;   // 23.6%
  level_382: number;   // 38.2%
  level_500: number;   // 50%
  level_618: number;   // 61.8%
  level_786: number;   // 78.6%
  level_100: number;   // 100%
} {
  const range = high - low;
  
  return {
    level_0: high,
    level_236: high - range * 0.236,
    level_382: high - range * 0.382,
    level_500: high - range * 0.500,
    level_618: high - range * 0.618,
    level_786: high - range * 0.786,
    level_100: low
  };
}

/**
 * 斐波那契扩展位计算（用于设置止盈目标）
 * 
 * @param start 起点
 * @param end 终点
 * @returns 扩展位
 */
export function fibonacciExtensions(start: number, end: number): {
  level_0: number;     // 0%
  level_618: number;   // 61.8%
  level_100: number;   // 100%
  level_1618: number;  // 161.8%
  level_2618: number;  // 261.8%
} {
  const range = Math.abs(end - start);
  const direction = end > start ? 1 : -1;
  
  return {
    level_0: start,
    level_618: start + direction * range * 0.618,
    level_100: end,
    level_1618: end + direction * range * 0.618,
    level_2618: end + direction * range * 1.618
  };
}

/**
 * 成交量加权平均价（VWAP）
 * 
 * @param candles K线数据
 * @returns VWAP值数组
 */
export function vwap(candles: Candle[]): number[] {
  const result: number[] = [];
  let cumulativeTPV = 0;  // 累计典型价格×成交量
  let cumulativeVolume = 0;
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.vol;
    cumulativeVolume += candle.vol;
    
    const vwapValue = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice;
    result.push(vwapValue);
  }
  
  return result;
}

/**
 * 成交量分布分析
 * 找出重要的价格支撑/阻力位
 * 
 * @param candles K线数据
 * @param priceLevels 价格区间数量
 * @returns 成交量分布数据
 */
export function volumeProfile(
  candles: Candle[],
  priceLevels = 50
): Array<{ priceLevel: number; volume: number; percentage: number }> {
  if (candles.length === 0) return [];
  
  // 找出价格范围
  const prices = candles.flatMap(c => [c.high, c.low]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceStep = (maxPrice - minPrice) / priceLevels;
  
  // 初始化价格区间
  const volumeByLevel: Map<number, number> = new Map();
  for (let i = 0; i < priceLevels; i++) {
    const level = minPrice + i * priceStep;
    volumeByLevel.set(level, 0);
  }
  
  // 分配成交量到各价格区间
  candles.forEach(candle => {
    const avgPrice = (candle.high + candle.low) / 2;
    const levelIdx = Math.floor((avgPrice - minPrice) / priceStep);
    const level = minPrice + levelIdx * priceStep;
    
    const currentVol = volumeByLevel.get(level) || 0;
    volumeByLevel.set(level, currentVol + candle.vol);
  });
  
  // 计算总成交量
  const totalVolume = Array.from(volumeByLevel.values()).reduce((sum, v) => sum + v, 0);
  
  // 转换为数组并排序
  const result = Array.from(volumeByLevel.entries())
    .map(([priceLevel, volume]) => ({
      priceLevel,
      volume,
      percentage: totalVolume > 0 ? (volume / totalVolume) * 100 : 0
    }))
    .sort((a, b) => b.volume - a.volume);  // 按成交量降序
  
  return result;
}

/**
 * 找出POC（Point of Control）- 成交量最大的价格区间
 */
export function findPOC(profile: Array<{ priceLevel: number; volume: number }>): number {
  if (profile.length === 0) return 0;
  return profile[0].priceLevel;
}

/**
 * 威廉指标（Williams %R）
 * 
 * @param candles K线数据
 * @param period 周期，默认14
 * @returns Williams %R值数组
 */
export function williamsR(candles: Candle[], period = 14): number[] {
  if (candles.length < period) return [];
  
  const result: number[] = [];
  
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const highest = Math.max(...slice.map(c => c.high));
    const lowest = Math.min(...slice.map(c => c.low));
    const close = candles[i].close;
    
    const wr = ((highest - close) / (highest - lowest)) * -100;
    result.push(wr);
  }
  
  return result;
}

/**
 * 随机指标（Stochastic Oscillator）
 * 
 * @param candles K线数据
 * @param kPeriod K线周期，默认14
 * @param dPeriod D线周期，默认3
 * @returns {k, d}值数组
 */
export function stochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3
): Array<{ k: number; d: number }> {
  if (candles.length < kPeriod) return [];
  
  const kValues: number[] = [];
  
  // 计算K值
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...slice.map(c => c.high));
    const lowest = Math.min(...slice.map(c => c.low));
    const close = candles[i].close;
    
    const k = ((close - lowest) / (highest - lowest)) * 100;
    kValues.push(k);
  }
  
  // 计算D值（K值的移动平均）
  const result: Array<{ k: number; d: number }> = [];
  for (let i = dPeriod - 1; i < kValues.length; i++) {
    const dSlice = kValues.slice(i - dPeriod + 1, i + 1);
    const d = dSlice.reduce((sum, v) => sum + v, 0) / dPeriod;
    
    result.push({
      k: kValues[i],
      d
    });
  }
  
  return result;
}

/**
 * ADX（平均趋向指标）
 * 衡量趋势强度
 * 
 * @param candles K线数据
 * @param period 周期，默认14
 * @returns ADX值数组（>25表示强趋势，<20表示无趋势）
 */
export function adx(candles: Candle[], period = 14): number[] {
  if (candles.length < period + 1) return [];
  
  const tr: number[] = [];  // True Range
  const plusDM: number[] = [];  // +DM
  const minusDM: number[] = [];  // -DM
  
  // 计算TR, +DM, -DM
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    
    // True Range
    const trValue = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    tr.push(trValue);
    
    // Directional Movement
    const highDiff = curr.high - prev.high;
    const lowDiff = prev.low - curr.low;
    
    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
  }
  
  // 计算平滑的ATR, +DI, -DI
  const smoothTR: number[] = [];
  const smoothPlusDM: number[] = [];
  const smoothMinusDM: number[] = [];
  
  // 第一个平滑值是简单平均
  let sumTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let sumPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let sumMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  
  smoothTR.push(sumTR);
  smoothPlusDM.push(sumPlusDM);
  smoothMinusDM.push(sumMinusDM);
  
  // 后续使用Wilder平滑法
  for (let i = period; i < tr.length; i++) {
    sumTR = sumTR - sumTR / period + tr[i];
    sumPlusDM = sumPlusDM - sumPlusDM / period + plusDM[i];
    sumMinusDM = sumMinusDM - sumMinusDM / period + minusDM[i];
    
    smoothTR.push(sumTR);
    smoothPlusDM.push(sumPlusDM);
    smoothMinusDM.push(sumMinusDM);
  }
  
  // 计算+DI和-DI
  const plusDI = smoothPlusDM.map((dm, i) => (dm / smoothTR[i]) * 100);
  const minusDI = smoothMinusDM.map((dm, i) => (dm / smoothTR[i]) * 100);
  
  // 计算DX
  const dx = plusDI.map((pdi, i) => {
    const mdi = minusDI[i];
    const sum = pdi + mdi;
    return sum > 0 ? (Math.abs(pdi - mdi) / sum) * 100 : 0;
  });
  
  // 计算ADX（DX的移动平均）
  const adxValues: number[] = [];
  let adxSum = dx.slice(0, period).reduce((a, b) => a + b, 0);
  adxValues.push(adxSum / period);
  
  for (let i = period; i < dx.length; i++) {
    adxSum = adxSum - adxSum / period + dx[i];
    adxValues.push(adxSum / period);
  }
  
  return adxValues;
}

/**
 * OBV（能量潮指标）
 * 通过累计成交量变化判断资金流向
 * 
 * @param candles K线数据
 * @returns OBV值数组
 */
export function obv(candles: Candle[]): number[] {
  if (candles.length === 0) return [];
  
  const result: number[] = [];
  let cumulativeOBV = 0;
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      result.push(candles[i].vol);
      cumulativeOBV = candles[i].vol;
    } else {
      const priceChange = candles[i].close - candles[i - 1].close;
      
      if (priceChange > 0) {
        cumulativeOBV += candles[i].vol;
      } else if (priceChange < 0) {
        cumulativeOBV -= candles[i].vol;
      }
      // 价格不变时OBV不变
      
      result.push(cumulativeOBV);
    }
  }
  
  return result;
}

/**
 * 支撑阻力位识别
 * 基于价格高低点聚类识别关键价位
 * 
 * @param candles K线数据
 * @param tolerance 价格容忍度（百分比）
 * @returns 支撑阻力位数组
 */
export function identifySupportResistance(
  candles: Candle[],
  tolerance = 0.02
): Array<{ price: number; type: 'support' | 'resistance'; strength: number }> {
  if (candles.length < 10) return [];
  
  const pivots: Array<{ price: number; type: 'high' | 'low' }> = [];
  
  // 找出所有局部高低点
  for (let i = 2; i < candles.length - 2; i++) {
    const curr = candles[i];
    const prevPrev = candles[i - 2];
    const prev = candles[i - 1];
    const next = candles[i + 1];
    const nextNext = candles[i + 2];
    
    // 局部高点
    if (curr.high > prev.high && curr.high > prevPrev.high && 
        curr.high > next.high && curr.high > nextNext.high) {
      pivots.push({ price: curr.high, type: 'high' });
    }
    
    // 局部低点
    if (curr.low < prev.low && curr.low < prevPrev.low &&
        curr.low < next.low && curr.low < nextNext.low) {
      pivots.push({ price: curr.low, type: 'low' });
    }
  }
  
  // 聚类相近的价位
  const clusters: Map<number, { count: number; type: 'support' | 'resistance' }> = new Map();
  
  pivots.forEach(pivot => {
    let found = false;
    
    for (const [clusterPrice, data] of clusters.entries()) {
      if (Math.abs(pivot.price - clusterPrice) / clusterPrice < tolerance) {
        data.count++;
        found = true;
        break;
      }
    }
    
    if (!found) {
      clusters.set(pivot.price, {
        count: 1,
        type: pivot.type === 'high' ? 'resistance' : 'support'
      });
    }
  });
  
  // 转换为数组并按强度排序
  return Array.from(clusters.entries())
    .map(([price, data]) => ({
      price,
      type: data.type,
      strength: data.count
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);  // 只返回前5个最强的位置
}

/**
 * 市场结构分析
 * 判断当前市场是否形成高低点上移（上升趋势）或高低点下移（下降趋势）
 * 
 * @param candles K线数据
 * @returns 市场结构判断
 */
export function marketStructure(candles: Candle[]): {
  trend: 'uptrend' | 'downtrend' | 'ranging';
  higherHighs: number;    // 更高高点数量
  higherLows: number;     // 更高低点数量
  lowerHighs: number;     // 更低高点数量
  lowerLows: number;      // 更低低点数量
  strength: number;       // 趋势强度（0-100）
} {
  if (candles.length < 20) {
    return { trend: 'ranging', higherHighs: 0, higherLows: 0, lowerHighs: 0, lowerLows: 0, strength: 0 };
  }
  
  let higherHighs = 0;
  let higherLows = 0;
  let lowerHighs = 0;
  let lowerLows = 0;
  
  // 找出高低点
  const swings: Array<{ price: number; type: 'high' | 'low'; idx: number }> = [];
  
  for (let i = 5; i < candles.length - 5; i++) {
    const curr = candles[i];
    const prev5 = candles.slice(i - 5, i);
    const next5 = candles.slice(i + 1, i + 6);
    
    const isSwingHigh = curr.high > Math.max(...prev5.map(c => c.high)) && 
                        curr.high > Math.max(...next5.map(c => c.high));
    const isSwingLow = curr.low < Math.min(...prev5.map(c => c.low)) &&
                       curr.low < Math.min(...next5.map(c => c.low));
    
    if (isSwingHigh) {
      swings.push({ price: curr.high, type: 'high', idx: i });
    }
    if (isSwingLow) {
      swings.push({ price: curr.low, type: 'low', idx: i });
    }
  }
  
  // 比较相邻的高低点
  for (let i = 1; i < swings.length; i++) {
    const curr = swings[i];
    const prev = swings[i - 1];
    
    if (curr.type === 'high' && prev.type === 'high') {
      if (curr.price > prev.price) higherHighs++;
      else lowerHighs++;
    } else if (curr.type === 'low' && prev.type === 'low') {
      if (curr.price > prev.price) higherLows++;
      else lowerLows++;
    }
  }
  
  // 判断趋势
  let trend: 'uptrend' | 'downtrend' | 'ranging' = 'ranging';
  const upScore = higherHighs + higherLows;
  const downScore = lowerHighs + lowerLows;
  const totalSwings = upScore + downScore;
  
  if (totalSwings > 0) {
    if (upScore > downScore * 1.5) {
      trend = 'uptrend';
    } else if (downScore > upScore * 1.5) {
      trend = 'downtrend';
    }
  }
  
  // 计算趋势强度
  const strength = totalSwings > 0 ? Math.abs(upScore - downScore) / totalSwings * 100 : 0;
  
  return {
    trend,
    higherHighs,
    higherLows,
    lowerHighs,
    lowerLows,
    strength: Number(strength.toFixed(2))
  };
}

/**
 * 综合信号强度评分
 * 整合多个指标给出综合评分（0-100）
 */
export function calculateSignalStrength(indicators: {
  price: number;
  ema20: number;
  macd: number;
  rsi: number;
  bb?: { upper: number; middle: number; lower: number };
  adx?: number;
  volume: number;
  avgVolume: number;
}): {
  longStrength: number;   // 做多信号强度
  shortStrength: number;  // 做空信号强度
  trend: 'bullish' | 'bearish' | 'neutral';
} {
  let longScore = 0;
  let shortScore = 0;
  const maxScore = 100;
  
  // 1. EMA趋势（权重25分）
  if (indicators.price > indicators.ema20) {
    longScore += 25;
  } else {
    shortScore += 25;
  }
  
  // 2. MACD（权重20分）
  if (indicators.macd > 0) {
    longScore += 20;
  } else {
    shortScore += 20;
  }
  
  // 3. RSI（权重20分）
  if (indicators.rsi < 30) {
    longScore += 20;  // 超卖，看多
  } else if (indicators.rsi > 70) {
    shortScore += 20;  // 超买，看空
  } else if (indicators.rsi >= 50 && indicators.rsi <= 70) {
    longScore += 10;  // 中性偏多
  } else if (indicators.rsi > 30 && indicators.rsi < 50) {
    shortScore += 10;  // 中性偏空
  }
  
  // 4. 布林带（权重15分）
  if (indicators.bb) {
    if (indicators.price < indicators.bb.lower) {
      longScore += 15;  // 触及下轨，超卖
    } else if (indicators.price > indicators.bb.upper) {
      shortScore += 15;  // 触及上轨，超买
    } else if (indicators.price > indicators.bb.middle) {
      longScore += 7;
    } else {
      shortScore += 7;
    }
  }
  
  // 5. ADX趋势强度（权重10分）
  if (indicators.adx) {
    if (indicators.adx > 25) {
      // 强趋势，加强主导方向的分数
      if (longScore > shortScore) {
        longScore += 10;
      } else {
        shortScore += 10;
      }
    }
  }
  
  // 6. 成交量确认（权重10分）
  if (indicators.volume > indicators.avgVolume * 1.2) {
    // 放量，加强主导方向
    if (longScore > shortScore) {
      longScore += 10;
    } else {
      shortScore += 10;
    }
  }
  
  // 归一化到0-100
  const total = longScore + shortScore;
  const longStrength = total > 0 ? (longScore / maxScore) * 100 : 50;
  const shortStrength = total > 0 ? (shortScore / maxScore) * 100 : 50;
  
  // 判断趋势
  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (longStrength > 60) {
    trend = 'bullish';
  } else if (shortStrength > 60) {
    trend = 'bearish';
  }
  
  return {
    longStrength: Number(longStrength.toFixed(2)),
    shortStrength: Number(shortStrength.toFixed(2)),
    trend
  };
}

