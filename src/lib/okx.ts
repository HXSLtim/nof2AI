/**
 * OKX API客户端（使用okx-api SDK重构）
 * 
 * 使用专业的okx-api替代ccxt，获得更好的类型支持和性能
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { RestClient } from 'okx-api';
import { CONTRACT_VALUES } from './constants';

/**
 * 环境判断
 */
const isSandbox = process.env.OKX_SANDBOX === 'true';

/**
 * 验证API密钥
 */
if (!process.env.OKX_API_KEY || !process.env.OKX_SECRET || !process.env.OKX_PASSWORD) {
  console.warn('[OKX-API] ⚠️ 未检测到OKX API密钥，请设置环境变量：OKX_API_KEY, OKX_SECRET, OKX_PASSWORD');
}

/**
 * 初始化OKX REST客户端
 * 
 * ⚠️ 重要：OKX模拟盘（Demo Trading）通过 demoTrading 参数配置
 * 
 * 配置说明：
 * - OKX_SANDBOX=true → 模拟盘（Demo Trading），使用虚拟资金
 * - OKX_SANDBOX=false或不设置 → 生产环境（实盘），使用真实资金
 * 
 * okx-api SDK会根据demoTrading参数自动：
 * - 使用正确的API端点
 * - 添加必要的请求头
 * - 处理环境隔离
 */
export const okxClient = new RestClient({
  apiKey: process.env.OKX_API_KEY || '',
  apiSecret: process.env.OKX_SECRET || '',
  apiPass: process.env.OKX_PASSWORD || '',
  // 🔧 模拟盘模式配置
  demoTrading: isSandbox,
});

console.log(`[OKX-API] ========================================`);
console.log(`[OKX-API] 初始化OKX API客户端`);
console.log(`[OKX-API] 环境: ${isSandbox ? '🧪 模拟盘（Demo Trading）' : '💰 实盘（Production）'}`);
console.log(`[OKX-API] API Key: ${process.env.OKX_API_KEY ? process.env.OKX_API_KEY.substring(0, 8) + '...' : '❌ 未设置'}`);
console.log(`[OKX-API] API Secret: ${process.env.OKX_SECRET ? '✅ 已设置' : '❌ 未设置'}`);
console.log(`[OKX-API] API Password: ${process.env.OKX_PASSWORD ? '✅ 已设置' : '❌ 未设置'}`);
console.log(`[OKX-API] Demo Trading: ${isSandbox ? '✅ 已启用' : '❌ 未启用'}`);
if (isSandbox) {
  console.log(`[OKX-API] ⚠️ 模拟盘模式：使用虚拟资金，无真实交易风险`);
  console.log(`[OKX-API] 💡 请确保API Key是从OKX Demo Trading后台获取的`);
} else {
  console.log(`[OKX-API] ⚠️ 实盘模式：使用真实资金，请谨慎操作`);
}
console.log(`[OKX-API] ========================================`);
/**
 * 获取账户余额
 */
export async function fetchAccountBalance() {
  try {
    console.log('[fetchAccountBalance] 开始获取账户余额...');
    const balances = await okxClient.getBalance();
    
    console.log('[fetchAccountBalance] OKX响应:', JSON.stringify(balances).substring(0, 200));
    
    // OKX返回格式：{ code: '0', msg: '', data: [...] }
    // okx-api会自动解析，直接返回data数组
    
    if (!Array.isArray(balances) || balances.length === 0) {
      console.warn('[fetchAccountBalance] ⚠️ 余额数组为空，返回默认值');
      return { totalEq: 0, availBal: 0 };
    }
    
    const account = balances[0];
    const result = {
      totalEq: Number(account.totalEq || 0),
      availBal: Number(account.details?.[0]?.availBal || 0)
    };
    
    console.log('[fetchAccountBalance] ✅ 成功获取余额:', result);
    return result;
  } catch (error: any) {
    console.error('[fetchAccountBalance] ❌ Error:', {
      message: error?.message,
      code: error?.code,
      name: error?.name,
      stack: error?.stack?.substring(0, 300)
    });
    
    // 返回默认值而不是抛出错误，避免中断AI决策流程
    console.warn('[fetchAccountBalance] ⚠️ 使用默认余额值');
    return { totalEq: 0, availBal: 0 };
  }
}

