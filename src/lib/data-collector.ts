/**
 * 市场数据采集和指标计算模块
 * 
 * 功能：
 * 1. 从 OKX 获取K线数据
 * 2. 计算技术指标（EMA、MACD、RSI、ATR）
 * 3. 获取资金费率和持仓量
 * 4. 存入数据库供AI决策使用
 */

import { fetchCandles, fetchFundingRate, fetchOpenInterest, fetchTickers } from './okx';
import { ema, macd, rsi, atr, midPrices } from './indicators';
import { 
  insertPriceSnapshot, 
  insertIndicators3m, 
  insertIndicators4h, 
  insertFundingRate, 
  insertOpenInterest 
} from './db';
import { SUPPORTED_INSTRUMENTS } from './constants';

/**
 * 支持的交易对列表（从 constants 导入）
 */
export { SUPPORTED_INSTRUMENTS };

/**
 * 采集单个币种的数据并计算指标
 */
export async function collectDataForInstrument(instId: string): Promise<void> {
  const now = Date.now();
  
  try {
    // 1. 获取最新价格
    const tickers = await fetchTickers([instId]);
    const currentPrice = tickers[instId];
    if (currentPrice) {
      insertPriceSnapshot(now, instId, currentPrice);
      console.log(`[DataCollector] ${instId} 价格: ${currentPrice}`);
    }

    // 2. 获取3分钟K线并计算指标
    const candles3m = await fetchCandles(instId, '3m', 120);
    if (candles3m.length >= 20) {
      const mids = midPrices(candles3m);
      const ema20_3m = ema(mids, 20);
      const macdHist_3m = macd(mids, 12, 26, 9);
      const rsi7_3m = rsi(mids, 7);
      const rsi14_3m = rsi(mids, 14);

      // 存储最新的指标值
      const lastIdx = mids.length - 1;
      insertIndicators3m(now, instId, {
        ema20: ema20_3m[lastIdx],
        macd: macdHist_3m[lastIdx],
        rsi7: rsi7_3m[lastIdx],
        rsi14: rsi14_3m[lastIdx]
      });

      console.log(`[DataCollector] ${instId} 3m指标已计算`);
    }

    // 3. 获取4小时K线并计算指标
    const candles4h = await fetchCandles(instId, '4H', 60);
    if (candles4h.length >= 50) {
      const mids4h = midPrices(candles4h);
      const ema20_4h = ema(mids4h, 20);
      const ema50_4h = ema(mids4h, 50);
      const atr3_4h = atr(candles4h, 3);
      const atr14_4h = atr(candles4h, 14);
      const macdHist_4h = macd(mids4h, 12, 26, 9);
      const rsi14_4h = rsi(mids4h, 14);
      const volumes = candles4h.map(c => c.vol);

      // 存储最新的指标值
      const lastIdx = mids4h.length - 1;
      insertIndicators4h(now, instId, {
        ema20: ema20_4h[lastIdx],
        ema50: ema50_4h[lastIdx],
        atr3: atr3_4h[lastIdx],
        atr14: atr14_4h[lastIdx],
        macd: macdHist_4h[lastIdx],
        rsi14: rsi14_4h[lastIdx],
        volume: volumes[lastIdx]
      });

      console.log(`[DataCollector] ${instId} 4h指标已计算`);
    }

    // 4. 获取资金费率
    const fundingRate = await fetchFundingRate(instId);
    if (fundingRate !== 0) {
      insertFundingRate(now, instId, fundingRate);
      console.log(`[DataCollector] ${instId} 资金费率: ${fundingRate.toExponential(4)}`);
    }

    // 5. 获取持仓量
    const openInterest = await fetchOpenInterest(instId);
    if (openInterest !== 0) {
      insertOpenInterest(now, instId, openInterest);
      console.log(`[DataCollector] ${instId} 持仓量: ${openInterest}`);
    }

  } catch (error) {
    console.error(`[DataCollector] ${instId} 采集失败:`, error);
  }
}

/**
 * 采集所有支持币种的数据
 */
export async function collectAllData(): Promise<void> {
  console.log('[DataCollector] 开始数据采集...');
  const startTime = Date.now();

  // 并行采集所有币种的数据
  await Promise.allSettled(
    SUPPORTED_INSTRUMENTS.map(inst => collectDataForInstrument(inst))
  );

  const elapsed = Date.now() - startTime;
  console.log(`[DataCollector] 数据采集完成，耗时: ${elapsed}ms`);
}

/**
 * 清理旧数据（保留最近N天）
 */
export function cleanupOldData(daysToKeep = 7): void {
  const cutoff = Date.now() - daysToKeep * 24 * 3600 * 1000;
  const { getDb } = require('./db');
  const db = getDb();
  
  db.exec(`
    DELETE FROM price_snapshots WHERE ts < ${cutoff};
    DELETE FROM indicators_3m WHERE ts < ${cutoff};
    DELETE FROM indicators_4h WHERE ts < ${cutoff};
    DELETE FROM funding_rates WHERE ts < ${cutoff};
    DELETE FROM open_interest WHERE ts < ${cutoff};
    DELETE FROM decisions WHERE ts < ${cutoff};
  `);
  
  console.log(`[DataCollector] 已清理 ${daysToKeep} 天前的旧数据（包括决策记录）`);
}

