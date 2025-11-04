/**
 * 技术指标缓存服务
 * 提供技术指标计算结果的缓存和批量计算优化
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { CacheService } from './CacheService';

/**
 * 技术指标类型（简化版）
 */
export type TechnicalIndicators = any;

/**
 * 市场数据接口
 */
export interface MarketData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 指标计算请求
 */
export interface IndicatorRequest {
  symbol: string;
  timeframe: string;
  data: MarketData[];
  indicators?: string[]; // 需要计算的指标列表
}

/**
 * 批量指标结果
 */
export interface BatchIndicatorResult {
  symbol: string;
  timeframe: string;
  indicators: TechnicalIndicators;
  cached: boolean;
  calculationTime: number;
}

/**
 * 指标缓存服务
 */
export class IndicatorCacheService {
  private cache: CacheService;
  private calculationQueue = new Map<string, Promise<TechnicalIndicators>>();
  private stats = {
    hits: 0,
    misses: 0,
    calculations: 0,
    totalTime: 0,
  };

  constructor(cacheTTL: number = 300000) {
    // 默认5分钟缓存
    this.cache = new CacheService({
      defaultTTL: cacheTTL,
      maxSize: 100,
      enableStats: true,
    });
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(symbol: string, timeframe: string, dataLength: number): string {
    return `indicators:${symbol}:${timeframe}:${dataLength}`;
  }

  /**
   * 获取或计算技术指标
   */
  async getIndicators(
    symbol: string,
    timeframe: string,
    data: MarketData[]
  ): Promise<TechnicalIndicators> {
    const cacheKey = this.generateCacheKey(symbol, timeframe, data.length);

    // 尝试从缓存获取
    const cached = this.cache.get<TechnicalIndicators>(cacheKey);
    if (cached) {
      this.stats.hits++;
      return cached;
    }

    this.stats.misses++;

    // 检查是否已经在计算中（避免重复计算）
    const pendingCalculation = this.calculationQueue.get(cacheKey);
    if (pendingCalculation) {
      return pendingCalculation;
    }

    // 开始新的计算
    const calculationPromise = this.calculateAndCache(symbol, timeframe, data, cacheKey);
    this.calculationQueue.set(cacheKey, calculationPromise);

    try {
      const result = await calculationPromise;
      return result;
    } finally {
      this.calculationQueue.delete(cacheKey);
    }
  }

  /**
   * 计算并缓存指标
   */
  private async calculateAndCache(
    symbol: string,
    timeframe: string,
    data: MarketData[],
    cacheKey: string
  ): Promise<TechnicalIndicators> {
    const startTime = Date.now();

    try {
      // 使用现有的指标计算函数
      const indicators = await this.calculateIndicatorsAsync(data);

      const calculationTime = Date.now() - startTime;
      this.stats.calculations++;
      this.stats.totalTime += calculationTime;

      // 缓存结果
      this.cache.set(cacheKey, indicators);

      console.log(
        `[IndicatorCache] 计算完成 ${symbol}-${timeframe}: ${calculationTime}ms`
      );

      return indicators;
    } catch (error) {
      console.error(`[IndicatorCache] 计算失败 ${symbol}-${timeframe}:`, error);
      throw error;
    }
  }

  /**
   * 异步计算技术指标（包装同步函数）
   */
  private async calculateIndicatorsAsync(data: MarketData[]): Promise<TechnicalIndicators> {
    // 在下一个事件循环中执行，避免阻塞
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          const closePrices = data.map((d) => d.close);
          // 简化：返回原始数据
          const indicators = { closePrices };
          resolve(indicators);
        } catch (error) {
          console.error('[IndicatorCache] 计算失败:', error);
          resolve({});
        }
      }, 0);
    });
  }

  /**
   * 批量计算指标
   */
  async calculateBatch(requests: IndicatorRequest[]): Promise<BatchIndicatorResult[]> {
    const startTime = Date.now();

    const results = await Promise.allSettled(
      requests.map(async (req) => {
        const reqStartTime = Date.now();
        const cacheKey = this.generateCacheKey(req.symbol, req.timeframe, req.data.length);
        const cached = this.cache.has(cacheKey);

        const indicators = await this.getIndicators(req.symbol, req.timeframe, req.data);

        return {
          symbol: req.symbol,
          timeframe: req.timeframe,
          indicators,
          cached,
          calculationTime: Date.now() - reqStartTime,
        };
      })
    );

    const successfulResults = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<BatchIndicatorResult>).value);

    const totalTime = Date.now() - startTime;
    console.log(
      `[IndicatorCache] 批量计算完成: ${successfulResults.length}/${requests.length} (${totalTime}ms)`
    );

    return successfulResults;
  }

  /**
   * 预计算热门指标
   */
  async precomputeIndicators(
    symbols: string[],
    timeframes: string[],
    dataProvider: (symbol: string, timeframe: string) => Promise<MarketData[]>
  ): Promise<void> {
    console.log(
      `[IndicatorCache] 开始预计算: ${symbols.length} symbols × ${timeframes.length} timeframes`
    );

    const requests: IndicatorRequest[] = [];

    for (const symbol of symbols) {
      for (const timeframe of timeframes) {
        try {
          const data = await dataProvider(symbol, timeframe);
          requests.push({ symbol, timeframe, data });
        } catch (error) {
          console.warn(`[IndicatorCache] 获取数据失败 ${symbol}-${timeframe}:`, error);
        }
      }
    }

    await this.calculateBatch(requests);
  }

  /**
   * 使指定交易对的缓存失效
   */
  invalidateSymbol(symbol: string): number {
    return this.cache.invalidate(`indicators:${symbol}:`);
  }

  /**
   * 使指定时间周期的缓存失效
   */
  invalidateTimeframe(timeframe: string): number {
    return this.cache.invalidate(`indicators:.*:${timeframe}:`);
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.calculationQueue.clear();
  }

  /**
   * 清理过期缓存
   */
  cleanup(): number {
    return this.cache.cleanup();
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    const cacheStats = this.cache.getStats();
    const avgCalculationTime =
      this.stats.calculations > 0 ? this.stats.totalTime / this.stats.calculations : 0;

    return {
      cache: cacheStats,
      calculations: {
        total: this.stats.calculations,
        averageTime: Math.round(avgCalculationTime),
        totalTime: this.stats.totalTime,
      },
      queue: {
        pending: this.calculationQueue.size,
      },
    };
  }
}

/**
 * 全局指标缓存实例
 */
export const indicatorCache = new IndicatorCacheService(300000); // 5分钟缓存

/**
 * 便捷函数：获取缓存的指标
 */
export async function getCachedIndicators(
  symbol: string,
  timeframe: string,
  data: MarketData[]
): Promise<TechnicalIndicators> {
  return indicatorCache.getIndicators(symbol, timeframe, data);
}

/**
 * 便捷函数：批量获取指标
 */
export async function getBatchIndicators(
  requests: IndicatorRequest[]
): Promise<BatchIndicatorResult[]> {
  return indicatorCache.calculateBatch(requests);
}