/**
 * 获取账户总资产
 */
export async function fetchAccountTotal(): Promise<number> {
  const balance = await fetchAccountBalance();
  return balance.totalEq;
}

/**
 * 获取可用USDT
 */
export async function fetchAvailableUSDT(): Promise<number> {
  try {
    const balances = await okxClient.getBalance({ ccy: 'USDT' });
    
    if (!Array.isArray(balances) || balances.length === 0) {
      return 0;
    }
    
    // 查找USDT余额
    const account = balances[0];
    const usdtDetail = account.details?.find((d: any) => d.ccy === 'USDT');
    
    return Number(usdtDetail?.availBal || 0);
  } catch (error) {
    console.error('[fetchAvailableUSDT] Error:', error);
    return 0;
  }
}

/**
 * 获取当前仓位（仅SWAP）
 */
export async function fetchPositions() {
  try {
    const positions = await okxClient.getPositions({ instType: 'SWAP' });
    
    if (!Array.isArray(positions)) {
      return [];
    }
    
    // 🚀 动态获取合约信息
    let instrumentsMap: Map<string, any> = new Map();
    try {
      const { instrumentCache } = await import('./okx-instruments');
      const instIds = positions
        .filter((p: any) => p && p.instId)
        .map((p: any) => p.instId);
      
      if (instIds.length > 0) {
        instrumentsMap = await instrumentCache.getMultiple(instIds);
      }
    } catch (e) {
      console.log('[fetchPositions] ⚠️ 无法获取动态合约信息，使用默认值');
    }
    
    // 过滤掉空仓位并格式化
    return positions
      .filter((p: any) => p && p.instId && Number(p.pos || 0) !== 0)
      .map((p: any) => {
        const coin = String(p.instId).split('-')[0] || '';
        const posInContracts = Number(p.pos) || 0;
        const mark = Number(p.markPx || p.last || p.avgPx || 0);
        
        // 🚀 优先使用动态获取的ctVal
        const instrumentInfo = instrumentsMap.get(p.instId);
        const contractValue = instrumentInfo 
          ? Number(instrumentInfo.ctVal) 
          : (CONTRACT_VALUES[coin] || 1);
        
        const coinsAmount = Math.abs(posInContracts) * contractValue;
        const notionalValue = coinsAmount * mark;
        
        // 判断方向
        let side: 'long' | 'short';
        if (p.posSide === 'long' || p.posSide === 'short') {
          side = p.posSide;
        } else {
          side = posInContracts >= 0 ? 'long' : 'short';
        }
        
        console.log(`[fetchPositions] ${coin} 仓位:`, {
          pos_张数: p.pos,
          ctVal: contractValue,
          币数量: coinsAmount.toFixed(6),
          markPx: mark,
          名义价值_USDT: notionalValue.toFixed(2)
        });
        
        return {
          symbol: p.instId,
          side,
          leverage: Number(p.lever) || 0,
          mgnMode: (p.mgnMode === 'isolated' ? 'isolated' : 'cross') as 'cross' | 'isolated',
          liquidationPrice: Number(p.liqPx) || 0,
          contracts: Math.abs(posInContracts),
          notional: notionalValue,
          unrealizedPnl: Number(p.upl) || 0,
          entryPrice: Number(p.avgPx) || 0,
          markPrice: mark,
          coin: coin
        };
      });
  } catch (error) {
    console.error('[fetchPositions] Error:', error);
    throw error;
  }
}

/**
 * 下单
 * 
 * @param symbol 交易对，如'BTC/USDT:USDT'
 * @param side 'buy' | 'sell'
 * @param type 'market' | 'limit'
 * @param amount 合约张数
 * @param price 限价单价格
 * @param posSide 仓位方向
 * @param reduceOnly 是否只减仓
 * @param tdMode 保证金模式
 */
