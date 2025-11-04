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
 * OKX合约面值（每张合约包含多少币）
 * 
 * 🔧 核心定义：统一用于下单和显示
 * 
 * 下单逻辑：
 * - 想下X张合约 → 需要的币数量 = X × CONTRACT_VALUES[coin]
 * - ccxt amount = 币数量
 * 
 * 显示逻辑：
 * - OKX返回pos张数 → 币数量 = pos × CONTRACT_VALUES[coin]
 * - 名义价值 = 币数量 × 价格
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
  'XRP': 100,     // 1张 = 100 XRP ✅ 修复！
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
 * 不同币种的最大单笔订单金额限制（USDT保证金）
 * 
 * ⚠️ 这些是保守的安全限制，避免触发OKX的51202错误
 * OKX对市价单有最大金额限制，具体值取决于市场流动性
 */
export const MAX_ORDER_LIMITS: Record<string, number> = {
  'BTC': 1000,   // 降低到$1000避免超限
  'ETH': 800,    // 降低到$800
  'SOL': 500,    // 降低到$500
  'BNB': 500,    // 降低到$500
  'XRP': 300,    // 降低到$300（XRP流动性较低）
  'DOGE': 300,   // 降低到$300（DOGE流动性较低）
} as const;

/**
 * 每个币种开1张合约的最小资金要求（5x杠杆，含手续费和缓冲）
 * 
 * 计算公式：(价格 / 杠杆) × 1.15
 * 
 * ⚠️ 注意：这些值会随市场价格波动，仅供参考
 * 实际交易时会动态计算
 * 
 * 用途：
 * 1. AI决策前过滤资金不足的币种
 * 2. 给用户明确的资金要求提示
 * 3. 优化资金分配策略
 */
export const MIN_FUNDS_PER_COIN_5X: Record<string, number> = {
  'BTC': 24000,   // BTC ~$104k → 1张约需$24k
  'ETH': 850,     // ETH ~$3.7k → 1张约需$850
  'SOL': 45,      // SOL ~$180 → 1张约需$45
  'BNB': 150,     // BNB ~$620 → 1张约需$150
  'XRP': 1,       // XRP ~$0.65 → 1张约需$1
  'DOGE': 30,     // DOGE 1张=1000个 ~$120 → 需$30
} as const;

/**
 * 根据实际价格动态计算开1张合约需要的最小资金
 * 
 * @param symbol 币种符号
 * @param currentPrice 当前价格
 * @param leverage 杠杆倍数（默认5x）
 * @returns 最小所需资金（USDT）
 */
export function calculateMinFundsForOneContract(
  symbol: string,
  currentPrice: number,
  leverage: number = 5
): number {
  // 1张合约的名义价值
  const oneContractNotional = 1 * currentPrice;
  
  // 所需保证金
  const margin = oneContractNotional / leverage;
  
  // 手续费（开仓+平仓）
  const fees = oneContractNotional * (TRADING_FEES.TAKER + TRADING_FEES.CLOSE);
  
  // 安全缓冲（15%）
  const buffer = (margin + fees) * 0.15;
  
  // 总需求
  const total = margin + fees + buffer;
  
  return total;
}

/**
 * 根据可用资金过滤可交易的币种
 * 
 * @param coins 候选币种列表
 * @param availableCash 可用资金
 * @param prices 当前价格字典
 * @param leverage 杠杆倍数
 * @returns 资金充足的币种列表
 */
export function filterTradableCoins(
  coins: string[],
  availableCash: number,
  prices: Record<string, number>,
  leverage: number = 5
): { tradable: string[]; skipped: { coin: string; required: number; shortage: number }[] } {
  const tradable: string[] = [];
  const skipped: { coin: string; required: number; shortage: number }[] = [];
  
  for (const coin of coins) {
    const priceKey = `${coin}-USDT-SWAP`;
    const price = prices[priceKey];
    
    if (!price) {
      console.warn(`[filterTradableCoins] ⚠️ ${coin} 价格未知，跳过`);
      continue;
    }
    
    const minRequired = calculateMinFundsForOneContract(coin, price, leverage);
    
    if (availableCash >= minRequired) {
      tradable.push(coin);
    } else {
      skipped.push({
        coin,
        required: minRequired,
        shortage: minRequired - availableCash
      });
    }
  }
  
  return { tradable, skipped };
}

