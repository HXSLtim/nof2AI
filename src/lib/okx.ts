import ccxt from 'ccxt';
import { CONTRACT_MULTIPLIERS, CONTRACT_VALUES } from './constants';

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
  console.warn('[OKX] 警告: 缺少 API 凭证，请在 .env.local 中配置：OKX_API_KEY, OKX_SECRET, OKX_PASSWORD');
}

console.log(`[OKX] 初始化交易所客户端：${isSandbox ? '[沙盒环境]' : '[生产环境]'}`);

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
     * 🔧 CRITICAL: OKX SWAP合约的amount单位设置
     * - 'contracts': amount表示合约张数
     * - 'base': amount表示基础货币数量（如BTC的数量）
     * - 默认是'base'，但我们需要'contracts'
     */
    createMarketBuyOrderRequiresPrice: false,
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
  verbose: false, // ✅ 关闭ccxt详细日志（太多信息）
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
        const coin = String(r.instId).split('-')[0] || '';
        const posInContracts = Number(r.pos) || 0;  // ⚠️ OKX返回的是合约张数！
        const mark = Number(r.markPx ?? r.last ?? r.avgPx ?? 0) || 0;
        
        // 🔧 CRITICAL FIX: OKX返回的pos字段 = 合约张数
        // 需要乘以合约面值得到实际币数量
        const contractValue = CONTRACT_VALUES[coin] || 1;
        
        // 计算实际币数量：张数 × 每张的币数
        const coinsAmount = Math.abs(posInContracts) * contractValue;
        
        // 计算名义价值：币数量 × 价格
        const notionalValue = coinsAmount * mark;
        
        // 🔍 调试：打印计算过程
        console.log(`[fetchPositions] ${coin} 计算详情:`, {
          pos_张数: r.pos,
          每张包含: contractValue,
          实际币数量: coinsAmount.toFixed(6),
          markPx: r.markPx,
          计算_名义价值: notionalValue.toFixed(2),
          OKX返回_notional: r.notional,
          差异: r.notional ? `${(Number(r.notional) / notionalValue).toFixed(2)}倍` : 'N/A'
        });
        
        // 🔧 修复：正确判断仓位方向
        let side: 'long' | 'short';
        if (r.posSide === 'long' || r.posSide === 'short') {
          // 双向持仓模式：直接使用posSide
          side = r.posSide;
        } else {
          // 单向持仓模式：根据pos的正负判断
          side = posInContracts >= 0 ? 'long' : 'short';
        }
        
        return {
          symbol: r.instId, // 例如 BTC-USDT-SWAP
          side,
          /** 杠杆倍数（OKX 字段 lever，为字符串，转换为 number） */
          leverage: Number(r.lever) || 0,
          /** 保证金模式（OKX 字段 mgnMode: cross 或 isolated） */
          mgnMode: (r.mgnMode === 'isolated' ? 'isolated' : 'cross') as 'cross' | 'isolated',
          /** 清算价（OKX 字段 liqPx） */
          liquidationPrice: Number(r.liqPx) || 0,
          /** 合约张数 */
          contracts: Math.abs(posInContracts),
          /** 名义价值（USDT）= 币数量 × 标记价格 */
          notional: notionalValue,
          unrealizedPnl: Number(r.upl) || 0,
          entryPrice: Number(r.avgPx) || 0,
          markPrice: mark,
          /** 币种（由 instId 派生，如 BTC） */
          coin: coin
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
    // console.log(`[OKX] 杠杆已设置: ${instId} ${leverage}x (${posSide || 'both'})`); // ✅ 屏蔽常规日志
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
  try {
    // 提取币种符号
    const coin = symbol.split('/')[0];
    const multiplier = CONTRACT_MULTIPLIERS[coin] || 1;
    
    // 🔧 关键修复：ccxt的amount需要乘以合约乘数
    // ✅ OKX USDT永续合约要求整数张合约（lot size = 1）
    const rawCcxtAmount = amount * multiplier;
    const ccxtAmount = Math.floor(rawCcxtAmount);
    
    // ⚠️ 检查最小精度：如果合约数量 < 0.01，抛出错误
    if (ccxtAmount < 0.01) {
      const errorMsg = `合约数量不足最小精度要求 (${ccxtAmount.toFixed(8)} < 0.01)。建议：${
        reduceOnly 
          ? '该仓位过小，请在OKX手动平仓或等待自然平仓'
          : '请增加开仓金额至少能买0.01张合约'
      }`;
      console.error(`[placeOrder] ❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    console.log(`\n[placeOrder] ========== ${reduceOnly ? '平仓' : '开仓'}请求 ==========`);
    console.log(`[placeOrder] 操作类型: ${reduceOnly ? '平仓 (REDUCE_ONLY)' : '开仓 (OPEN)'}`);
    console.log(`[placeOrder] 币种: ${coin}`);
    console.log(`[placeOrder] 方向: ${side} (${side === 'buy' ? '买入' : '卖出'})`);
    console.log(`[placeOrder] 订单类型: ${type}`);
    console.log(`[placeOrder] 合约张数: ${amount.toFixed(8)}张`);
    console.log(`[placeOrder] CCXT数量: ${ccxtAmount.toFixed(8)} (乘数: ${multiplier})`);
    if (price) console.log(`[placeOrder] 价格: ${price}`);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: Record<string, any> = { tdMode };
    
    // 🔧 关键修复：posSide参数处理
    // - 如果传入了posSide（开仓或双向持仓平仓）：添加到params
    // - 如果未传入posSide（单向持仓平仓）：不添加到params
    if (posSide !== undefined) {
      params.posSide = posSide;
      console.log(`[placeOrder] 传递posSide=${posSide} ${reduceOnly ? '(平仓)' : '(开仓)'}`);
    } else {
      console.log(`[placeOrder] 不传递posSide ${reduceOnly ? '(单向持仓平仓)' : '(未指定方向)'}`);
    }

    // ⚠️ 注意：不使用reduceOnly参数（会导致51169错误）
    // OKX会根据订单方向和现有仓位自动判断是开仓还是平仓
    // reduceOnly参数仅用于内部逻辑判断，不加入params
    
    // 打印完整的请求参数
    console.log(`[placeOrder] 📤 请求载荷:`);
    console.log(`[placeOrder] Symbol: ${symbol}`);
    console.log(`[placeOrder] Type: ${type}`);
    console.log(`[placeOrder] Side: ${side}`);
    console.log(`[placeOrder] Amount: ${ccxtAmount}`);
    console.log(`[placeOrder] Price: ${price}`);
    console.log(`[placeOrder] Params对象:`);
    console.log(JSON.stringify(params, null, 2));
    console.log(`[placeOrder] 关键检查 - params中是否有posSide: ${params.posSide !== undefined ? 'YES' : 'NO'}`);
    console.log(`[placeOrder] 关键检查 - params中是否有reduceOnly: ${params.reduceOnly !== undefined ? 'YES' : 'NO'}`);
    
    console.log(`[placeOrder] 发送订单到OKX...`);
    const order = await okx.createOrder(symbol, type, side, ccxtAmount, price, params);
    
    // 打印完整的响应
    console.log(`[placeOrder] 📥 OKX响应:`);
    console.log(JSON.stringify(order, null, 2));
    
    console.log(`[placeOrder] 订单成功: ID=${order.id}, 状态=${order.status}`);
    console.log(`[placeOrder] ========================================\n`);
    
    return order;
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    console.error(`\n[placeOrder] 订单失败 ==================`);
    console.error(`[placeOrder] 错误类型: ${err.constructor.name}`);
    console.error(`[placeOrder] 错误消息: ${err.message}`);
    if (err.code) console.error(`[placeOrder] 错误代码: ${err.code}`);
    
    // 打印OKX返回的详细错误信息
    if (err.response) {
      console.error(`[placeOrder] OKX响应:`);
      console.error(JSON.stringify(err.response, null, 2));
    }
    
    console.error(`[placeOrder] 请求参数:`);
    console.error(JSON.stringify({
      symbol,
      side,
      type,
      amount,
      price,
      posSide,
      reduceOnly,
      tdMode
    }, null, 2));
    console.error(`[placeOrder] ========================================\n`);
    
    throw error;
  }
}

/**
 * 下止盈止损单（条件单）
 * @param instId OKX格式交易对，如 'BTC-USDT-SWAP'
 * @param posSide 仓位方向 'long' | 'short'
 * @param size 数量（张数）
 * @param tpPrice 止盈价格（可选）
 * @param slPrice 止损价格（可选）
 * @param tdMode 保证金模式（默认cross）
 * @returns 条件单结果
 */
export async function placeTPSL(
  instId: string,
  posSide: 'long' | 'short',
  size: number,
  tpPrice?: number,
  slPrice?: number,
  tdMode: 'cross' | 'isolated' = 'cross'
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = [];
    
    // ⚠️ 条件单(algo order)对lot size要求严格
    // 不同币种的lot size不同，为了兼容性，根据币种调整精度
    let sizeRounded: number;
    
    // ✅ OKX USDT永续合约统一规则：lot size = 1，必须是整数张
    // 所有币种都向下取整到整数
    sizeRounded = Math.floor(size);
    
    if (sizeRounded < 1) {
      console.warn(`[OKX] 警告: 止盈止损单数量不足1张（原始:${size.toFixed(8)}，调整后:${sizeRounded}）`);
      console.warn(`[OKX] 建议: 增加仓位大小到至少能买1张合约，或在OKX手动设置止盈止损`);
      return results;
    }
    
    // console.log(`[OKX] 准备下止盈止损单: ${instId}, 原始数量=${size.toFixed(8)}, 调整后=${sizeRounded}张, 模式=${tdMode}, TP=${tpPrice}, SL=${slPrice}`); // ✅ 屏蔽详细日志
    
    // 止盈单
    if (tpPrice) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tpOrder = await (okx as any).privatePostTradeOrderAlgo({
          instId,
          tdMode: tdMode, // ✅ 使用传入的保证金模式
          side: posSide === 'long' ? 'sell' : 'buy',
          posSide,
          ordType: 'conditional', // 条件单
          sz: String(sizeRounded), // 支持小数张数
          tpTriggerPx: String(tpPrice),
          tpOrdPx: '-1', // -1表示市价
        });
        results.push({ type: 'TP', price: tpPrice, order: tpOrder });
        console.log(`[OKX] 止盈单: TP=${tpPrice}`);
      } catch (tpError) {
        console.error('[OKX] 止盈单失败:', tpError);
        // 继续尝试止损单
      }
    }
    
    // 止损单
    if (slPrice) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const slOrder = await (okx as any).privatePostTradeOrderAlgo({
          instId,
          tdMode: tdMode, // ✅ 使用传入的保证金模式
          side: posSide === 'long' ? 'sell' : 'buy',
          posSide,
          ordType: 'conditional', // 条件单
          sz: String(sizeRounded), // 支持小数张数
          slTriggerPx: String(slPrice),
          slOrdPx: '-1', // -1表示市价
        });
        results.push({ type: 'SL', price: slPrice, order: slOrder });
        console.log(`[OKX] 止损单: SL=${slPrice}`);
      } catch (slError) {
        console.error('[OKX] 止损单失败:', slError);
      }
    }
    
    return results;
  } catch (error) {
    console.error('[OKX] 止盈止损单下单失败:', error);
    throw error;
  }
}

/**
 * 获取账户配置信息（包括持仓模式）
 * @returns 账户配置对象
 */
export async function fetchAccountConfig() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await (okx as any).privateGetAccountConfig();
    
    if (resp?.code && resp.code !== '0') {
      throw new Error(`OKX API Error: ${resp.msg || 'Unknown error'} (code: ${resp.code})`);
    }
    
    const config = resp?.data?.[0];
    return {
      // 持仓模式：long_short_mode（双向持仓）或 net_mode（单向持仓）
      posMode: config?.posMode || 'unknown',
      // 是否开启自动借币
      autoLoan: config?.autoLoan === 'true',
      // 其他配置...
      raw: config
    };
  } catch (error) {
    console.error('[fetchAccountConfig] 获取账户配置失败:', error);
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
  // 使用 RetryUtils 工具进行重试
  const { RetryUtils } = await import('./utils');
  const { API_LIMITS } = await import('./constants');
  
  return RetryUtils.withRetry(
    async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resp = await (okx as any).publicGetMarketCandles({ instId, bar, limit });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = resp?.data || [];
      // OKX 返回倒序，这里升序并做数字转换
      const asc = rows.slice().reverse().map((r) => {
        const [ts, open, high, low, close, vol] = [Number(r[0]), Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4]), Number(r[5])];
        return { ts, open, high, low, close, vol };
      });
      return asc;
    },
    API_LIMITS.MAX_RETRIES,
    API_LIMITS.RETRY_DELAY_BASE,
    true // 使用指数退避
  );
}

/**
 * 获取历史订单（最近完成的订单）
 * @param instId 例如 'BTC-USDT-SWAP'，可选，不传则获取所有SWAP订单
 * @param limit 获取数量，默认100
 * @returns 历史订单列表
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
    
    // 获取最近完成的订单
    const resp = await (okx as any).privateGetTradeOrdersHistoryArchive(params);
    
    if (resp?.code && resp.code !== '0') {
      console.warn(`[fetchOrderHistory] OKX API Error: ${resp.msg || 'Unknown'} (code: ${resp.code})`);
      return [];
    }
    
    return resp?.data || [];
  } catch (error) {
    console.error('[fetchOrderHistory] Error:', error);
    return [];
  }
}

/**
 * 获取成交历史（包含盈亏信息）
 * @param instId 可选，指定合约
 * @param limit 获取数量
 * @returns 成交历史列表，包含已实现盈亏
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
    
    // 获取成交历史
    const resp = await (okx as any).privateGetTradeFillsHistory(params);
    
    if (resp?.code && resp.code !== '0') {
      console.warn(`[fetchFillsHistory] OKX API Error: ${resp.msg || 'Unknown'} (code: ${resp.code})`);
      return [];
    }
    
    return resp?.data || [];
  } catch (error) {
    console.error('[fetchFillsHistory] Error:', error);
    return [];
  }
}

/**
 * 获取账户盈亏历史（最近关闭的仓位）
 * @param limit 获取数量
 * @returns 仓位历史列表（含已实现盈亏）
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
    const params = {
      instType: 'SWAP',
      limit: String(limit)
    };
    
    // 使用account/positions-history获取已关闭的仓位历史
    const resp = await (okx as any).privateGetAccountPositionsHistory(params);
    
    if (resp?.code && resp.code !== '0') {
      console.warn(`[fetchClosedPnL] OKX API Error: ${resp.msg || 'Unknown'} (code: ${resp.code})`);
      return [];
    }
    
    const data = resp?.data || [];
    
    return data.map((item: any) => {
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
    }).filter((item: any) => item.pnl !== 0); // 只返回有盈亏记录的
  } catch (error) {
    console.error('[fetchClosedPnL] Error:', error);
    return [];
  }
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