import ccxt from 'ccxt';

/**
 * OKX 环境配置说明
 * 
 * CCXT 通过 sandbox 参数自动切换环境：
 * - sandbox: false (默认) → 生产环境 (https://www.okx.com)
 * - sandbox: true → 沙盒环境 (https://www.okx.com，通过 header 区分)
 * 
 * ⚠️ 重要：API Key 必须与环境匹配！
 * - 生产环境 API Key → OKX_SANDBOX=false 或不设置
 * - 沙盒环境 API Key → OKX_SANDBOX=true
 * 
 * 错误 50101 "APIKey does not match current environment" 表示环境不匹配。
 * 
 * 环境变量配置：
 * - OKX_API_KEY: API 密钥
 * - OKX_SECRET: API Secret
 * - OKX_PASSWORD: API 密码短语
 * - OKX_SANDBOX: 'true' 启用沙盒，其他值或不设置为生产环境
 */

// 检查环境配置
const isSandbox = process.env.OKX_SANDBOX === 'true';
const hasCredentials = Boolean(
  process.env.OKX_API_KEY && 
  process.env.OKX_SECRET && 
  process.env.OKX_PASSWORD
);

if (!hasCredentials) {
  console.warn('[OKX] ⚠️ 缺少 API 凭证，请在 .env.local 中配置：OKX_API_KEY, OKX_SECRET, OKX_PASSWORD');
}

console.log(`[OKX] 初始化交易所客户端：${isSandbox ? '🧪 沙盒环境' : '🏭 生产环境'}`);

/**
 * 初始化 OKX 交易所客户端
 */
export const okx = new ccxt.okx({
  apiKey: process.env.OKX_API_KEY || '',
  secret: process.env.OKX_SECRET || '',
  password: process.env.OKX_PASSWORD || '',
  // CCXT 自动处理沙盒环境，无需手动设置 URL
  sandbox: isSandbox,
  options: {
    /**
     * 默认交易类型：'swap' 用于永续合约
     * @remarks 可选值：'spot', 'margin', 'swap', 'future', 'option'
     */
    defaultType: 'swap',
    /**
     * 可选：如需手动指定 API URL（高级用户）
     * CCXT 已自动处理，通常不需要配置
     */
    // urls: {
    //   api: {
    //     public: 'https://www.okx.com',
    //     private: 'https://www.okx.com',
    //   }
    // },
  },
  // 开发环境：允许自签名证书（仅用于本地测试）
  // 生产环境应设为 true
  enableRateLimit: true, // 启用请求频率限制
});

/**
 * 下单封装
 * @param symbol 交易对，如 BTC/USDT
 * @param side 'buy' | 'sell'
 * @param type 'market' | 'limit'
 * @param amount 数量（市价买需用 quote 金额）
 * @param price 限价单价格
 * @returns 下单结果
 */
/**
 * 获取当前仓位（仅永续合约 SWAP）
 * @returns 以 UI 需要的字段格式返回仓位列表
 * @description 直接调用 OKX V5 私有接口 `account/positions`，避免 ccxt 内部市场加载导致 OPTION 接口报错。
 */
export async function fetchPositions() {
  try {
    // 直接走私有接口，按 SWAP 过滤
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await (okx as any).privateGetAccountPositions({ instType: 'SWAP' });
    
    // 检查响应格式
    if (resp?.code && resp.code !== '0') {
      throw new Error(`OKX API Error: ${resp.msg || 'Unknown error'} (code: ${resp.code})`);
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = resp?.data || [];
    
    // 如果没有仓位，返回空数组
    if (!rows.length) {
      return [];
    }
    
    // 映射为 UI 期望的字段
    return rows
      .filter((r) => r && r.instId) // 过滤无效数据
      .map((r) => {
        const contracts = Number(r.pos) || 0;
        const mark = Number(r.markPx ?? r.last ?? r.avgPx ?? 0) || 0;
        return {
          symbol: r.instId, // 例如 BTC-USDT-SWAP
          side: (r.posSide === 'long' ? 'long' : 'short') as 'long' | 'short',
          /** 杠杆倍数（OKX 字段 lever，为字符串，转换为 number） */
          leverage: Number(r.lever) || 0,
          /** 清算价（OKX 字段 liqPx） */
          liquidationPrice: Number(r.liqPx) || 0,
          contracts,
          notional: contracts * mark,
          unrealizedPnl: Number(r.upl) || 0,
          entryPrice: Number(r.avgPx) || 0,
          markPrice: mark,
          /** 币种（由 instId 派生，如 BTC） */
          coin: String(r.instId).split('-')[0] || ''
        };
      });
  } catch (error) {
    // 增强错误信息
    const err = error as Error & { code?: string };
    console.error('[fetchPositions] OKX API Error:', {
      message: err.message,
      code: err.code,
      name: err.constructor.name
    });
    throw error;
  }
}

/**
 * 批量获取永续合约最新价
 * @param symbols 如 ['BTC-USDT-SWAP','ETH-USDT-SWAP']
 * @returns 键值对：{ 'BTC-USDT-SWAP': 价格, ... }
 * @description 通过 OKX V5 接口一次拉取 SWAP 全量，随后按传入列表筛选。
 */
export async function fetchTickers(symbols: string[]) {
  // 直接调用 OKX v5 公共接口，返回字段含 instId / last
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp = await (okx as any).publicGetMarketTickers({ instType: 'SWAP' });
  const rows: Array<{ instId: string; last: string }> = resp?.data || [];
  const want = new Set(symbols);
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (want.has(r.instId)) {
      const price = Number(r.last);
      if (!Number.isNaN(price)) map[r.instId] = price;
    }
  }
  return map;
}

