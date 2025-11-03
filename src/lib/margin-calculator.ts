/**
 * 保证金计算工具
 * 
 * 用于准确计算OKX交易所所需的保证金和手续费，避免因资金不足导致下单失败
 */

/**
 * 交易费率配置
 */
export const TRADING_FEES = {
  /** 开仓手续费率 */
  MAKER: 0.0002,  // 0.02%
  TAKER: 0.0005,  // 0.05%
  /** 平仓手续费率（通常与开仓相同）*/
  CLOSE: 0.0005,  // 0.05%
} as const;

/**
 * 最小合约张数要求
 */
export const MIN_CONTRACT_SIZE = {
  BTC: 1,
  ETH: 1,
  SOL: 1,
  BNB: 1,
  XRP: 1,
  DOGE: 1,
} as const;

/**
 * 保证金计算结果
 */
export interface MarginCalculation {
  /** 合约张数（支持小数，OKX允许）*/
  contractSize: number;
  /** 名义价值（合约价值 = 张数 × 价格）*/
  notionalValue: number;
  /** 所需保证金（名义价值 / 杠杆）*/
  requiredMargin: number;
  /** 开仓手续费 */
  openFee: number;
  /** 预留的平仓手续费 */
  closeFee: number;
  /** 总手续费（开仓 + 平仓）*/
  totalFees: number;
  /** 总资金需求（保证金 + 手续费）*/
  totalRequired: number;
  /** 安全缓冲（建议额外预留5%防止价格波动）*/
  safetyBuffer: number;
  /** 最终建议资金需求（包含安全缓冲）*/
  recommendedAmount: number;
  /** 实际使用的USDT金额（用于计算合约张数的基数）*/
  actualUSDT: number;
  /** 是否满足最小合约张数要求 */
  meetsMinimum: boolean;
}

/**
 * 计算开仓所需的保证金和手续费
 * 
 * @param symbol 币种符号（如 'BTC', 'ETH'）
 * @param entryPrice 入场价格
 * @param sizeUSDT 期望投入的USDT金额
 * @param leverage 杠杆倍数
 * @returns 保证金计算结果
 * 
 * @example
 * ```typescript
 * const calc = calculateMarginRequirement('XRP', 2.5306, 500, 5);
 * console.log(`需要 ${calc.recommendedAmount} USDT`);
 * console.log(`合约张数: ${calc.contractSize}`);
 * ```
 */
export function calculateMarginRequirement(
  symbol: string,
  entryPrice: number,
  sizeUSDT: number,
  leverage: number
): MarginCalculation {
  // 1. 计算可以买多少张合约
  // 公式: 合约张数 = (USDT金额 × 杠杆) / 价格
  const rawContractSize = (sizeUSDT * leverage) / entryPrice;
  
  // 2. OKX支持小数张数！保留8位小数精度（crypto标准）
  const contractSize = Math.round(rawContractSize * 100000000) / 100000000;
  
  // 3. 计算实际名义价值（合约价值）
  const notionalValue = contractSize * entryPrice;
  
  // 4. 计算所需保证金
  // 公式: 保证金 = 名义价值 / 杠杆
  const requiredMargin = notionalValue / leverage;
  
  // 5. 计算手续费
  // 开仓手续费 = 名义价值 × 手续费率
  const openFee = notionalValue * TRADING_FEES.TAKER;
  
  // 平仓手续费预留（即使是市价单，也按最坏情况计算）
  const closeFee = notionalValue * TRADING_FEES.CLOSE;
  
  // 总手续费
  const totalFees = openFee + closeFee;
  
  // 6. 总资金需求
  const totalRequired = requiredMargin + totalFees;
  
  // 7. 安全缓冲（建议额外预留5%防止价格小幅波动）
  const safetyBuffer = totalRequired * 0.05;
  
  // 8. 最终建议金额
  const recommendedAmount = totalRequired + safetyBuffer;
  
  // 9. 检查是否满足最小合约张数（0.01张对于某些币种可能够了）
  const minSize = 0.01; // OKX最小0.01张（大多数合约）
  const meetsMinimum = contractSize >= minSize;
  
  return {
    contractSize,
    notionalValue,
    requiredMargin,
    openFee,
    closeFee,
    totalFees,
    totalRequired,
    safetyBuffer,
    recommendedAmount,
    actualUSDT: requiredMargin, // 实际使用的USDT就是保证金
    meetsMinimum,
  };
}

