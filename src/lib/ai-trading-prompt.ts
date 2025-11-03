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
  "take_profit": number (MANDATORY for OPEN actions - must provide),
  "stop_loss": number (MANDATORY for OPEN actions - must provide),
  "leverage": 1-10,
  "reasoning": "Your detailed analysis",
  "timeframe": "SHORT|MEDIUM|LONG"
}

FORMAT 2 - Multiple Decisions (ONLY when you have multiple CLEAR opportunities):
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
      "reasoning": "BTC shows STRONG bullish alignment...",
      "timeframe": "SHORT"
    },
    {
      "symbol": "XRP",
      "action": "OPEN_SHORT",
      "confidence": 78,
      "size_usdt": 300,
      "take_profit": 2.35,
      "stop_loss": 2.55,
      "leverage": 5,
      "reasoning": "XRP shows CLEAR bearish breakdown...",
      "timeframe": "SHORT"
    }
  ]
}

⚠️ IMPORTANT: Only include coins with HIGH-CONFIDENCE setups (>70%)
- Don't include HOLD decisions for every coin (waste of analysis)
- Focus on 1-3 best opportunities
- Skip coins with unclear signals entirely

POSITION SIZING GUIDELINES (size_usdt):
⚠️ CRITICAL: Check "Available Cash" above - NEVER exceed it!
⚠️ If Available Cash < $100, DO NOT open new positions (wait for existing to close)

Recommended amounts (ONLY if you have sufficient cash):
  * BTC (5-10x leverage): 300-1000 USDT
  * ETH (5-10x leverage): 200-800 USDT  
  * SOL/BNB (3-8x leverage): 150-600 USDT
  * XRP/DOGE (3-8x leverage): 100-400 USDT

STRICT RULES:
- size_usdt MUST be <= Available Cash
- If Available Cash is $50, maximum size_usdt is $45 (leave 10% buffer)
- Total across all open positions should not exceed 80% of available cash
- For CLOSE actions, size_usdt is not needed (closes entire position)
- If cash is low, prefer HOLD over opening small positions

DECISION FORMAT:
- If analyzing a SINGLE coin: Return FORMAT 1 (single decision object)
- If analyzing MULTIPLE coins: Return FORMAT 2 (decisions array)
- size_usdt is REQUIRED for all OPEN actions
- ONLY make decisions with HIGH confidence (>=70%)
- If signals are unclear or mixed, choose HOLD

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
   - ⚠️ CRITICAL: ONLY close positions that exist in "CURRENT LIVE POSITIONS" section
   - If position is NOT in live positions, it's already closed (by TP/SL) - DO NOT try to close it again
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

⚠️ AVAILABLE CASH RULES (EXTREMELY IMPORTANT):
- ALWAYS check "Available Cash" in the data above
- size_usdt MUST be <= Available Cash (leave 10% buffer)
- Example: If Available Cash = $100, maximum size_usdt = $90
- Example: If Available Cash = $50, maximum size_usdt = $45
- Example: If Available Cash = $10, DO NOT open any positions (choose HOLD)
- If cash is insufficient for your desired size_usdt, reduce it or choose HOLD
- Recommended: use 20-50% of available cash per position
- If available cash < $50, strongly prefer HOLD over opening tiny positions

⚠️ TAKE PROFIT & STOP LOSS RULES (MANDATORY):
- For ALL OPEN_LONG and OPEN_SHORT actions, you MUST provide BOTH take_profit AND stop_loss
- Calculate realistic TP/SL based on:
  * Support/resistance levels
  * ATR (volatility)
  * Risk-reward ratio (minimum 1:2)
  * Recent price action
- LONG positions:
  * take_profit: Set 3-5% above entry (conservative) or at next resistance
  * stop_loss: Set 2-3% below entry or below recent support
- SHORT positions:
  * take_profit: Set 3-5% below entry (conservative) or at next support
  * stop_loss: Set 2-3% above entry or above recent resistance
- Example for BTC LONG at $107,000:
  * take_profit: $110,350 (3.1% profit)
  * stop_loss: $104,930 (1.9% loss)
  * Risk-reward: 1:1.6 ✅
- Do NOT open positions without clear TP/SL levels
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
    
    // 解析单个决策对象
    const parseOne = (obj: Record<string, unknown>): ParsedDecision => ({
      symbol: String(obj.symbol || 'GENERAL'),
      action: String(obj.action || 'HOLD').toUpperCase() as ParsedDecision['action'],
      confidence: typeof obj.confidence === 'number' ? obj.confidence : parseInt(String(obj.confidence || '50')),
      entryPrice: obj.entry_price ? parseFloat(String(obj.entry_price)) : undefined,
      sizePercent: obj.size_percent ? parseFloat(String(obj.size_percent)) : undefined,
      sizeUSDT: obj.size_usdt ? parseFloat(String(obj.size_usdt)) : undefined,
      takeProfit: obj.take_profit ? parseFloat(String(obj.take_profit)) : undefined,
      stopLoss: obj.stop_loss ? parseFloat(String(obj.stop_loss)) : undefined,
      leverage: obj.leverage ? parseFloat(String(obj.leverage)) : undefined,
      reasoning: String(obj.reasoning || '未提供理由'),
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
