import { NextResponse } from 'next/server';
import { fetchCandles, fetchFundingRate, fetchOpenInterest, fetchAccountTotal, fetchAvailableUSDT, fetchPositions } from '@/lib/okx';
import { queryEquity } from '@/lib/db';
import { ema, macd, rsi, atr, midPrices } from '@/lib/indicators';

/**
 * 生成符合 README 模板的 AI 提示词
 * GET /api/ai/prompt
 * @remarks 按 3 分钟与 4 小时两条时间框架计算核心指标，并汇总账户信息。
 */
export async function GET() {
  try {
    /**
     * 目标合约（OKX SWAP）
     * @remarks 对应提示词的大写模块：ALL BTC/ETH/SOL/BNB/XRP/DOGE DATA
     */
    const INST_IDS = ['BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP', 'BNB-USDT-SWAP', 'XRP-USDT-SWAP', 'DOGE-USDT-SWAP'];

    // 拉取与计算每个币种的指标
    const sections: string[] = [];
    /**
     * 保存各币种的关键指标（供仓位出口使用）
     * @remarks key 为币种（如 BTC），value 为当前 EMA20（3m）等。
     */
    const latestEma20ByCoin: Record<string, number> = {};

    /**
     * 序列说明：调整为“最新 → 最旧”以便快速查看最近状态
     */
    const header = `ALL OF THE PRICE OR SIGNAL DATA BELOW IS ORDERED: NEWEST → OLDEST\n\nTimeframes note: Unless stated otherwise in a section title, intraday series are provided at 3‑minute intervals. If a coin uses a different interval, it is explicitly stated in that coin’s section.\n\nCURRENT MARKET STATE FOR ALL COINS`;

    for (const instId of INST_IDS) {
      const coin = instId.split('-')[0];
      // 3m K 线：保证指标稳定性，取 120 根
      const candles3m = await fetchCandles(instId, '3m', 120);
      if (candles3m.length < 20) throw new Error(`3m candles too short for ${instId}`);
      const mids = midPrices(candles3m);
      const closes = candles3m.map((c) => c.close);
      const ema20_3m = ema(mids, 20);
      const macdHist_3m = macd(mids, 12, 26, 9);
      const rsi7_3m = rsi(mids, 7);
      const rsi14_3m = rsi(mids, 14);

      const currentPrice = mids[mids.length - 1];
      const currentEma20 = ema20_3m[ema20_3m.length - 1];
      const currentMacd = macdHist_3m[macdHist_3m.length - 1];
      const currentRsi7 = rsi7_3m[rsi7_3m.length - 1];
      latestEma20ByCoin[coin] = currentEma20;

      // 资金费率与持仓量（最新值）；平均值暂以最新近似，后续接入历史 OI 再替换
      const fundingRate = await fetchFundingRate(instId);
      const openInterestLatest = await fetchOpenInterest(instId);
      const openInterestAvg = openInterestLatest; // TODO: 接入 OI 历史，计算真实均值

      // 序列输出采用最近 10 个点，且按“最新 → 最旧”排列
      const takeLastDesc = (arr: number[]) => arr.slice(Math.max(0, arr.length - 10)).reverse();
      const midsLast10 = takeLastDesc(mids);
      const ema20Last10 = takeLastDesc(ema20_3m);
      const macdLast10 = takeLastDesc(macdHist_3m);
      const rsi7Last10 = takeLastDesc(rsi7_3m);
      const rsi14Last10 = takeLastDesc(rsi14_3m);

      // 4 小时框架：EMA20 vs EMA50、ATR3 vs ATR14、成交量现值与 20 均值、MACD/RSI 最近 10
      const candles4h = await fetchCandles(instId, '4H', 60);
      const mids4h = midPrices(candles4h);
      const ema20_4h = ema(mids4h, 20);
      const ema50_4h = ema(mids4h, 50);
      const atr3_4h = atr(candles4h.map((c) => ({ high: c.high, low: c.low, close: c.close })), 3);
      const atr14_4h = atr(candles4h.map((c) => ({ high: c.high, low: c.low, close: c.close })), 14);
      const macdHist_4h = macd(mids4h, 12, 26, 9);
      const rsi14_4h = rsi(mids4h, 14);
      const vol4h = candles4h.map((c) => c.vol);
      const volCurr = vol4h[vol4h.length - 1] ?? 0;
      const volAvg20 = (() => {
        const last20 = vol4h.slice(Math.max(0, vol4h.length - 20));
        const s = last20.reduce((a, b) => a + b, 0);
        return last20.length ? s / last20.length : 0;
      })();

      const fmt = (n: number) => Number.isFinite(n) ? Number(n.toFixed(6)) : 0;

      // 资金费率使用科学计数法，便于与模板示例一致（如 1.25e-05）
      const fmtExp = (n: number) => (Number.isFinite(n) ? Number(n).toExponential(6) : '0');

      const section = [
        `ALL ${coin} DATA`,
        `current_price = ${fmt(currentPrice)}, current_ema20 = ${fmt(currentEma20)}, current_macd = ${fmt(currentMacd)}, current_rsi (7 period) = ${fmt(currentRsi7)}`,
        `\nIn addition, here is the latest ${coin} open interest and funding rate for perps:\n`,
        `Open Interest: Latest: ${fmt(openInterestLatest)} Average: ${fmt(openInterestAvg)}`,
        `\nFunding Rate: ${fmtExp(fundingRate)}`,
        `\nIntraday series (3‑minute intervals, newest → oldest):\n`,
        `${coin} mid prices: [${midsLast10.map(fmt).join(', ')}]`,
        `\nEMA indicators (20‑period): [${ema20Last10.map(fmt).join(', ')}]`,
        `\nMACD indicators: [${macdLast10.map(fmt).join(', ')}]`,
        `\nRSI indicators (7‑Period): [${rsi7Last10.map(fmt).join(', ')}]`,
        `\nRSI indicators (14‑Period): [${rsi14Last10.map(fmt).join(', ')}]`,
        `\n\nLonger‑term context (4‑hour timeframe):\n`,
        `20‑Period EMA: ${fmt(ema20_4h[ema20_4h.length - 1])} vs. 50‑Period EMA: ${fmt(ema50_4h[ema50_4h.length - 1])}`,
        `\n3‑Period ATR: ${fmt(atr3_4h[atr3_4h.length - 1])} vs. 14‑Period ATR: ${fmt(atr14_4h[atr14_4h.length - 1])}`,
        `\nCurrent Volume: ${fmt(volCurr)} vs. Average Volume: ${fmt(volAvg20)}`,
        `\nMACD indicators: [${takeLastDesc(macdHist_4h).map(fmt).join(', ')}]`,
        `\nRSI indicators (14‑Period): [${takeLastDesc(rsi14_4h).map(fmt).join(', ')}]`,
      ].join('\n');

      sections.push(section);
    }

    // 账户信息与绩效
    const hours = 72;
    const since = Date.now() - hours * 3600 * 1000;
    const eq = queryEquity(since);
    const totalEqLatest = eq.length ? eq[eq.length - 1].total : await fetchAccountTotal();
    const totalEqEarliest = eq.length ? eq[0].total : totalEqLatest;
    const totalReturnPct = totalEqEarliest > 0 ? ((totalEqLatest - totalEqEarliest) / totalEqEarliest) * 100 : 0;
    const cashUSDT = await fetchAvailableUSDT();

    /**
     * 格式化仓位为模板示例的字典串（扩展字段）
     * @param p 仓位对象（来自 OKX 私有接口）
     * @returns 形如：{'symbol': 'ETH', 'side': 'long', 'quantity': 4.57, 'entry_price': 3696.6, 'current_price': 3873.85, 'liquidation_price': 3397.58, 'unrealized_pnl': 810.03, 'leverage': 10, 'exit_plan': {...}, 'confidence': 0.7, 'risk_usd': 844.825, 'sl_oid': -1, 'tp_oid': -1, 'wait_for_fill': False, 'entry_oid': -1, 'notional_usd': 17703.49}
     */
    const formatPosition = (p: any) => {
      const f = (n: number) => (Number.isFinite(n) ? Number(n.toFixed(6)) : 0);
      const sym = String(p.coin || (p.symbol ? String(p.symbol).split('-')[0] : ''));
      const side = String(p.side || '').toLowerCase() === 'short' ? 'short' : 'long';
      const qtyRaw = Number(p.contracts ?? p.quantity ?? 0);
      const qty = Math.abs(qtyRaw);
      const entry = Number(p.entryPrice ?? 0);
      const mark = Number(p.markPrice ?? 0);
      const liq = Number(p.liquidationPrice ?? 0);
      const upl = Number(p.unrealizedPnl ?? 0);
      const lev = Number(p.leverage ?? 0);
      const notional = Number(p.notional ?? qty * mark);
      const ema20 = latestEma20ByCoin[sym] ?? mark;

      // 简化版退出计划：
      // - 多头：止盈 10%，止损 5%，失效条件为 3m 收盘价跌破 EMA20
      // - 空头：止盈 -10%，止损 +5%，失效条件为 3m 收盘价突破 EMA20
      const profitTarget = side === 'long' ? entry * 1.10 : entry * 0.90;
      const stopLoss = side === 'long' ? entry * 0.95 : entry * 1.05;
      const invalidation = side === 'long'
        ? `If the price closes below ${f(ema20)} on a 3-minute candle`
        : `If the price closes above ${f(ema20)} on a 3-minute candle`;
      const riskUsd = Math.abs(stopLoss - entry) * qty;
      const confidence = 0.7;

      const exitPlan = `{'profit_target': ${f(profitTarget)}, 'stop_loss': ${f(stopLoss)}, 'invalidation_condition': '${invalidation}'}`;

      return `{'symbol': '${sym}', 'side': '${side}', 'quantity': ${f(qty)}, 'entry_price': ${f(entry)}, 'current_price': ${f(mark)}, 'liquidation_price': ${f(liq)}, 'unrealized_pnl': ${f(upl)}, 'leverage': ${f(lev)}, 'exit_plan': ${exitPlan}, 'confidence': ${f(confidence)}, 'risk_usd': ${f(riskUsd)}, 'sl_oid': -1, 'tp_oid': -1, 'wait_for_fill': False, 'entry_oid': -1, 'notional_usd': ${f(notional)}}`;
    };
    
    // 拉取当前仓位并拼接到账户信息段
    const positions = await fetchPositions().catch(() => [] as any[]);
    const positionsLine = positions.length
      ? `\n\nCurrent live positions & performance: ${positions.map(formatPosition).join(' ')}`
      : `\n\nCurrent live positions & performance: None`;

    const footer = [
      'HERE IS YOUR ACCOUNT INFORMATION & PERFORMANCE',
      `Current Total Return (percent): ${Number(totalReturnPct.toFixed(2))}%`,
      `\nAvailable Cash: ${Number(cashUSDT.toFixed(2))}`,
      `\nCurrent Account Value: ${Number(totalEqLatest.toFixed(2))}`,
      positionsLine,
    ].join('\n');

    const prompt = [header, '', sections.join('\n\n'), '', footer].join('\n');
    return NextResponse.json({ success: true, prompt });
  } catch (err: any) {
    console.error('[api/ai/prompt] error', err);
    return NextResponse.json({ success: false, error: err?.message || 'failed to compose prompt' }, { status: 500 });
  }
}
/**
 * 指定 Node.js 运行时
 * @remarks 路由依赖 SQLite 与 Node 内置模块，需使用 Node 运行时。
 */
export const runtime = 'nodejs';