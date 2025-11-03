/**
 * AI 交易决策工具函数
 * 
 * 使用原有的简洁提示词模板（README格式），保留大写模块结构
 */

/**
 * 生成简洁的用户提示词（原有格式）+ JSON响应要求
 * @param marketData 从 /api/ai/prompt 生成的市场数据
 * @param invocationCount 调用次数
 * @param tradingMinutes 交易分钟数（由调用方计算）
 * @returns 完整的用户提示词
 */
export function composePrompt(marketData: string, invocationCount: number, tradingMinutes: number = 0): string {
  const currentTime = new Date().toISOString().replace('T', ' ').slice(0, -1);
  
  return `It has been ${tradingMinutes} minutes since you started trading. The current time is ${currentTime} and you've been invoked ${invocationCount} times. Below, we are providing you with a variety of state data, price data, and predictive signals so you can discover alpha. Below that is your current account information, value, performance, positions, etc.

${marketData}

IMPORTANT: You MUST respond with a valid JSON in ONE of these formats (no markdown code blocks, just raw JSON):

FORMAT 1 - Single Decision:
{
  "symbol": "BTC|ETH|SOL|BNB|XRP|DOGE",
  "action": "OPEN_LONG|OPEN_SHORT|CLOSE_LONG|CLOSE_SHORT|HOLD",
  "confidence": 0-100,
  "entry_price": number (optional, omit for market orders),
  "size_usdt": number (REQUIRED for OPEN actions - USDT amount to use, see guidelines below),
  "take_profit": number (recommended),
  "stop_loss": number (recommended),
  "leverage": 1-10,
  "reasoning": "Your detailed analysis",
  "timeframe": "SHORT|MEDIUM|LONG"
}

FORMAT 2 - Multiple Decisions (you can analyze multiple coins at once):
{
  "decisions": [
    {
      "symbol": "BTC",
      "action": "OPEN_LONG",
      "confidence": 75,
      "size_usdt": 500,
      "take_profit": 112000,
      "stop_loss": 108500,
      "leverage": 5,
      "reasoning": "BTC analysis...",
      "timeframe": "SHORT"
    },
    {
      "symbol": "ETH",
      "action": "HOLD",
      "confidence": 50,
      "reasoning": "ETH mixed signals...",
      "timeframe": "SHORT"
    }
  ]
}

POSITION SIZING GUIDELINES (size_usdt):
- Check "Available Cash" above and don't exceed it
- Recommended amounts based on coin and leverage:
  * BTC (5-10x leverage): 300-1000 USDT
  * ETH (5-10x leverage): 200-800 USDT  
  * SOL/BNB (3-8x leverage): 150-600 USDT
  * XRP/DOGE (3-8x leverage): 100-400 USDT
- Total across all open positions should not exceed 80% of available cash
- For CLOSE actions, size_usdt is not needed (closes entire position)

Note: 
- You can return 1-6 decisions (one for each coin: BTC, ETH, SOL, BNB, XRP, DOGE)
- size_usdt is REQUIRED for all OPEN actions
- If most coins should HOLD, you can return just one decision object with action: HOLD

TRADING RULES TO PREVENT OVER-TRADING:

1. OPENING POSITIONS (BOTH LONG AND SHORT):
   - Check "YOUR ACTIVE OPEN POSITIONS FROM PREVIOUS DECISIONS" section above
   - DO NOT open if you already have an active position for same symbol and direction
   
   LONG SIGNALS (OPEN_LONG):
   - Price > EMA20 (both 3m and 4H)
   - MACD > 0 and rising
   - RSI 50-80 (not oversold, not extremely overbought)
   - Volume above average
   - Positive net sentiment
   - Funding rate not excessively high (< 0.0001)
   
   SHORT SIGNALS (OPEN_SHORT):
   - Price < EMA20 (both 3m and 4H)
   - MACD < 0 and falling
   - RSI 20-50 (CRITICAL: not extremely oversold! RSI < 15 is TOO RISKY to short)
   - Volume confirmation on breakdown
   - Negative net sentiment
   - Funding rate positive (indicating long squeeze potential)
   - Price breaking below support levels
   
   WARNING: DO NOT short when RSI < 15 (extremely oversold, bounce likely)
   WARNING: DO NOT short when price already fell > 10% in last 4 hours (overextended)
   
   IMPORTANT: SHORT positions are just as valuable as LONG positions!
   - Don't be biased towards only going long
   - Actively look for short opportunities in downtrends
   - Downtrends can be just as profitable as uptrends
   - Consider shorting when seeing bearish divergence, resistance rejection, etc.
   
   Only OPEN when:
     * High confidence >= 70%
     * Technical indicators STRONGLY aligned (at least 3 indicators)
     * Opportunity is DIFFERENT from recent trades
     * Have sufficient available cash

2. CLOSING POSITIONS - STRICT THRESHOLDS (DO NOT close positions prematurely):
   - Check the "QUICK SUMMARY" section which shows profit AFTER FEES
   - Trading fees on OKX: ~0.05% per trade (0.1% total for open+close)
   - ONLY close a position if ONE of these conditions is met:
     
     A. PROFIT TARGET REACHED (based on NET profit after fees):
        * Net Profit >= +15% (for positions held < 1 hour)
        * Net Profit >= +10% (for positions held 1-6 hours)
        * Net Profit >= +5% (for positions held > 6 hours)
        * Example: If unrealized P&L shows +10%, net profit after 0.1% fee ≈ +9.9%
     
     B. STOP LOSS HIT:
        * Unrealized P&L <= -8% (strict stop loss)
        * OR price hit your predefined stop_loss level
     
     C. INVALIDATION:
        * Technical setup completely broken (e.g. major support/resistance broken)
        * Strong reversal signals on 4H timeframe
        * Fundamental news/event changed market structure
     
     D. TIME-BASED:
        * Position held > 24 hours with P&L between -2% to +3% (break-even exit)
   
   - DO NOT close positions just because:
     * "Momentum is slowing" - this is normal
     * "RSI is overbought" - trend can continue
     * "Minor pullback" - these happen in trends
     * "Taking profits" unless profit >= thresholds above
   
   - MINIMUM HOLDING TIME: At least 30 minutes before considering close
   - Check the position's "opened X minutes ago" - if < 30 min, DO NOT close

3. DEFAULT TO HOLD:
   - When signals are mixed or unclear
   - When recently opened/closed a position
   - When position is performing normally (within ±5% and < 30 min old)
   - When available cash is low

If you don't see a clear opportunity, respond with {"action": "HOLD", "symbol": "GENERAL", "confidence": 50, "reasoning": "your reason for holding"}.

CRITICAL: 
- Your response must be ONLY valid JSON, starting with { and ending with }
- size_usdt is MANDATORY for all OPEN_LONG and OPEN_SHORT actions
- Example: "size_usdt": 500 means use $500 USDT for this trade
- Check "Available Cash" in the data above - don't exceed it
- Recommended: use 20-40% of available cash per position
- Make sure size_usdt × leverage is enough for at least 1 contract
- If available cash is too low for a meaningful trade, choose HOLD instead
- Do not include any other text, markdown formatting, or explanations outside the JSON`;
}