export async function placeOrder(
  symbol: string,
  side: 'buy' | 'sell',
  type: 'market' | 'limit',
  amount: number,
  price?: number,
  posSide?: 'long' | 'short',
  reduceOnly?: boolean,
  tdMode: 'cross' | 'isolated' = 'cross'
) {
  try {
    const coin = symbol.split('/')[0];
    const instId = `${coin}-USDT-SWAP`;
    
    // 🔧 动态获取合约信息（ctVal, lotSz, minSz）
    let contractValue = CONTRACT_VALUES[coin] || 1;  // 默认值
    let lotSize = 0.01;
    let minSz = 0.01;
    
    try {
      const { getContractValue, getLotSize, getMinOrderSize } = await import('./okx-instruments');
      const [dynamicCtVal, dynamicLotSize, dynamicMinSz] = await Promise.all([
        getContractValue(instId),
        getLotSize(instId),
        getMinOrderSize(instId)
      ]);
      
      if (dynamicCtVal > 0) contractValue = dynamicCtVal;
      if (dynamicLotSize > 0) lotSize = dynamicLotSize;
      if (dynamicMinSz > 0) minSz = dynamicMinSz;
      
      console.log(`[placeOrder] 📏 动态获取: ctVal=${contractValue}, lotSz=${lotSize}, minSz=${minSz}`);
    } catch (e) {
      console.log(`[placeOrder] ⚠️ 使用默认值: ctVal=${contractValue}, lotSz=${lotSize}`);
    }
    
    const coinsAmount = amount * contractValue;
    
    console.log(`\n[placeOrder] ========== ${reduceOnly ? '平仓' : '开仓'}请求 ==========`);
    console.log(`[placeOrder] 币种: ${coin}`);
    console.log(`[placeOrder] 方向: ${side}`);
    console.log(`[placeOrder] 类型: ${type}`);
    console.log(`[placeOrder] 合约张数: ${amount}张`);
    console.log(`[placeOrder] 每张包含: ${contractValue} ${coin}`);
    console.log(`[placeOrder] 币数量: ${coinsAmount} ${coin}`);
    
    // 构建订单参数
    // ⚠️ 合约张数必须是lotSize的整数倍（如0.01的整数倍）
    const roundedAmount = Math.floor(amount / lotSize) * lotSize;
    
    if (roundedAmount < minSz) {
      throw new Error(`合约张数不足最小值${minSz}张（计算值: ${amount.toFixed(4)}张）`);
    }
    
    // 🔧 修复浮点数精度问题：toFixed(2)然后转回数字
    const preciseAmount = Number(roundedAmount.toFixed(2));
    
    console.log(`[placeOrder] 📐 张数: ${amount.toFixed(4)} → ${preciseAmount} (lotSize=${lotSize})`);
    
    const orderParams: any = {
      instId,
      tdMode,
      side,
      ordType: type,
      sz: String(preciseAmount),  // ✅ 精确到2位小数，避免浮点数误差
    };
    
    // 添加价格（限价单）
    if (type === 'limit' && price) {
      orderParams.px = String(price);
    }
    
    // 添加仓位方向
    if (posSide) {
      orderParams.posSide = posSide;
    }
    
    console.log(`[placeOrder] 订单参数:`, orderParams);
    
    // 提交订单
    const result = await okxClient.submitOrder(orderParams);
    
    // okx-api返回的是数组
    if (!Array.isArray(result) || result.length === 0) {
      throw new Error('订单提交失败：未返回订单信息');
    }
    
    const order = result[0] as any;
    
    // 检查是否有错误
    if (order.sCode && order.sCode !== '0') {
      throw new Error(`OKX错误: ${order.sMsg} (code: ${order.sCode})`);
    }
    
    console.log(`[placeOrder] ✅ 订单成功，订单ID: ${order.ordId}`);
    
    return {
      id: order.ordId,
      status: 'ok',
      filled: Number((order as any).fillSz || 0),
      average: Number((order as any).fillPx || (order as any).avgPx || 0),
      actualContracts: roundedAmount  // 实际下单的合约张数
    };
    
  } catch (error) {
    console.error('[placeOrder] Error:', error);
    throw error;
  }
}

