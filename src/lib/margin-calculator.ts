/**
 * 保证金计算工具
 * 
 * 用于准确计算OKX交易所所需的保证金和手续费，避免因资金不足导致下单失败
 */

import { TRADING_FEES, MIN_CONTRACT_SIZE } from './constants';

/**
 * 交易费率配置（从 constants 导入）
 */
export { TRADING_FEES };

/**
 * 最小合约张数要求（从 constants 导入）
 */
export { MIN_CONTRACT_SIZE };

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
 * @param sizeUSDT 期望的名义价值（USDT金额，不是保证金！）
 * @param leverage 杠杆倍数
 * @returns 保证金计算结果
 * 
 * @example
 * ```typescript
 * // 期望名义价值500 USDT，5x杠杆
 * const calc = calculateMarginRequirement('XRP', 2.5306, 500, 5);
 * console.log(`名义价值: $${calc.notionalValue}`); // 500
 * console.log(`所需保证金: $${calc.requiredMargin}`); // 100
 * console.log(`合约张数: ${calc.contractSize}`); // 197.58
 * ```
 */
export function calculateMarginRequirement(
  symbol: string,
  entryPrice: number,
  sizeUSDT: number,
  leverage: number
): MarginCalculation {
  // 🔧 修复：sizeUSDT应该是名义价值，不是保证金！
  // 1. sizeUSDT直接就是名义价值
  const notionalValue = sizeUSDT;
  
  // 2. 计算合约张数
  // 公式: 合约张数 = 名义价值 / 价格
  const rawContractSize = notionalValue / entryPrice;
  
  // 3. OKX支持小数张数！保留8位小数精度（crypto标准）
  const contractSize = Math.round(rawContractSize * 100000000) / 100000000;
  
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
  
  // 9. 检查是否满足最小合约张数（允许任意小数）
  // OKX支持极小张数（如0.0001张），只要大于0即可
  const minSize = 0.0001; // 最小0.0001张（几乎任何金额都可以）
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
      message: `合约张数不足：计算得到 ${calculation.contractSize.toFixed(8)} 张，不满足最小要求（至少0.0001张）。请增加投入金额或提高杠杆倍数。`,
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
 * 当请求的名义价值对应的保证金超过可用资金时，自动调整为安全的最大名义价值
 * 
 * @param symbol 币种符号
 * @param entryPrice 入场价格
 * @param requestedUSDT 请求的名义价值（USDT）
 * @param leverage 杠杆倍数
 * @param availableUSDT 可用保证金（USDT）
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
    
    if (availableUSDT >= calculation.recommendedAmount && calculation.contractSize >= 0.0001) {
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
  
  if (bestCalculation && bestCalculation.contractSize >= 0.0001) {
    console.log(`[adjustOrderToAvailableFunds] 调整成功: ${requestedUSDT} → ${bestCalculation.actualUSDT.toFixed(2)} USDT`);
    return bestCalculation;
  }
  
  console.log(`[adjustOrderToAvailableFunds] 调整失败: 即使使用全部可用资金也无法满足最小合约张数要求（0.0001张）`);
  return null;
}

/**
 * 格式化保证金计算结果为人类可读的字符串
 */
export function formatMarginCalculation(calc: MarginCalculation, symbol: string, leverage?: number): string {
  const leverageInfo = leverage ? `杠杆: ${leverage}x\n` : '';
  return `
【保证金计算结果】
币种: ${symbol}
名义价值: $${calc.notionalValue.toFixed(2)} (输入)
${leverageInfo}合约张数: ${calc.contractSize} 张
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