/**
 * 从AI响应中提取结构化决策
 */
export interface ParsedDecision {
  symbol: string;
  action: 'OPEN_LONG' | 'OPEN_SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT' | 'HOLD';
  confidence: number;
  entryPrice?: number;
  sizePercent?: number;  // 保留兼容性
  sizeUSDT?: number;     // 新增：直接指定USDT金额
  takeProfit?: number;
  stopLoss?: number;
  leverage?: number;
  reasoning: string;
  timeframe?: 'SHORT' | 'MEDIUM' | 'LONG';
}

/**
 * 从AI响应中解析决策（支持单个或多个）
 * @param text AI回复文本
 * @param silent 静默模式（不输出日志），用于解析历史决策
 * @returns 决策数组
 */
export function parseDecisionsFromText(text: string, silent = false): ParsedDecision[] {
  // 尝试解析JSON格式
  try {
    let jsonText = text.trim();
    
    // 清理可能的markdown代码块标记
    jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // 尝试提取JSON对象
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    
    const parsed = JSON.parse(jsonText);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseOne = (obj: any): ParsedDecision => ({
      symbol: obj.symbol || 'GENERAL',
      action: String(obj.action || 'HOLD').toUpperCase() as ParsedDecision['action'],
      confidence: parseInt(obj.confidence || '50'),
      entryPrice: obj.entry_price ? parseFloat(obj.entry_price) : undefined,
      sizePercent: obj.size_percent ? parseFloat(obj.size_percent) : undefined,
      sizeUSDT: obj.size_usdt ? parseFloat(obj.size_usdt) : undefined,
      takeProfit: obj.take_profit ? parseFloat(obj.take_profit) : undefined,
      stopLoss: obj.stop_loss ? parseFloat(obj.stop_loss) : undefined,
      leverage: obj.leverage ? parseFloat(obj.leverage) : undefined,
      reasoning: obj.reasoning || '未提供理由',
      timeframe: obj.timeframe ? String(obj.timeframe).toUpperCase() as ParsedDecision['timeframe'] : 'SHORT'
    });
    
    // 检查是否是多决策格式
    if (parsed.decisions && Array.isArray(parsed.decisions)) {
      if (!silent) console.log(`[parseDecisions] ✅ ${parsed.decisions.length}个决策`);
      return parsed.decisions.map(parseOne);
    }
    
    // 单个决策格式
    if (parsed.action) {
      if (!silent) console.log('[parseDecisions] ✅ 单个决策');
      return [parseOne(parsed)];
    }
  } catch {
    if (!silent) console.log('[parseDecisions] ❌ 解析失败');
  }
  
  // 兜底 - 返回HOLD
  if (!silent) console.log('[parseDecisions] ⚠️ 兜底HOLD');
  return [{
    symbol: 'GENERAL',
    action: 'HOLD',
    confidence: 50,
    reasoning: '未能从AI回复中解析出有效决策。完整回复: ' + text.substring(0, 150) + '...'
  }];
}

/**
 * 单个决策解析（兼容旧代码）
 * @param text AI回复文本
 * @param silent 静默模式（不输出日志），用于解析历史决策
 */
export function parseDecisionFromText(text: string, silent = false): ParsedDecision | null {
  const decisions = parseDecisionsFromText(text, silent);
  return decisions.length > 0 ? decisions[0] : null;
}