/**
 * 🚀 根据USDT保证金智能计算合约张数并下单
 * 
 * 模拟OKX客户端体验：输入保证金和杠杆，自动计算合约张数
 * 
 * 计算逻辑：
 * 1. 名义价值 = 保证金 × 杠杆
 * 2. 合约张数 = 名义价值 / 当前价格
 * 3. 取整为整数（OKX要求）
 * 
 * @param symbol 交易对（如 'BTC/USDT:USDT'）
 * @param side 买卖方向
 * @param usdtMargin 投入的USDT保证金
 * @param leverage 杠杆倍数
 * @param currentPrice 当前价格
 * @param posSide 仓位方向
 * @param tdMode 保证金模式
 */
export async function placeOrderByUSDT(
  symbol: string,
  side: 'buy' | 'sell',
  usdtMargin: number,
  leverage: number,
  currentPrice: number,
  posSide?: 'long' | 'short',
  tdMode: 'cross' | 'isolated' = 'cross'
) {
  const coin = symbol.split('/')[0];
  const instId = `${coin}-USDT-SWAP`;
  
  console.log(`\n[placeOrderByUSDT] ========== 智能开仓 ==========`);
  console.log(`[placeOrderByUSDT] 币种: ${coin}`);
  console.log(`[placeOrderByUSDT] 💰 保证金: $${usdtMargin.toFixed(2)}`);
  console.log(`[placeOrderByUSDT] 📊 杠杆: ${leverage}x`);
  console.log(`[placeOrderByUSDT] 💵 单币价格: $${currentPrice.toFixed(4)}/个`);
  
  // 🔧 获取合约面值（每张包含多少币）
  let ctVal = CONTRACT_VALUES[coin] || 1;
  try {
    const { getContractValue } = await import('./okx-instruments');
    const dynamicCtVal = await getContractValue(instId);
    if (dynamicCtVal > 0) {
      ctVal = dynamicCtVal;
    }
  } catch (e) {
    console.log(`[placeOrderByUSDT] ⚠️ 使用默认ctVal=${ctVal}`);
  }
  
  // 计算每张合约的USDT价值
  const pricePerContract = currentPrice * ctVal;
  
  console.log(`[placeOrderByUSDT] 📏 合约规格: 1张 = ${ctVal} ${coin}`);
  console.log(`[placeOrderByUSDT] 💵 每张价值: $${pricePerContract.toFixed(2)}`);
  
  // 计算名义价值和合约张数
  const notional = usdtMargin * leverage;
  const rawContracts = notional / pricePerContract;  // ✅ 使用每张合约的价值
  
  // 📏 lotSz=0.01，向下取整到0.01的倍数，最小0.01张
  const contracts = Math.max(0.01, Math.floor(rawContracts * 100) / 100);
  
  console.log(`[placeOrderByUSDT] 📊 计算结果:`);
  console.log(`  - 名义价值: $${notional.toFixed(2)}`);
  console.log(`  - 理论张数: ${rawContracts.toFixed(4)}`);
  console.log(`  - 实际下单: ${contracts}张 (0.01倍数)`);
  console.log(`  - 实际名义: ${contracts}张 × $${pricePerContract.toFixed(2)} = $${(contracts * pricePerContract).toFixed(2)}`);
  
  // 直接调用原placeOrder函数
  return await placeOrder(
    symbol,
    side,
    'market',
    contracts,
    undefined,
    posSide,
    false,
    tdMode
  );
}

/**
 * 设置杠杆
 */
