import ccxt from 'ccxt';

/**
 * 初始化 OKX 交易所客户端
 * 使用环境变量中的 API 密钥与密钥
 * 模拟盘开关：OKX_SANDBOX=true 启用，其余走实盘
 */
export const okx = new ccxt.okx({
  apiKey: process.env.OKX_API_KEY!,
  secret: process.env.OKX_SECRET!,
  password: process.env.OKX_PASSWORD!,
  sandbox: process.env.OKX_SANDBOX === 'true', // 域名：始终用主域名；是否模拟盘由 sandbox 自动加头决定
  options: {
    /**
     * 默认交易类型：改为 'swap' 以适配永续合约接口
     * @remarks 避免 ccxt 在内部加载市场信息时触发 OPTION/现货等无关接口
     */
    defaultType: 'swap',
  },
  // 无代理，直连
  verify: false, // 开发环境先关校验
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
  // 直接走私有接口，按 SWAP 过滤
  const resp = await (okx as any).privateGetAccountPositions({ instType: 'SWAP' });
  const rows: any[] = resp?.data || [];
  // 映射为 UI 期望的字段
  return rows.map((r) => {
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
}

/**
 * 批量获取永续合约最新价
 * @param symbols 如 ['BTC-USDT-SWAP','ETH-USDT-SWAP']
 * @returns 键值对：{ 'BTC-USDT-SWAP': 价格, ... }
 * @description 通过 OKX V5 接口一次拉取 SWAP 全量，随后按传入列表筛选。
 */
export async function fetchTickers(symbols: string[]) {
  // 直接调用 OKX v5 公共接口，返回字段含 instId / last
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

export async function placeOrder(
  symbol: string,
  side: 'buy' | 'sell',
  type: 'market' | 'limit',
  amount: number,
  price?: number
) {
  const order = await okx.createOrder(symbol, type, side, amount, price);
  return order;
}

/**
 * 获取账户总金额（USDT 等值）
 * @returns 账户总金额（数字），读取 OKX 账户余额接口的 totalEq 字段
 * @remarks OKX 统一账户返回 data[0].totalEq 为折合 USDT 的总权益
 */
export async function fetchAccountTotal(): Promise<number> {
  // 使用 OKX V5 账户余额接口；ccxt 暴露为私有方法
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
  const resp = await (okx as any).publicGetMarketCandles({ instId, bar, limit });
  const rows: any[] = resp?.data || [];
  // OKX 返回倒序，这里升序并做数字转换
  const asc = rows.slice().reverse().map((r) => {
    const [ts, open, high, low, close, vol] = [Number(r[0]), Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4]), Number(r[5])];
    return { ts, open, high, low, close, vol };
  });
  return asc;
}

/**
 * 获取资金费率（最新）
 * @param instId 例如 'BTC-USDT-SWAP'
 * @returns fundingRate 数值；若失败返回 0
 */
export async function fetchFundingRate(instId: string): Promise<number> {
  try {
    const resp = await (okx as any).publicGetPublicFundingRate({ instId });
    const rate = Number(resp?.data?.[0]?.fundingRate);
    return Number.isFinite(rate) ? rate : 0;
  } catch (e) {
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
    const resp = await (okx as any).publicGetPublicOpenInterest({ instId });
    const oi = Number(resp?.data?.[0]?.oi ?? resp?.data?.[0]?.oiCcy);
    return Number.isFinite(oi) ? oi : 0;
  } catch (e) {
    return 0;
  }
}