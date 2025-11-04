/**
 * 统一缓存TTL配置
 * 
 * 集中管理所有缓存的过期时间配置，便于统一调整和维护
 */

/**
 * 缓存TTL配置（秒）
 */
export const CACHE_TTL = {
  /**
   * 实时数据缓存（秒）
   * 这些数据变化频繁，需要较短的缓存时间
   */
  PRICES: 3, // 价格数据 - 3秒
  POSITIONS: 5, // 仓位数据 - 5秒
  ACCOUNT: 3, // 账户数据 - 3秒
  DECISIONS: 10, // 决策数据 - 10秒

  /**
   * 计算密集型数据缓存（分钟）
   * 这些数据计算成本高，可以缓存更长时间
   */
  INDICATORS: 5, // 技术指标 - 5分钟
  ADVANCED_INDICATORS: 10, // 高级指标 - 10分钟
  MARKET_DATA: 1, // 市场数据 - 1分钟

  /**
   * 历史数据缓存（小时）
   * 历史数据不会变化，可以长时间缓存
   */
  HISTORICAL_EQUITY: 1, // 历史权益 - 1小时
  HISTORICAL_PRICES: 24, // 历史价格 - 24小时
  HISTORICAL_TRADES: 6, // 历史交易 - 6小时

  /**
   * API响应缓存（秒）
   * API路由的默认缓存时间
   */
  API_DEFAULT: 30, // API默认缓存 - 30秒
  API_CRITICAL: 5, // 关键API - 5秒
  API_STATIC: 300, // 静态数据API - 5分钟
} as const;

/**
 * 缓存刷新间隔配置（秒）
 * 用于定时刷新机制
 */
export const REFRESH_INTERVAL = {
  PRICES: 3, // 价格刷新间隔
  POSITIONS: 5, // 仓位刷新间隔
  ACCOUNT: 3, // 账户刷新间隔
  DECISIONS: 10, // 决策刷新间隔
  EQUITY_HISTORY: 60, // 权益历史刷新间隔 - 1分钟
} as const;

/**
 * WebSocket Fallback配置
 * WebSocket断开时的降级刷新间隔
 */
export const WS_FALLBACK_MULTIPLIER = {
  PRICES: 3, // 价格: 3秒 × 3 = 9秒
  POSITIONS: 3, // 仓位: 5秒 × 3 = 15秒
  ACCOUNT: 3, // 账户: 3秒 × 3 = 9秒
} as const;

/**
 * 缓存大小限制
 */
export const CACHE_SIZE = {
  PRICES: 50, // 价格缓存最大条目
  POSITIONS: 20, // 仓位缓存最大条目
  DECISIONS: 30, // 决策缓存最大条目
  INDICATORS: 100, // 指标缓存最大条目
  GLOBAL: 200, // 全局缓存最大条目
  API: 500, // API缓存最大条目
} as const;

/**
 * 辅助函数：秒转毫秒
 */
export function toMs(seconds: number): number {
  return seconds * 1000;
}

/**
 * 辅助函数：分钟转毫秒
 */
export function minutesToMs(minutes: number): number {
  return minutes * 60 * 1000;
}

/**
 * 辅助函数：小时转毫秒
 */
export function hoursToMs(hours: number): number {
  return hours * 60 * 60 * 1000;
}

/**
 * 获取缓存TTL（毫秒）
 */
export function getCacheTTL(type: keyof typeof CACHE_TTL): number {
  const value = CACHE_TTL[type];

  // 根据类型自动转换
  if (
    type === 'INDICATORS' ||
    type === 'ADVANCED_INDICATORS' ||
    type === 'MARKET_DATA'
  ) {
    return minutesToMs(value);
  }

  if (
    type === 'HISTORICAL_EQUITY' ||
    type === 'HISTORICAL_PRICES' ||
    type === 'HISTORICAL_TRADES'
  ) {
    return hoursToMs(value);
  }

  // 默认为秒
  return toMs(value);
}

/**
 * 获取刷新间隔（毫秒）
 */
export function getRefreshInterval(type: keyof typeof REFRESH_INTERVAL): number {
  return toMs(REFRESH_INTERVAL[type]);
}

/**
 * 获取WebSocket fallback间隔（毫秒）
 */
export function getWSFallbackInterval(type: keyof typeof WS_FALLBACK_MULTIPLIER): number {
  const baseInterval = REFRESH_INTERVAL[type];
  const multiplier = WS_FALLBACK_MULTIPLIER[type];
  return toMs(baseInterval * multiplier);
}

/**
 * 缓存配置预设
 */
export const CACHE_PRESETS = {
  /**
   * 实时数据预设
   */
  REALTIME: {
    ttl: toMs(CACHE_TTL.PRICES),
    size: CACHE_SIZE.PRICES,
  },

  /**
   * 计算密集型预设
   */
  COMPUTE_INTENSIVE: {
    ttl: minutesToMs(CACHE_TTL.INDICATORS),
    size: CACHE_SIZE.INDICATORS,
  },

  /**
   * 历史数据预设
   */
  HISTORICAL: {
    ttl: hoursToMs(CACHE_TTL.HISTORICAL_EQUITY),
    size: CACHE_SIZE.GLOBAL,
  },

  /**
   * API响应预设
   */
  API_RESPONSE: {
    ttl: toMs(CACHE_TTL.API_DEFAULT),
    size: CACHE_SIZE.API,
  },
} as const;

/**
 * 导出完整配置对象（供调试和监控使用）
 */
export const CACHE_CONFIG = {
  TTL: CACHE_TTL,
  REFRESH_INTERVAL,
  WS_FALLBACK_MULTIPLIER,
  SIZE: CACHE_SIZE,
  PRESETS: CACHE_PRESETS,
} as const;

/**
 * 打印缓存配置（用于调试）
 */
export function printCacheConfig(): void {
  console.log('📊 缓存配置:');
  console.log('═'.repeat(50));

  console.log('\n⏱️  TTL配置:');
  console.log(`  价格数据: ${CACHE_TTL.PRICES}秒`);
  console.log(`  仓位数据: ${CACHE_TTL.POSITIONS}秒`);
  console.log(`  账户数据: ${CACHE_TTL.ACCOUNT}秒`);
  console.log(`  决策数据: ${CACHE_TTL.DECISIONS}秒`);
  console.log(`  技术指标: ${CACHE_TTL.INDICATORS}分钟`);

  console.log('\n🔄 刷新间隔:');
  console.log(`  价格: ${REFRESH_INTERVAL.PRICES}秒`);
  console.log(`  仓位: ${REFRESH_INTERVAL.POSITIONS}秒`);
  console.log(`  账户: ${REFRESH_INTERVAL.ACCOUNT}秒`);
  console.log(`  决策: ${REFRESH_INTERVAL.DECISIONS}秒`);

  console.log('\n📦 缓存大小限制:');
  console.log(`  价格: ${CACHE_SIZE.PRICES}条`);
  console.log(`  仓位: ${CACHE_SIZE.POSITIONS}条`);
  console.log(`  决策: ${CACHE_SIZE.DECISIONS}条`);
  console.log(`  指标: ${CACHE_SIZE.INDICATORS}条`);
  console.log(`  全局: ${CACHE_SIZE.GLOBAL}条`);

  console.log('\n' + '═'.repeat(50));
}