export async function setLeverage(
  instId: string,
  leverage: number,
  mgnMode: 'cross' | 'isolated' = 'cross',
  posSide?: 'long' | 'short'
) {
  try {
    const params: any = {
      instId,
      lever: String(leverage),
      mgnMode
    };
    
    if (posSide) {
      params.posSide = posSide;
    }
    
    const result = await okxClient.setLeverage(params);
    
    console.log(`[setLeverage] ✅ 杠杆已设置: ${leverage}x`);
    return result;
    
  } catch (error) {
    console.warn('[setLeverage] 设置杠杆失败（可能已是正确杠杆）:', error);
    return null;
  }
}

/**
 * 设置止盈止损
 */
export async function placeTPSL(
  instId: string,
  posSide: 'long' | 'short',
  size: number,
  takeProfit?: number,
  stopLoss?: number,
  tdMode: 'cross' | 'isolated' = 'cross'
): Promise<any[]> {
  const orders: any[] = [];
  
  try {
    // 🔧 修复精度：确保是0.01的精确倍数
    const preciseSize = Number(size.toFixed(2));
    
    // 止盈单
    if (takeProfit) {
      const tpParams: any = {
          instId,
        tdMode,
        side: (posSide === 'long' ? 'sell' : 'buy') as 'buy' | 'sell',
          posSide,
        ordType: 'conditional' as any,
        sz: String(preciseSize),  // ✅ 精确到2位小数
        tpTriggerPx: String(takeProfit),
        tpOrdPx: String(takeProfit)
      };
      
      const tpResult: any = await okxClient.placeAlgoOrder(tpParams as any);
      if (Array.isArray(tpResult) && tpResult.length > 0) {
        orders.push({ type: 'take_profit', price: takeProfit, ...tpResult[0] });
      }
    }
    
    // 止损单
    if (stopLoss) {
      const slParams: any = {
          instId,
        tdMode,
        side: (posSide === 'long' ? 'sell' : 'buy') as 'buy' | 'sell',
          posSide,
        ordType: 'conditional' as any,
        sz: String(preciseSize),  // ✅ 精确到2位小数
        slTriggerPx: String(stopLoss),
        slOrdPx: String(stopLoss)
      };
      
      const slResult: any = await okxClient.placeAlgoOrder(slParams as any);
      if (Array.isArray(slResult) && slResult.length > 0) {
        orders.push({ type: 'stop_loss', price: stopLoss, ...slResult[0] });
      }
    }
    
    console.log(`[placeTPSL] ✅ 止盈止损已设置，共${orders.length}个订单`);
    return orders;
    
  } catch (error) {
    console.error('[placeTPSL] Error:', error);
    throw error;
  }
}

/**
 * 获取账户配置
 */
export async function fetchAccountConfig() {
  try {
    const config = await okxClient.getAccountConfiguration();
    
    if (!Array.isArray(config) || config.length === 0) {
      return { posMode: 'net_mode', raw: {} };
    }
    
    const accountConfig = config[0];
    
    return {
      posMode: accountConfig.posMode || 'net_mode',
      raw: accountConfig
    };
  } catch (error) {
    console.error('[fetchAccountConfig] Error:', error);
    return { posMode: 'net_mode', raw: {} };
  }
}

/**
 * 批量获取最新价格
 */
export async function fetchTickers(instIds: string[]): Promise<Record<string, number>> {
  try {
    // 获取所有SWAP的ticker
    const tickers = await okxClient.getTickers({ instType: 'SWAP' });
    
    const result: Record<string, number> = {};
    
    if (Array.isArray(tickers)) {
      tickers.forEach((ticker: any) => {
        if (ticker.instId && instIds.includes(ticker.instId)) {
          result[ticker.instId] = Number(ticker.last || ticker.askPx || 0);
        }
      });
    }
    
    return result;
  } catch (error) {
    console.error('[fetchTickers] Error:', error);
    return {};
  }
}

/**
 * 获取K线数据
 */