/**
 * 验证是否有足够的可用资金
 * 
 * @param availableUSDT 账户可用USDT金额
 * @param calculation 保证金计算结果
 * @returns 验证结果和详细信息
 */
export function validateSufficientMargin(
  availableUSDT: number,
  calculation: MarginCalculation
): {
  isValid: boolean;
  message: string;
  details: {
    available: number;
    required: number;
    shortage?: number;
  };
} {
  const required = calculation.recommendedAmount;
  const isValid = availableUSDT >= required;
  
  if (!isValid) {
    const shortage = required - availableUSDT;
    return {
      isValid: false,
      message: `资金不足：需要 $${required.toFixed(2)} USDT（包含手续费和安全缓冲），但仅有 $${availableUSDT.toFixed(2)} USDT，缺少 $${shortage.toFixed(2)} USDT`,
      details: {
        available: availableUSDT,
        required,
        shortage,
      },
    };
  }
  
  if (!calculation.meetsMinimum) {
    return {
      isValid: false,
      message: `合约张数不足：计算得到 ${calculation.contractSize.toFixed(8)} 张，不满足最小要求（至少0.01张）。请增加投入金额或提高杠杆倍数。`,
      details: {
        available: availableUSDT,
        required,
      },
    };
  }
  
  return {
    isValid: true,
    message: `资金充足：可用 $${availableUSDT.toFixed(2)} USDT，需要 $${required.toFixed(2)} USDT`,
    details: {
      available: availableUSDT,
      required,
    },
  };
}

/**
 * 根据可用资金智能调整订单大小
 * 
 * 当请求的USDT金额超过可用资金时，自动调整为安全的最大金额
 * 
 * @param symbol 币种符号
 * @param entryPrice 入场价格
 * @param requestedUSDT 请求的USDT金额
 * @param leverage 杠杆倍数
 * @param availableUSDT 可用USDT金额
 * @returns 调整后的计算结果，如果无法满足则返回null
 */
export function adjustOrderToAvailableFunds(
  symbol: string,
  entryPrice: number,
  requestedUSDT: number,
  leverage: number,
  availableUSDT: number
): MarginCalculation | null {
  // 先尝试原始金额
  let calculation = calculateMarginRequirement(symbol, entryPrice, requestedUSDT, leverage);
  
  // 如果资金充足，直接返回
  if (availableUSDT >= calculation.recommendedAmount) {
    return calculation;
  }
  
  console.log(`[adjustOrderToAvailableFunds] 请求金额 $${requestedUSDT} 超过可用资金，尝试调整...`);
  
  // 二分查找最优金额
  let low = 0;
  let high = requestedUSDT;
  let bestCalculation: MarginCalculation | null = null;
  
  // 最多迭代20次
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    calculation = calculateMarginRequirement(symbol, entryPrice, mid, leverage);
    
    if (availableUSDT >= calculation.recommendedAmount && calculation.contractSize >= 0.01) {
      // 找到可行解，尝试找更大的
      bestCalculation = calculation;
      low = mid;
    } else {
      // 金额太大，减小
      high = mid;
    }
    
    // 收敛条件
    if (high - low < 0.01) {
      break;
    }
  }
  
  if (bestCalculation && bestCalculation.contractSize >= 0.01) {
    console.log(`[adjustOrderToAvailableFunds] 调整成功: ${requestedUSDT} → ${bestCalculation.actualUSDT.toFixed(2)} USDT`);
    return bestCalculation;
  }
  
  console.log(`[adjustOrderToAvailableFunds] 调整失败: 即使使用全部可用资金也无法满足最小合约张数要求（0.01张）`);
  return null;
}

/**
 * 格式化保证金计算结果为人类可读的字符串
 */
export function formatMarginCalculation(calc: MarginCalculation, symbol: string): string {
  return `
【保证金计算结果】
币种: ${symbol}
合约张数: ${calc.contractSize} 张
名义价值: $${calc.notionalValue.toFixed(2)}
所需保证金: $${calc.requiredMargin.toFixed(2)}
开仓手续费: $${calc.openFee.toFixed(4)}
平仓手续费(预留): $${calc.closeFee.toFixed(4)}
总手续费: $${calc.totalFees.toFixed(4)}
安全缓冲(5%): $${calc.safetyBuffer.toFixed(4)}
--------------------------------
最低需要: $${calc.totalRequired.toFixed(2)} USDT
建议准备: $${calc.recommendedAmount.toFixed(2)} USDT (含缓冲)
  `.trim();
}

