/**
 * API响应缓存中间件
 * 为API路由提供统一的缓存功能
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse, type NextRequest } from 'next/server';
import { CacheService } from '@/services/CacheService';

/**
 * 缓存选项
 */
interface CacheOptions {
  ttl?: number; // 缓存时间（毫秒）
  keyGenerator?: (req: NextRequest) => string; // 自定义缓存键生成器
  shouldCache?: (response: any) => boolean; // 是否应该缓存响应
  tags?: string[]; // 缓存标签，用于批量失效
}

/**
 * API缓存类
 */
export class ApiCache {
  private cache: CacheService;

  constructor(defaultTTL: number = 30000) {
    this.cache = new CacheService({
      defaultTTL,
      maxSize: 500,
      enableStats: true,
    });
  }

  /**
   * 生成默认缓存键
   */
  private generateKey(req: NextRequest): string {
    const url = new URL(req.url);
    return `${req.method}:${url.pathname}${url.search}`;
  }

  /**
   * 包装API处理器，添加缓存功能
   */
  withCache<T = any>(
    handler: (req: NextRequest) => Promise<NextResponse<T>>,
    options: CacheOptions = {}
  ): (req: NextRequest) => Promise<NextResponse<T>> {
    return async (req: NextRequest) => {
      const cacheKey = options.keyGenerator ? options.keyGenerator(req) : this.generateKey(req);

      // 尝试从缓存获取
      const cached = this.cache.get<{ data: T; headers: Record<string, string> }>(cacheKey);

      if (cached) {
        // 返回缓存的响应
        return NextResponse.json(cached.data, {
          status: 200,
          headers: {
            ...cached.headers,
            'X-Cache': 'HIT',
            'X-Cache-Key': cacheKey,
          },
        });
      }

      // 调用原始处理器
      const response = await handler(req);

      // 检查是否应该缓存
      const shouldCache = options.shouldCache
        ? options.shouldCache(response)
        : response.ok && response.status === 200;

      if (shouldCache) {
        try {
          const data = await response.clone().json();

          // 缓存响应数据
          this.cache.set(
            cacheKey,
            {
              data,
              headers: {
                'Content-Type': 'application/json',
              },
            },
            options.ttl
          );

          // 添加缓存头部
          const headers = new Headers(response.headers);
          headers.set('X-Cache', 'MISS');
          headers.set('X-Cache-Key', cacheKey);

          return NextResponse.json(data, {
            status: response.status,
            headers,
          });
        } catch (error) {
          console.error('[ApiCache] 缓存响应失败:', error);
        }
      }

      return response;
    };
  }

  /**
   * 使缓存失效
   */
  invalidate(pattern?: string | RegExp): number {
    return this.cache.invalidate(pattern);
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    return this.cache.getStats();
  }
}

/**
 * 全局API缓存实例
 */
export const apiCache = new ApiCache(30000);

/**
 * 便捷函数：创建带缓存的API处理器
 */
export function withApiCache<T = any>(
  handler: (req: NextRequest) => Promise<NextResponse<T>>,
  options?: CacheOptions
): (req: NextRequest) => Promise<NextResponse<T>> {
  return apiCache.withCache(handler, options);
}

/**
 * 便捷函数：创建简单的JSON响应
 */
export function jsonResponse<T = any>(
  data: T,
  options?: {
    status?: number;
    headers?: Record<string, string>;
    cached?: boolean;
  }
): NextResponse<T> {
  const headers = new Headers(options?.headers || {});
  headers.set('Content-Type', 'application/json');

  if (options?.cached) {
    headers.set('X-Cache', 'HIT');
  }

  return NextResponse.json(data, {
    status: options?.status || 200,
    headers,
  });
}

/**
 * 便捷函数：创建错误响应
 */
export function errorResponse(
  message: string,
  status: number = 500,
  details?: any
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      details,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

