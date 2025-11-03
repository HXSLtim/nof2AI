/**
 * 系统常量配置
 * 
 * 集中管理所有常量，避免重复定义
 */

/**
 * 支持的币种列表
 */
export const SUPPORTED_COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE'] as const;

/**
 * 支持的交易对列表（OKX SWAP格式）
 */
export const SUPPORTED_INSTRUMENTS = SUPPORTED_COINS.map(coin => `${coin}-USDT-SWAP`);

/**
 * 币种类型
 */
export type SupportedCoin = typeof SUPPORTED_COINS[number];

/**
 * OKX合约乘数映射
 * ccxt的amount需要乘以此倍数才是实际张数
 * 
 * 规则：
 * - ccxt使用币的数量（如0.01 BTC, 0.1 ETH）
 * - OKX使用合约张数
 * - 乘数 = 1 / CONTRACT_VALUES = 1 / (1张合约的币数量)
 * 
 * ⚠️ 注意：此定义用于下单时的amount转换
 * 对于仓位数据，请使用CONTRACT_VALUES
 */
export const CONTRACT_MULTIPLIERS: Record<string, number> = {
  'BTC': 100,    // 1张 = 0.01 BTC → 乘数 = 1/0.01 = 100
  'ETH': 10,     // 1张 = 0.1 ETH → 乘数 = 1/0.1 = 10
  'SOL': 1,      // 1张 = 1 SOL → 乘数 = 1/1 = 1
  'BNB': 100,    // 1张 = 0.01 BNB → 乘数 = 1/0.01 = 100
  'XRP': 1,      // 1张 = 1 XRP → 乘数 = 1/1 = 1
  'DOGE': 0.001  // 1张 = 1000 DOGE → 乘数 = 1/1000 = 0.001
} as const;

/**
 * OKX合约面值（每张合约包含多少币）
 * 用于将OKX返回的pos字段（张数）转换为实际币数量
 * 
 * 🔧 重要：OKX API返回的pos字段 = 合约张数
 * 币数量 = pos × CONTRACT_VALUES[coin]
 * 名义价值 = 币数量 × 价格
 * 
 * 基于实际验证数据确定：
 * - BTC: 3张 → 0.03 BTC → $3,224 ✅
 * - ETH: 1张 → 0.1 ETH → $360 ✅
 * - SOL: 15张 → 15 SOL → $2,495 ✅
 * - BNB: 2485张 → 24.85 BNB → $24,700 ✅
 * - XRP: 37张 → 37 XRP → $89 ✅
 * - DOGE: 114张 → 114,000 DOGE → $19,000 ✅
 */
export const CONTRACT_VALUES: Record<string, number> = {
  'BTC': 0.01,    // 1张 = 0.01 BTC
  'ETH': 0.1,     // 1张 = 0.1 ETH
  'SOL': 1,       // 1张 = 1 SOL
  'BNB': 0.01,    // 1张 = 0.01 BNB
  'XRP': 1,       // 1张 = 1 XRP
  'DOGE': 1000    // 1张 = 1000 DOGE
} as const;

/**
 * 交易费率配置
 */
export const TRADING_FEES = {
  /** 开仓手续费率（Maker） */
  MAKER: 0.0002,  // 0.02%
  /** 开仓手续费率（Taker） */
  TAKER: 0.0005,  // 0.05%
  /** 平仓手续费率 */
  CLOSE: 0.0005,  // 0.05%
  /** 总手续费率（开仓+平仓） */
  TOTAL: 0.001,   // 0.1%
} as const;

/**
 * 最小合约张数要求
 */
export const MIN_CONTRACT_SIZE: Record<string, number> = {
  BTC: 1,
  ETH: 1,
  SOL: 1,
  BNB: 1,
  XRP: 1,
  DOGE: 1,
} as const;

/**
 * 缓存配置
 */
export const CACHE_CONFIG = {
  /** 数据缓存时间（毫秒） */
  DATA_TTL: 60 * 1000, // 1分钟
  /** 价格缓存时间（毫秒） */
  PRICE_TTL: 30 * 1000, // 30秒
} as const;

/**
 * 调度器配置
 */
export const SCHEDULER_CONFIG = {
  /** 账户权益采集间隔（毫秒） */
  EQUITY_INTERVAL: 60 * 1000, // 1分钟
  /** 数据采集间隔（毫秒） */
  DATA_COLLECTOR_INTERVAL: 3 * 60 * 1000, // 3分钟
  /** AI决策间隔（毫秒） */
  AI_DECISION_INTERVAL: 5 * 60 * 1000, // 5分钟
  /** 数据清理保留天数 */
  DATA_RETENTION_DAYS: 7,
} as const;

/**
 * API限制配置
 */
export const API_LIMITS = {
  /** 最大重试次数 */
  MAX_RETRIES: 3,
  /** 重试延迟基数（毫秒） */
  RETRY_DELAY_BASE: 1000,
} as const;

/**
 * 不同币种的最大单笔订单金额限制（USDT）
 */
export const MAX_ORDER_LIMITS: Record<string, number> = {
  'BTC': 2000,
  'ETH': 1500,
  'SOL': 800,
  'BNB': 800,
  'XRP': 500,
  'DOGE': 500,
} as const;