/**
 * 设置杠杆倍数
 * @param instId OKX格式，如 'BTC-USDT-SWAP'
 * @param leverage 杠杆倍数 1-125
 * @param mgnMode 保证金模式：'cross'(全仓) | 'isolated'(逐仓)
 * @param posSide 仓位方向（双向持仓模式需要）
 */
export async function setLeverage(
  instId: string,
  leverage: number,
  mgnMode: 'cross' | 'isolated' = 'cross',
  posSide?: 'long' | 'short'
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      instId,
      lever: String(leverage),
      mgnMode
    };
    
    // 双向持仓模式需要指定方向
    if (posSide) {
      params.posSide = posSide;
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await (okx as any).privatePostAccountSetLeverage(params);
    console.log(`[OKX] 杠杆已设置: ${instId} ${leverage}x (${posSide || 'both'})`);
    return resp;
  } catch (error) {
    console.error('[OKX] 设置杠杆失败:', error);
    // 杠杆设置失败不影响下单，可能已经是正确的杠杆
    return null;
  }
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: Record<string, any> = { tdMode };
  if (posSide) params.posSide = posSide; // 对冲模式必须提供
  if (reduceOnly) params.reduceOnly = true; // 仅平仓
  const order = await okx.createOrder(symbol, type, side, amount, price, params);
  return order;
}

/**
 * 下止盈止损单（条件单）
 * @param instId OKX格式交易对，如 'BTC-USDT-SWAP'
 * @param posSide 仓位方向 'long' | 'short'
 * @param size 数量（张数）
 * @param tpPrice 止盈价格（可选）
 * @param slPrice 止损价格（可选）
 * @returns 条件单结果
 */
export async function placeTPSL(
  instId: string,
  posSide: 'long' | 'short',
  size: number,
  tpPrice?: number,
  slPrice?: number
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = [];
    
    // OKX要求张数必须为整数，向下取整
    const sizeInt = Math.floor(size);
    
    if (sizeInt < 1) {
      console.warn('[OKX] 止盈止损单数量不足1张，跳过');
      return results;
    }
    
    console.log(`[OKX] 准备下止盈止损单: ${instId}, 数量=${sizeInt}张, TP=${tpPrice}, SL=${slPrice}`);
    
    // 止盈单
    if (tpPrice) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tpOrder = await (okx as any).privatePostTradeOrderAlgo({
          instId,
          tdMode: 'cross',
          side: posSide === 'long' ? 'sell' : 'buy',
          posSide,
          ordType: 'conditional', // 条件单
          sz: String(sizeInt), // 必须是整数张数
          tpTriggerPx: String(tpPrice),
          tpOrdPx: '-1', // -1表示市价
        });
        results.push({ type: 'TP', price: tpPrice, order: tpOrder });
        console.log('[OKX] ✅ 止盈单已下:', tpPrice, '数量:', sizeInt);
      } catch (tpError) {
        console.error('[OKX] ❌ 止盈单失败:', tpError);
        // 继续尝试止损单
      }
    }
    
    // 止损单
    if (slPrice) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const slOrder = await (okx as any).privatePostTradeOrderAlgo({
          instId,
          tdMode: 'cross',
          side: posSide === 'long' ? 'sell' : 'buy',
          posSide,
          ordType: 'conditional', // 条件单
          sz: String(sizeInt), // 必须是整数张数
          slTriggerPx: String(slPrice),
          slOrdPx: '-1', // -1表示市价
        });
        results.push({ type: 'SL', price: slPrice, order: slOrder });
        console.log('[OKX] ✅ 止损单已下:', slPrice, '数量:', sizeInt);
      } catch (slError) {
        console.error('[OKX] ❌ 止损单失败:', slError);
      }
    }
    
    return results;
  } catch (error) {
    console.error('[OKX] 止盈止损单下单失败:', error);
    throw error;
  }
}

