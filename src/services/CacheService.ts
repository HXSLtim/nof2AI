/**
 * 缓存服务
 * 提供统一的内存缓存管理，支持TTL和模式匹配失效
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 缓存项接口
 */
interface CacheItem<T = any> {
  data: T;
  timestamp: number;
  expiry: number;
}

/**
 * 缓存配置接口
 */
interface CacheConfig {
  defaultTTL?: number; // 默认过期时间（毫秒）
  maxSize?: number; // 最大缓存条目数
  enableStats?: boolean; // 是否启用统计
}

/**
 * 缓存统计信息
 */
interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  size: number;
  hitRate: number;
}

/**
 * 缓存服务实现
 */
export class CacheService {
  private cache = new Map<string, CacheItem>();
  private config: Required<CacheConfig>;
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
  };

  constructor(config: CacheConfig = {}) {
    this.config = {
      defaultTTL: config.defaultTTL || 30000, // 默认30秒
      maxSize: config.maxSize || 100,
      enableStats: config.enableStats !== false,
    };
  }

  /**
   * 获取缓存数据
   */
  get<T = any>(key: string): T | null {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (!cached) {
      if (this.config.enableStats) this.stats.misses++;
      return null;
    }

    // 检查是否过期
    if (now > cached.expiry) {
      this.cache.delete(key);
      if (this.config.enableStats) this.stats.misses++;
      return null;
    }

    if (this.config.enableStats) this.stats.hits++;
    return cached.data;
  }

  /**
   * 设置缓存数据
   */
  set<T = any>(key: string, data: T, ttl?: number): void {
    const now = Date.now();
    const expiryTime = ttl || this.config.defaultTTL;

    // 检查缓存大小限制
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      // 删除最旧的条目
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: now,
      expiry: now + expiryTime,
    });

    if (this.config.enableStats) this.stats.sets++;
  }

  /**
   * 获取或设置缓存（如果不存在则调用回调函数）
   */
  async getOrSet<T = any>(
    key: string,
    callback: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await callback();
    this.set(key, data, ttl);
    return data;
  }

  /**
   * 检查缓存是否存在且有效
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * 删除指定缓存
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 使缓存失效（支持模式匹配）
   */
  invalidate(pattern?: string | RegExp): number {
    let count = 0;

    if (!pattern) {
      count = this.cache.size;
      this.cache.clear();
      return count;
    }

    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    for (const [key] of this.cache.entries()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
    if (this.config.enableStats) {
      this.stats.hits = 0;
      this.stats.misses = 0;
      this.stats.sets = 0;
    }
  }

  /**
   * 清理过期的缓存条目
   */
  cleanup(): number {
    const now = Date.now();
    let count = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * 驱逐最旧的缓存条目
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, item] of this.cache.entries()) {
      if (item.timestamp < oldestTime) {
        oldestTime = item.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      size: this.cache.size,
      hitRate: Math.round(hitRate * 10000) / 100, // 百分比
    };
  }

  /**
   * 获取所有缓存键
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }
}

import { getCacheTTL, CACHE_SIZE } from '@/lib/cache-config';

/**
 * 全局缓存实例
 */
export const globalCache = new CacheService({
  defaultTTL: getCacheTTL('API_DEFAULT'),
  maxSize: CACHE_SIZE.GLOBAL,
  enableStats: true,
});

/**
 * 专用缓存实例（使用统一配置）
 */
export const pricesCache = new CacheService({
  defaultTTL: getCacheTTL('PRICES'),
  maxSize: CACHE_SIZE.PRICES,
  enableStats: true,
});

export const indicatorsCache = new CacheService({
  defaultTTL: getCacheTTL('INDICATORS'),
  maxSize: CACHE_SIZE.INDICATORS,
  enableStats: true,
});

export const positionsCache = new CacheService({
  defaultTTL: getCacheTTL('POSITIONS'),
  maxSize: CACHE_SIZE.POSITIONS,
  enableStats: true,
});

export const decisionsCache = new CacheService({
  defaultTTL: getCacheTTL('DECISIONS'),
  maxSize: CACHE_SIZE.DECISIONS,
  enableStats: true,
});

