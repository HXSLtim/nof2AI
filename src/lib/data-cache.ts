/**
 * 数据缓存模块
 * 
 * 避免重复请求，提高数据复用性
 */

import { queryPrices, queryIndicators3m, queryLatestFundingRate, queryLatestOpenInterest } from './db';
import { fetchCandles, fetchTickers, fetchFundingRate, fetchOpenInterest } from './okx';
import { ema, macd, rsi, atr, midPrices } from './indicators';

/**
 * 缓存的市场数据
 */
interface CachedMarketData {
  prices: Record<string, number>;
  candles3m: Record<string, any[]>;
  candles4h: Record<string, any[]>;
  indicators3m: Record<string, any>;
  indicators4h: Record<string, any>;
  fundingRates: Record<string, number>;
  openInterest: Record<string, { latest: number; average: number }>;
  timestamp: number;
}

let cachedData: CachedMarketData | null = null;
const CACHE_TTL = 60 * 1000; // 缓存1分钟

/**
 * 获取市场数据（优先使用缓存）
 */
export async function getMarketData(instIds: string[], forceRefresh = false): Promise<CachedMarketData> {
  const now = Date.now();
  
  // 如果缓存有效且不强制刷新，返回缓存
  if (!forceRefresh && cachedData && (now - cachedData.timestamp) < CACHE_TTL) {
    console.log('[DataCache] 使用缓存数据，缓存时长:', Math.floor((now - cachedData.timestamp) / 1000), '秒');
    return cachedData;
  }
  
  console.log('[DataCache] 刷新市场数据...');
  
  // 并行获取所有数据
  const results = await Promise.allSettled(
    instIds.map(async (instId) => {
      const coin = instId.split('-')[0];
      
      // 1. 价格 - 优先从数据库
      let price = 0;
      const dbPrices = queryPrices(instId, now - 5 * 60 * 1000, 1); // 最近5分钟
      if (dbPrices.length > 0) {
        price = dbPrices[dbPrices.length - 1].price;
      } else {
        // 数据库没有，实时获取
        const tickers = await fetchTickers([instId]);
        price = tickers[instId] || 0;
      }
      
      // 2. K线数据 - 实时获取（因为需要完整序列）
      const candles3m = await fetchCandles(instId, '3m', 120);
      const candles4h = await fetchCandles(instId, '4H', 60);
      
      // 3. 计算指标
      const mids3m = midPrices(candles3m);
      const ema20_3m = ema(mids3m, 20);
      const macdHist_3m = macd(mids3m, 12, 26, 9);
      const rsi7_3m = rsi(mids3m, 7);
      const rsi14_3m = rsi(mids3m, 14);
      
      const mids4h = midPrices(candles4h);
      const ema20_4h = ema(mids4h, 20);
      const ema50_4h = ema(mids4h, 50);
      const atr3_4h = atr(candles4h, 3);
      const atr14_4h = atr(candles4h, 14);
      const macdHist_4h = macd(mids4h, 12, 26, 9);
      const rsi14_4h = rsi(mids4h, 14);
      const vol4h = candles4h.map(c => c.vol);
      
      // 4. 资金费率 - 优先从数据库
      let fundingRate = queryLatestFundingRate(instId) ?? 0;
      if (fundingRate === 0) {
        fundingRate = await fetchFundingRate(instId);
      }
      
      // 5. 持仓量 - 优先从数据库
      let oiData = queryLatestOpenInterest(instId);
      if (!oiData) {
        const oi = await fetchOpenInterest(instId);
        oiData = { latest: oi, average: oi };
      }
      
      return {
        instId,
        coin,
        price,
        candles3m,
        candles4h,
        indicators3m: {
          ema20: ema20_3m,
          macd: macdHist_3m,
          rsi7: rsi7_3m,
          rsi14: rsi14_3m,
          mids: mids3m
        },
        indicators4h: {
          ema20: ema20_4h,
          ema50: ema50_4h,
          atr3: atr3_4h,
          atr14: atr14_4h,
          macd: macdHist_4h,
          rsi14: rsi14_4h,
          vol: vol4h,
          mids: mids4h
        },
        fundingRate,
        openInterest: oiData
      };
    })
  );
  
  // 整合结果
  const data: CachedMarketData = {
    prices: {},
    candles3m: {},
    candles4h: {},
    indicators3m: {},
    indicators4h: {},
    fundingRates: {},
    openInterest: {},
    timestamp: now
  };
  
  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      const d = result.value;
      data.prices[d.instId] = d.price;
      data.candles3m[d.instId] = d.candles3m;
      data.candles4h[d.instId] = d.candles4h;
      data.indicators3m[d.instId] = d.indicators3m;
      data.indicators4h[d.instId] = d.indicators4h;
      data.fundingRates[d.instId] = d.fundingRate;
      data.openInterest[d.instId] = d.openInterest;
    }
  });
  
  // 更新缓存
  cachedData = data;
  console.log('[DataCache] 数据已刷新，缓存时间:', new Date(now).toLocaleString());
  
  return data;
}

/**
 * 清除缓存（用于强制刷新）
 */
export function clearCache() {
  cachedData = null;
  console.log('[DataCache] 缓存已清除');
}

