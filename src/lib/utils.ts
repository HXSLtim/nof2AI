/**
 * 通用工具函数
 */

/**
 * 数字格式化工具
 */
export class NumberFormatter {
  /**
   * 格式化数字为固定小数位
   * @param n 数字
   * @param decimals 小数位数，默认6
   * @returns 格式化后的数字
   */
  static format(n: number, decimals = 6): number {
    return Number.isFinite(n) ? Number(n.toFixed(decimals)) : 0;
  }

  /**
   * 格式化数字为科学计数法
   * @param n 数字
   * @param decimals 小数位数，默认6
   * @returns 科学计数法字符串
   */
  static toExponential(n: number, decimals = 6): string {
    return Number.isFinite(n) ? n.toExponential(decimals) : '0';
  }

  /**
   * 格式化为货币（保留2位小数）
   * @param n 数字
   * @returns 货币字符串
   */
  static toCurrency(n: number): string {
    return Number.isFinite(n) ? `$${n.toFixed(2)}` : '$0.00';
  }

  /**
   * 格式化百分比
   * @param n 数字（0.1表示10%）
   * @param decimals 小数位数，默认2
   * @returns 百分比字符串
   */
  static toPercent(n: number, decimals = 2): string {
    if (!Number.isFinite(n)) return '0%';
    const percent = n * 100;
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(decimals)}%`;
  }
}

/**
 * 时间工具
 */
export class TimeUtils {
  /**
   * 将毫秒转换为可读时间间隔
   * @param ms 毫秒
   * @returns 可读字符串
   */
  static formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return `${seconds}秒前`;
  }

  /**
   * 格式化时间戳为日期时间字符串
   * @param ts 毫秒时间戳
   * @returns 格式化的日期时间字符串
   */
  static formatTimestamp(ts: number): string {
    const date = new Date(ts);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }
}

/**
 * 重试工具
 */
export class RetryUtils {
  /**
   * 带重试的异步函数执行
   * @param fn 要执行的函数
   * @param maxRetries 最大重试次数
   * @param delayMs 重试延迟（毫秒）
   * @param backoff 是否使用指数退避
   * @returns 函数执行结果
   */
  static async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    delayMs = 1000,
    backoff = true
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          const delay = backoff ? delayMs * attempt : delayMs;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Retry failed with no error');
  }
}

/**
 * 验证工具
 */
export class ValidationUtils {
  /**
   * 验证环境变量是否存在
   * @param keys 环境变量键列表
   * @returns 缺失的键列表
   */
  static checkEnvVars(keys: string[]): string[] {
    return keys.filter(key => !process.env[key]);
  }

  /**
   * 验证数字是否在范围内
   * @param value 值
   * @param min 最小值
   * @param max 最大值
   * @returns 是否在范围内
   */
  static isInRange(value: number, min: number, max: number): boolean {
    return Number.isFinite(value) && value >= min && value <= max;
  }

  /**
   * 验证币种是否支持
   * @param coin 币种符号
   * @returns 是否支持
   */
  static isSupportedCoin(coin: string): boolean {
    const { SUPPORTED_COINS } = require('./constants');
    return SUPPORTED_COINS.includes(coin.toUpperCase());
  }
}

/**
 * 错误处理工具
 */
export class ErrorUtils {
  /**
   * 安全地提取错误信息
   * @param error 错误对象
   * @returns 错误信息字符串
   */
  static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return String(error);
  }

  /**
   * 创建带上下文的错误
   * @param message 错误信息
   * @param context 上下文对象
   * @returns Error对象
   */
  static createError(message: string, context?: Record<string, unknown>): Error {
    const error = new Error(message);
    if (context) {
      Object.assign(error, { context });
    }
    return error;
  }
}

/**
 * 对象深度合并
 * @param target 目标对象
 * @param source 源对象
 * @returns 合并后的对象
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const output = { ...target };
  
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = output[key];
      
      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        output[key] = deepMerge(targetValue, sourceValue);
      } else {
        output[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }
  
  return output;
}

/**
 * 防抖函数
 * @param fn 要防抖的函数
 * @param delayMs 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function(this: any, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, delayMs);
  };
}

/**
 * 节流函数
 * @param fn 要节流的函数
 * @param delayMs 延迟时间（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return function(this: any, ...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastCall >= delayMs) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}

