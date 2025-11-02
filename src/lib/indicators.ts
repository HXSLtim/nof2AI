/**
 * 指标计算工具集
 * @description 提供 EMA、MACD、RSI、ATR 等常用技术指标的纯函数实现，便于在服务端或前端复用。
 */

/** 蜡烛图基本结构 */
export type Candle = {
  /** 最高价 */ high: number;
  /** 最低价 */ low: number;
  /** 收盘价 */ close: number;
};

/**
 * 计算简单移动平均（SMA）
 * @param values 数值序列
 * @param period 周期长度
 * @returns 每个位置的 SMA，前期不足周期时返回首值近似
 * @remarks 作为 EMA 的初始化种子使用。
 */
export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i < period - 1) {
      out.push(values[i]);
    } else {
      out.push(sum / period);
    }
  }
  return out;
}

/**
 * 计算指数移动平均（EMA）
 * @param values 数值序列
 * @param period 周期长度
 * @returns EMA 序列，长度与输入一致
 * @remarks 使用 SMA(period) 作为首个有效 EMA 的初始化种子，随后采用 α=2/(n+1) 的递推。
 */
export function ema(values: number[], period: number): number[] {
  if (period <= 1) return values.slice();
  const k = 2 / (period + 1);
  const out = new Array<number>(values.length);
  const seedSMA = sma(values, period);
  // 第一个有效 EMA 用 seedSMA 的第 (period-1) 位
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      out[i] = values[i];
    } else if (i < period - 1) {
      // 前期不足周期，用线性近似
      out[i] = (out[i - 1] * (1 - k)) + (values[i] * k);
    } else if (i === period - 1) {
      out[i] = seedSMA[i];
    } else {
      out[i] = (out[i - 1] * (1 - k)) + (values[i] * k);
    }
  }
  return out;
}

/**
 * 计算 MACD 直方图（MACD 线与信号线差值）
 * @param values 收盘或中位价序列
 * @param fast 快线 EMA 周期，默认 12
 * @param slow 慢线 EMA 周期，默认 26
 * @param signal 信号线 EMA 周期，默认 9
 * @returns MACD 直方图序列（macdLine - signalLine）
 */
export function macd(values: number[], fast = 12, slow = 26, signal = 9): number[] {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const hist = macdLine.map((v, i) => v - signalLine[i]);
  return hist;
}

/**
 * 计算 RSI（Wilder 算法）
 * @param values 收盘或中位价序列
 * @param period 周期长度（如 7、14）
 * @returns RSI 序列（0-100），长度与输入一致
 */
export function rsi(values: number[], period = 14): number[] {
  const out: number[] = new Array(values.length);
  let avgGain = 0;
  let avgLoss = 0;

  // 初始化：前 period 区间的平均涨跌幅
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) avgGain += change; else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;

  // 前 period-1 位置用近似
  for (let i = 0; i < period; i++) out[i] = 50;

  // Wilder 平滑递推
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
  }

  // 对前 period+1 处的首个有效 RSI 赋值
  if (values.length > period) {
    const rs0 = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs0);
  }

  // 对不足长度位置做安全填充
  for (let i = 0; i < values.length; i++) {
    if (Number.isNaN(out[i])) out[i] = 50;
  }
  return out;
}

/**
 * 计算 TR（True Range）
 */
function trueRange(curr: Candle, prevClose?: number): number {
  const hl = curr.high - curr.low;
  if (prevClose === undefined) return Math.abs(hl);
  return Math.max(hl, Math.abs(curr.high - prevClose), Math.abs(curr.low - prevClose));
}

/**
 * 计算 ATR（Wilder 算法）
 * @param candles 蜡烛序列（必须包含 high/low/close）
 * @param period 周期长度（如 14）
 * @returns ATR 序列，长度与输入一致
 */
export function atr(candles: Candle[], period = 14): number[] {
  const trs: number[] = new Array(candles.length);
  for (let i = 0; i < candles.length; i++) {
    const prevClose = i > 0 ? candles[i - 1].close : undefined;
    trs[i] = trueRange(candles[i], prevClose);
  }

  // 初始化平均 TR
  let atr0 = 0;
  for (let i = 0; i < period && i < trs.length; i++) atr0 += trs[i];
  atr0 = atr0 / Math.max(1, Math.min(period, trs.length));

  const out: number[] = new Array(trs.length);
  for (let i = 0; i < trs.length; i++) {
    if (i < period) {
      out[i] = atr0; // 前期近似
    } else {
      // Wilder 平滑：ATR_t = (ATR_{t-1} * (n-1) + TR_t) / n
      out[i] = (out[i - 1] * (period - 1) + trs[i]) / period;
    }
  }
  return out;
}

/**
 * 计算中位价（high/low 的中点）序列
 * @param candles 蜡烛序列
 * @returns (high+low)/2 的数组
 */
export function midPrices(candles: Candle[]): number[] {
  return candles.map((c) => (c.high + c.low) / 2);
}