export async function fetchCandles(
  instId: string,
  bar: string,
  limit = 120
): Promise<Array<{ ts: number; open: number; high: number; low: number; close: number; vol: number }>> {
  try {
    const candles = await okxClient.getCandles({
      instId,
      bar,
      limit: String(limit)
    });
    
    if (!Array.isArray(candles)) {
      return [];
    }
    
    // OKX返回的是倒序（最新在前），需要反转
    // 格式：[ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm]
    return candles
      .reverse()
      .map((c: any) => ({
        ts: Number(c[0]),
        open: Number(c[1]),
        high: Number(c[2]),
        low: Number(c[3]),
        close: Number(c[4]),
        vol: Number(c[5])
      }));
  } catch (error) {
    console.error('[fetchCandles] Error:', error);
    return [];
  }
}

/**
 * 获取资金费率
 */
export async function fetchFundingRate(instId: string): Promise<number> {
  try {
    const result = await okxClient.getFundingRate({ instId });
    
    if (!Array.isArray(result) || result.length === 0) {
      return 0;
    }
    
    return Number(result[0].fundingRate || 0);
  } catch (error) {
    console.error('[fetchFundingRate] Error:', error);
    return 0;
  }
}

/**
 * 获取持仓量
 */
export async function fetchOpenInterest(instId: string): Promise<number> {
  try {
    const result = await okxClient.getOpenInterest({ instId });
    
    if (!Array.isArray(result) || result.length === 0) {
      return 0;
    }
    
    return Number(result[0].oi || 0);
  } catch (error) {
    console.error('[fetchOpenInterest] Error:', error);
    return 0;
  }
}

/**
 * 获取历史仓位（已关闭的）
 */
export async function fetchClosedPnL(limit = 100): Promise<Array<{
  instId: string;
  coin: string;
  pnl: number;
  closeTime: number;
  direction: 'long' | 'short';
  closeAvgPx: number;
  openAvgPx: number;
}>> {
  try {
    const history = await okxClient.getPositionsHistory({
      instType: 'SWAP',
      limit: String(limit)
    });
    
    if (!Array.isArray(history)) {
      return [];
    }
    
    return history
      .filter((item: any) => Number(item.realizedPnl || item.pnl || 0) !== 0)
      .map((item: any) => {
        const instId = item.instId || '';
        const coin = instId.split('-')[0] || '';
        const pnl = Number(item.realizedPnl || item.pnl || 0);
        const closeTime = Number(item.uTime || item.cTime || Date.now());
        const direction = (item.posSide === 'short' || Number(item.pos || 0) < 0) ? 'short' : 'long';
        const closeAvgPx = Number(item.closeAvgPx || item.avgPx || 0);
        const openAvgPx = Number(item.openAvgPx || 0);
        
        return {
          instId,
          coin,
          pnl,
          closeTime,
          direction,
          closeAvgPx,
          openAvgPx
        };
      });
  } catch (error) {
    console.error('[fetchClosedPnL] Error:', error);
    return [];
  }
}

/**
 * 获取订单历史
 */
export async function fetchOrderHistory(instId?: string, limit = 100): Promise<any[]> {
  try {
    const params: any = {
      instType: 'SWAP',
      limit: String(limit)
    };
    
    if (instId) {
      params.instId = instId;
    }
    
    const orders = await okxClient.getOrderHistoryArchive(params);
    return Array.isArray(orders) ? orders : [];
  } catch (error) {
    console.error('[fetchOrderHistory] Error:', error);
    return [];
  }
}

/**
 * 获取成交历史
 */
export async function fetchFillsHistory(instId?: string, limit = 100): Promise<any[]> {
  try {
    const params: any = {
      instType: 'SWAP',
      limit: String(limit)
    };
    
    if (instId) {
      params.instId = instId;
    }
    
    const fills = await okxClient.getFillsHistory(params);
    return Array.isArray(fills) ? fills : [];
  } catch (error) {
    console.error('[fetchFillsHistory] Error:', error);
    return [];
  }
}