/**
 * 获取账户总金额（USDT 等值）
 * @returns 账户总金额（数字），读取 OKX 账户余额接口的 totalEq 字段
 * @remarks OKX 统一账户返回 data[0].totalEq 为折合 USDT 的总权益
 */
export async function fetchAccountTotal(): Promise<number> {
  // 使用 OKX V5 账户余额接口；ccxt 暴露为私有方法
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp = await (okx as any).privateGetAccountBalance();
  const totalEq = Number(resp?.data?.[0]?.totalEq);
  if (Number.isNaN(totalEq)) {
    throw new Error('无法读取 totalEq（账户总权益）');
  }
  return totalEq;
}

/**
 * 获取 USDT 可用现金（可下单余额）
 * @returns USDT 货币的 availBal 数值；若不存在返回 0
 */
export async function fetchAvailableUSDT(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resp = await (okx as any).privateGetAccountBalance();
  const details: Array<{ ccy: string; availBal?: string; cashBal?: string }> = resp?.data?.[0]?.details || [];
  const usdt = details.find((d) => d.ccy?.toUpperCase() === 'USDT');
  const val = Number(usdt?.availBal ?? usdt?.cashBal ?? 0);
  return Number.isFinite(val) ? val : 0;
}

/**
 * 拉取 K 线（蜡烛）
 * @param instId 例如 'BTC-USDT-SWAP'
 * @param bar 粒度，如 '3m'、'1H'、'4H'
 * @param limit 最大条数（默认 120）
 * @returns 数组：[{ ts, open, high, low, close, vol }]
 * @remarks 使用 OKX v5 `market/candles` 接口；返回为倒序（最新在前），本函数转换为升序。
 */
export async function fetchCandles(instId: string, bar: string, limit = 120): Promise<Array<{ ts: number; open: number; high: number; low: number; close: number; vol: number }>> {
  // 添加重试机制，最多重试3次
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resp = await (okx as any).publicGetMarketCandles({ instId, bar, limit });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = resp?.data || [];
      // OKX 返回倒序，这里升序并做数字转换
      const asc = rows.slice().reverse().map((r) => {
        const [ts, open, high, low, close, vol] = [Number(r[0]), Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4]), Number(r[5])];
        return { ts, open, high, low, close, vol };
      });
      
      if (attempt > 1) {
        console.log(`[fetchCandles] ${instId} 重试成功（第${attempt}次尝试）`);
      }
      
      return asc;
    } catch (error) {
      lastError = error as Error;
      console.error(`[fetchCandles] ${instId} 失败（第${attempt}次尝试）:`, error);
      
      if (attempt < 3) {
        // 等待后重试（指数退避：1秒、2秒）
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  
  // 所有重试都失败
  throw lastError || new Error(`fetchCandles failed for ${instId}`);
}

/**
 * 获取资金费率（最新）
 * @param instId 例如 'BTC-USDT-SWAP'
 * @returns fundingRate 数值；若失败返回 0
 */
export async function fetchFundingRate(instId: string): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await (okx as any).publicGetPublicFundingRate({ instId });
    const rate = Number(resp?.data?.[0]?.fundingRate);
    return Number.isFinite(rate) ? rate : 0;
  } catch {
    return 0;
  }
}

/**
 * 获取持仓量（Open Interest，最新）
 * @param instId 例如 'BTC-USDT-SWAP'
 * @returns 持仓量数值；若失败返回 0
 */
export async function fetchOpenInterest(instId: string): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await (okx as any).publicGetPublicOpenInterest({ instId });
    const oi = Number(resp?.data?.[0]?.oi ?? resp?.data?.[0]?.oiCcy);
    return Number.isFinite(oi) ? oi : 0;
  } catch {
    return 0;
  }
}