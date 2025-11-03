import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { SUPPORTED_COINS } from './constants';

let db: Database.Database | null = null;

/**
 * 获取数据库实例（若不存在则创建并初始化表结构）
 * @returns 数据库实例
 */
export function getDb(): Database.Database {
  if (db) return db;
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'quant.db');
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_equity (
      ts INTEGER PRIMARY KEY,
      total REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS price_snapshots (
      ts INTEGER NOT NULL,
      inst_id TEXT NOT NULL,
      price REAL NOT NULL,
      PRIMARY KEY (ts, inst_id)
    );
    CREATE TABLE IF NOT EXISTS indicators_3m (
      ts INTEGER NOT NULL,
      inst_id TEXT NOT NULL,
      ema20 REAL,
      macd REAL,
      rsi7 REAL,
      rsi14 REAL,
      PRIMARY KEY (ts, inst_id)
    );
    CREATE TABLE IF NOT EXISTS indicators_4h (
      ts INTEGER NOT NULL,
      inst_id TEXT NOT NULL,
      ema20 REAL,
      ema50 REAL,
      atr3 REAL,
      atr14 REAL,
      macd REAL,
      rsi14 REAL,
      volume REAL,
      PRIMARY KEY (ts, inst_id)
    );
    CREATE TABLE IF NOT EXISTS funding_rates (
      ts INTEGER NOT NULL,
      inst_id TEXT NOT NULL,
      rate REAL NOT NULL,
      PRIMARY KEY (ts, inst_id)
    );
    CREATE TABLE IF NOT EXISTS open_interest (
      ts INTEGER NOT NULL,
      inst_id TEXT NOT NULL,
      oi REAL NOT NULL,
      PRIMARY KEY (ts, inst_id)
    );
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      desc TEXT NOT NULL,
      ts INTEGER NOT NULL,
      status TEXT NOT NULL,
      prompt TEXT,
      reply TEXT
    );
    CREATE TABLE IF NOT EXISTS coin_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trade_reflections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      decision_id TEXT UNIQUE NOT NULL,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL,
      outcome TEXT,
      reasoning TEXT,
      market_conditions TEXT,
      pnl_amount REAL,
      pnl_percentage REAL,
      holding_time_minutes INTEGER,
      entry_price REAL,
      exit_price REAL,
      entry_ts INTEGER,
      exit_ts INTEGER,
      mistakes TEXT,
      insights TEXT,
      improvement TEXT,
      confidence INTEGER,
      leverage INTEGER,
      size_usdt REAL,
      actual_vs_expected TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prompt_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL,
      prompt_content TEXT NOT NULL,
      performance_metrics TEXT,
      win_rate REAL,
      avg_pnl REAL,
      total_trades INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT FALSE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_price_inst_ts ON price_snapshots(inst_id, ts);
    CREATE INDEX IF NOT EXISTS idx_ind3m_inst_ts ON indicators_3m(inst_id, ts);
    CREATE INDEX IF NOT EXISTS idx_ind4h_inst_ts ON indicators_4h(inst_id, ts);
    CREATE INDEX IF NOT EXISTS idx_decisions_ts ON decisions(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
    CREATE INDEX IF NOT EXISTS idx_reflections_decision ON trade_reflections(decision_id);
    CREATE INDEX IF NOT EXISTS idx_reflections_symbol ON trade_reflections(symbol);
    CREATE INDEX IF NOT EXISTS idx_reflections_outcome ON trade_reflections(outcome);
    CREATE INDEX IF NOT EXISTS idx_reflections_created ON trade_reflections(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prompt_versions_active ON prompt_versions(is_active);
  `);
  return db;
}

/**
 * 保存币种配置
 * @param enabledCoins 启用的币种列表，如 ['BTC', 'ETH']
 */
export function saveCoinToggles(enabledCoins: string[]): void {
  const d = getDb();
  const stmt = d.prepare('INSERT OR REPLACE INTO coin_config (key, value, updated_at) VALUES (?, ?, ?)');
  stmt.run('enabled_coins', JSON.stringify(enabledCoins), Date.now());
}

/**
 * 获取启用的币种列表
 * @returns 启用的币种数组，如 ['BTC', 'ETH']，默认全部启用
 */
export function getEnabledCoins(): string[] {
  const d = getDb();
  const stmt = d.prepare('SELECT value FROM coin_config WHERE key = ?');
  const row = stmt.get('enabled_coins') as { value: string } | undefined;
  
  // 导入默认币种列表（从顶部导入）
  const DEFAULT_COINS: string[] = Array.from(SUPPORTED_COINS);
  
  if (row) {
    try {
      return JSON.parse(row.value) as string[];
    } catch {
      return DEFAULT_COINS;
    }
  }
  
  return DEFAULT_COINS;
}

/**
 * 写入一条账户总金额快照（USDT）
 * @param ts 毫秒时间戳
 * @param total 总金额（USDT）
 */
export function insertEquity(ts: number, total: number): void {
  const d = getDb();
  const stmt = d.prepare('INSERT OR REPLACE INTO account_equity (ts, total) VALUES (?, ?)');
  stmt.run(ts, total);
}

/**
 * 查询账户总金额时间序列（升序）
 * @param since 最早毫秒时间戳（可选）
 * @param limit 最大条数（可选）
 * @returns 行数组：{ ts, total }
 */
export function queryEquity(since?: number, limit?: number): { ts: number; total: number }[] {
  const d = getDb();
  if (since && limit) {
    return d
      .prepare('SELECT ts, total FROM account_equity WHERE ts >= ? ORDER BY ts ASC LIMIT ?')
      .all(since, limit) as { ts: number; total: number }[];
  } else if (since) {
    return d
      .prepare('SELECT ts, total FROM account_equity WHERE ts >= ? ORDER BY ts ASC')
      .all(since) as { ts: number; total: number }[];
  } else if (limit) {
    return d
      .prepare('SELECT ts, total FROM account_equity ORDER BY ts ASC LIMIT ?')
      .all(limit) as { ts: number; total: number }[];
  }
  return d
    .prepare('SELECT ts, total FROM account_equity ORDER BY ts ASC')
    .all() as { ts: number; total: number }[];
}

/** 聊天记录行结构 */
export type ChatRow = { id: number; ts: number; role: 'user' | 'assistant' | 'system'; content: string };

/** 写入一条聊天消息 */
export function insertChatMessage(ts: number, role: 'user' | 'assistant' | 'system', content: string): void {
  const d = getDb();
  const stmt = d.prepare('INSERT INTO chat_messages (ts, role, content) VALUES (?, ?, ?)');
  stmt.run(ts, role, content);
}

/** 查询聊天历史（升序） */
export function queryChatHistory(limit?: number, since?: number): ChatRow[] {
  const d = getDb();
  if (since && limit) {
    return d
      .prepare('SELECT id, ts, role, content FROM chat_messages WHERE ts >= ? ORDER BY ts ASC LIMIT ?')
      .all(since, limit) as ChatRow[];
  } else if (since) {
    return d
      .prepare('SELECT id, ts, role, content FROM chat_messages WHERE ts >= ? ORDER BY ts ASC')
      .all(since) as ChatRow[];
  } else if (limit) {
    return d
      .prepare('SELECT id, ts, role, content FROM chat_messages ORDER BY ts ASC LIMIT ?')
      .all(limit) as ChatRow[];
  }
  return d
    .prepare('SELECT id, ts, role, content FROM chat_messages ORDER BY ts ASC')
    .all() as ChatRow[];
}

// ==================== 价格和指标数据存储 ====================

/**
 * 插入价格快照
 */
export function insertPriceSnapshot(ts: number, instId: string, price: number): void {
  const d = getDb();
  const stmt = d.prepare('INSERT OR REPLACE INTO price_snapshots (ts, inst_id, price) VALUES (?, ?, ?)');
  stmt.run(ts, instId, price);
}

/**
 * 查询价格历史
 */
export function queryPrices(instId: string, since: number, limit?: number): Array<{ ts: number; price: number }> {
  const d = getDb();
  if (limit) {
    return d
      .prepare('SELECT ts, price FROM price_snapshots WHERE inst_id = ? AND ts >= ? ORDER BY ts ASC LIMIT ?')
      .all(instId, since, limit) as Array<{ ts: number; price: number }>;
  }
  return d
    .prepare('SELECT ts, price FROM price_snapshots WHERE inst_id = ? AND ts >= ? ORDER BY ts ASC')
    .all(instId, since) as Array<{ ts: number; price: number }>;
}

/**
 * 插入3分钟指标
 */
export function insertIndicators3m(ts: number, instId: string, data: { ema20?: number; macd?: number; rsi7?: number; rsi14?: number }): void {
  const d = getDb();
  const stmt = d.prepare('INSERT OR REPLACE INTO indicators_3m (ts, inst_id, ema20, macd, rsi7, rsi14) VALUES (?, ?, ?, ?, ?, ?)');
  stmt.run(ts, instId, data.ema20 ?? null, data.macd ?? null, data.rsi7 ?? null, data.rsi14 ?? null);
}

/**
 * 查询3分钟指标历史
 */
export function queryIndicators3m(instId: string, since: number, limit?: number): Array<{ ts: number; ema20: number; macd: number; rsi7: number; rsi14: number }> {
  const d = getDb();
  if (limit) {
    return d
      .prepare('SELECT ts, ema20, macd, rsi7, rsi14 FROM indicators_3m WHERE inst_id = ? AND ts >= ? ORDER BY ts ASC LIMIT ?')
      .all(instId, since, limit) as Array<{ ts: number; ema20: number; macd: number; rsi7: number; rsi14: number }>;
  }
  return d
    .prepare('SELECT ts, ema20, macd, rsi7, rsi14 FROM indicators_3m WHERE inst_id = ? AND ts >= ? ORDER BY ts ASC')
    .all(instId, since) as Array<{ ts: number; ema20: number; macd: number; rsi7: number; rsi14: number }>;
}

/**
 * 插入4小时指标
 */
export function insertIndicators4h(ts: number, instId: string, data: { ema20?: number; ema50?: number; atr3?: number; atr14?: number; macd?: number; rsi14?: number; volume?: number }): void {
  const d = getDb();
  const stmt = d.prepare('INSERT OR REPLACE INTO indicators_4h (ts, inst_id, ema20, ema50, atr3, atr14, macd, rsi14, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  stmt.run(ts, instId, data.ema20 ?? null, data.ema50 ?? null, data.atr3 ?? null, data.atr14 ?? null, data.macd ?? null, data.rsi14 ?? null, data.volume ?? null);
}

/**
 * 插入资金费率
 */
export function insertFundingRate(ts: number, instId: string, rate: number): void {
  const d = getDb();
  const stmt = d.prepare('INSERT OR REPLACE INTO funding_rates (ts, inst_id, rate) VALUES (?, ?, ?)');
  stmt.run(ts, instId, rate);
}

/**
 * 插入持仓量
 */
export function insertOpenInterest(ts: number, instId: string, oi: number): void {
  const d = getDb();
  const stmt = d.prepare('INSERT OR REPLACE INTO open_interest (ts, inst_id, oi) VALUES (?, ?, ?)');
  stmt.run(ts, instId, oi);
}

/**
 * 查询最近的资金费率
 */
export function queryLatestFundingRate(instId: string): number | null {
  const d = getDb();
  const row = d
    .prepare('SELECT rate FROM funding_rates WHERE inst_id = ? ORDER BY ts DESC LIMIT 1')
    .get(instId) as { rate: number } | undefined;
  return row?.rate ?? null;
}

/**
 * 查询最近的持仓量
 */
export function queryLatestOpenInterest(instId: string): { latest: number; average: number } | null {
  const d = getDb();
  const latest = d
    .prepare('SELECT oi FROM open_interest WHERE inst_id = ? ORDER BY ts DESC LIMIT 1')
    .get(instId) as { oi: number } | undefined;
  
  // 计算最近10个的平均值
  const recent = d
    .prepare('SELECT oi FROM open_interest WHERE inst_id = ? ORDER BY ts DESC LIMIT 10')
    .all(instId) as Array<{ oi: number }>;
  
  if (!latest) return null;
  
  const avg = recent.length > 0 
    ? recent.reduce((sum, r) => sum + r.oi, 0) / recent.length 
    : latest.oi;
  
  return { latest: latest.oi, average: avg };
}

// ==================== 决策记录存储 ====================

export type DecisionRow = {
  id: string;
  title: string;
  desc: string;
  ts: number;
  status: 'pending' | 'approved' | 'rejected';
  prompt?: string;
  reply?: string;
};

/**
 * 插入决策记录
 */
export function insertDecision(decision: DecisionRow): void {
  const d = getDb();
  const stmt = d.prepare('INSERT OR REPLACE INTO decisions (id, title, desc, ts, status, prompt, reply) VALUES (?, ?, ?, ?, ?, ?, ?)');
  stmt.run(decision.id, decision.title, decision.desc, decision.ts, decision.status, decision.prompt ?? null, decision.reply ?? null);
}

/**
 * 更新决策状态
 */
export function updateDecisionStatusInDb(id: string, status: 'approved' | 'rejected'): void {
  const d = getDb();
  const stmt = d.prepare('UPDATE decisions SET status = ? WHERE id = ?');
  stmt.run(status, id);
}

/**
 * 查询所有决策（降序，最新的在前）
 */
export function queryAllDecisions(limit?: number): DecisionRow[] {
  const d = getDb();
  if (limit) {
    return d
      .prepare('SELECT id, title, desc, ts, status, prompt, reply FROM decisions ORDER BY ts DESC LIMIT ?')
      .all(limit) as DecisionRow[];
  }
  return d
    .prepare('SELECT id, title, desc, ts, status, prompt, reply FROM decisions ORDER BY ts DESC')
    .all() as DecisionRow[];
}

/**
 * 查询指定状态的决策
 */
export function queryDecisionsByStatus(status: 'pending' | 'approved' | 'rejected', limit?: number): DecisionRow[] {
  const d = getDb();
  if (limit) {
    return d
      .prepare('SELECT id, title, desc, ts, status, prompt, reply FROM decisions WHERE status = ? ORDER BY ts DESC LIMIT ?')
      .all(status, limit) as DecisionRow[];
  }
  return d
    .prepare('SELECT id, title, desc, ts, status, prompt, reply FROM decisions WHERE status = ? ORDER BY ts DESC')
    .all(status) as DecisionRow[];
}

/**
 * 删除旧决策（保留最近N天）
 */
export function cleanupOldDecisions(daysToKeep = 7): void {
  const cutoff = Date.now() - daysToKeep * 24 * 3600 * 1000;
  const d = getDb();
  const stmt = d.prepare('DELETE FROM decisions WHERE ts < ?');
  stmt.run(cutoff);
}

/**
 * 查询活跃的开仓决策（还未被平仓的）
 * @returns 活跃的开仓决策列表
 * @remarks 逻辑：查找所有OPEN决策，排除已经有对应CLOSE决策的
 */
export function queryActiveOpenDecisions(): DecisionRow[] {
  const d = getDb();
  
  // 1. 获取所有已通过的OPEN决策
  const openDecisions = d
    .prepare(`
      SELECT id, title, desc, ts, status, prompt, reply 
      FROM decisions 
      WHERE (title LIKE '%OPEN_LONG%' OR title LIKE '%OPEN_SHORT%')
        AND title NOT LIKE '%CLOSE%'
        AND status = 'approved'
      ORDER BY ts ASC
    `)
    .all() as DecisionRow[];
  
  // 2. 获取所有已通过的CLOSE决策
  const closeDecisions = d
    .prepare(`
      SELECT id, title, desc, ts, status, prompt, reply 
      FROM decisions 
      WHERE (title LIKE '%CLOSE_LONG%' OR title LIKE '%CLOSE_SHORT%')
        AND status = 'approved'
      ORDER BY ts ASC
    `)
    .all() as DecisionRow[];
  
  // 导入币种列表（从顶部导入）
  const symbols: string[] = Array.from(SUPPORTED_COINS);
  
  // 3. 构建币种和方向的映射（记录最后一次平仓时间）
  const closedPositions: Record<string, number> = {}; // key: "BTC-LONG", value: ts
  
  for (const close of closeDecisions) {
    const title = close.title.toUpperCase();
    if (title.includes('CLOSE_LONG')) {
      // 提取币种
      for (const sym of symbols) {
        if (title.includes(sym)) {
          const key = `${sym}-LONG`;
          closedPositions[key] = Math.max(closedPositions[key] || 0, close.ts);
        }
      }
    } else if (title.includes('CLOSE_SHORT')) {
      for (const sym of symbols) {
        if (title.includes(sym)) {
          const key = `${sym}-SHORT`;
          closedPositions[key] = Math.max(closedPositions[key] || 0, close.ts);
        }
      }
    }
  }
  
  // 4. 过滤掉已被平仓的OPEN决策
  const activeDecisions = openDecisions.filter(open => {
    const title = open.title.toUpperCase();
    
    for (const sym of symbols) {
      if (title.includes(sym)) {
        if (title.includes('OPEN_LONG')) {
          const key = `${sym}-LONG`;
          const closeTs = closedPositions[key];
          // 如果这个开仓在最后一次平仓之前，说明已被平掉
          if (closeTs && open.ts < closeTs) {
            return false;
          }
        } else if (title.includes('OPEN_SHORT')) {
          const key = `${sym}-SHORT`;
          const closeTs = closedPositions[key];
          if (closeTs && open.ts < closeTs) {
            return false;
          }
        }
      }
    }
    
    return true;
  });
  
  // 5. 返回最近的活跃决策（降序）
  return activeDecisions.reverse();
}

// ==================== 交易反思记录存储 ====================

export type TradeReflectionRow = {
  id?: number;
  decision_id: string;
  symbol: string;
  action: string;
  outcome?: 'profit' | 'loss' | 'breakeven' | 'pending';
  reasoning?: string;
  market_conditions?: string;
  pnl_amount?: number;
  pnl_percentage?: number;
  holding_time_minutes?: number;
  entry_price?: number;
  exit_price?: number;
  entry_ts?: number;
  exit_ts?: number;
  mistakes?: string;
  insights?: string;
  improvement?: string;
  confidence?: number;
  leverage?: number;
  size_usdt?: number;
  actual_vs_expected?: string;
  created_at: number;
};

/**
 * 插入交易反思记录
 */
export function insertTradeReflection(reflection: TradeReflectionRow): void {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT OR REPLACE INTO trade_reflections (
      decision_id, symbol, action, outcome, reasoning, market_conditions,
      pnl_amount, pnl_percentage, holding_time_minutes,
      entry_price, exit_price, entry_ts, exit_ts,
      mistakes, insights, improvement,
      confidence, leverage, size_usdt, actual_vs_expected,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    reflection.decision_id,
    reflection.symbol,
    reflection.action,
    reflection.outcome ?? null,
    reflection.reasoning ?? null,
    reflection.market_conditions ?? null,
    reflection.pnl_amount ?? null,
    reflection.pnl_percentage ?? null,
    reflection.holding_time_minutes ?? null,
    reflection.entry_price ?? null,
    reflection.exit_price ?? null,
    reflection.entry_ts ?? null,
    reflection.exit_ts ?? null,
    reflection.mistakes ?? null,
    reflection.insights ?? null,
    reflection.improvement ?? null,
    reflection.confidence ?? null,
    reflection.leverage ?? null,
    reflection.size_usdt ?? null,
    reflection.actual_vs_expected ?? null,
    reflection.created_at
  );
}

/**
 * 更新交易反思记录（用于平仓后更新结果）
 */
export function updateTradeReflection(decisionId: string, updates: Partial<TradeReflectionRow>): void {
  const d = getDb();
  
  const fields: string[] = [];
  const values: unknown[] = [];
  
  if (updates.outcome !== undefined) { fields.push('outcome = ?'); values.push(updates.outcome); }
  if (updates.pnl_amount !== undefined) { fields.push('pnl_amount = ?'); values.push(updates.pnl_amount); }
  if (updates.pnl_percentage !== undefined) { fields.push('pnl_percentage = ?'); values.push(updates.pnl_percentage); }
  if (updates.holding_time_minutes !== undefined) { fields.push('holding_time_minutes = ?'); values.push(updates.holding_time_minutes); }
  if (updates.exit_price !== undefined) { fields.push('exit_price = ?'); values.push(updates.exit_price); }
  if (updates.exit_ts !== undefined) { fields.push('exit_ts = ?'); values.push(updates.exit_ts); }
  if (updates.mistakes !== undefined) { fields.push('mistakes = ?'); values.push(updates.mistakes); }
  if (updates.insights !== undefined) { fields.push('insights = ?'); values.push(updates.insights); }
  if (updates.improvement !== undefined) { fields.push('improvement = ?'); values.push(updates.improvement); }
  if (updates.actual_vs_expected !== undefined) { fields.push('actual_vs_expected = ?'); values.push(updates.actual_vs_expected); }
  
  if (fields.length === 0) return;
  
  values.push(decisionId);
  const sql = `UPDATE trade_reflections SET ${fields.join(', ')} WHERE decision_id = ?`;
  const stmt = d.prepare(sql);
  stmt.run(...values);
}

/**
 * 查询交易反思记录
 */
export function queryTradeReflections(options?: {
  symbol?: string;
  outcome?: 'profit' | 'loss' | 'breakeven' | 'pending';
  limit?: number;
  since?: number;
}): TradeReflectionRow[] {
  const d = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];
  
  if (options?.symbol) {
    conditions.push('symbol = ?');
    params.push(options.symbol);
  }
  
  if (options?.outcome) {
    conditions.push('outcome = ?');
    params.push(options.outcome);
  }
  
  if (options?.since) {
    conditions.push('created_at >= ?');
    params.push(options.since);
  }
  
  let sql = 'SELECT * FROM trade_reflections';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC';
  
  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }
  
  const stmt = d.prepare(sql);
  return stmt.all(...params) as TradeReflectionRow[];
}

/**
 * 根据决策ID获取反思记录
 */
export function getTradeReflectionByDecisionId(decisionId: string): TradeReflectionRow | null {
  const d = getDb();
  const stmt = d.prepare('SELECT * FROM trade_reflections WHERE decision_id = ?');
  const row = stmt.get(decisionId) as TradeReflectionRow | undefined;
  return row ?? null;
}

/**
 * 获取交易统计数据
 */
export function getTradeStatistics(options?: { symbol?: string; days?: number }): {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number;
  avgPnl: number;
  totalPnl: number;
  avgHoldingTime: number;
} {
  const d = getDb();
  const conditions: string[] = ["outcome IS NOT NULL AND outcome != 'pending'"];
  const params: unknown[] = [];
  
  if (options?.symbol) {
    conditions.push('symbol = ?');
    params.push(options.symbol);
  }
  
  if (options?.days) {
    const since = Date.now() - options.days * 24 * 3600 * 1000;
    conditions.push('created_at >= ?');
    params.push(since);
  }
  
  const sql = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN outcome = 'profit' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN outcome = 'loss' THEN 1 ELSE 0 END) as losses,
      SUM(CASE WHEN outcome = 'breakeven' THEN 1 ELSE 0 END) as breakevens,
      AVG(pnl_amount) as avg_pnl,
      SUM(pnl_amount) as total_pnl,
      AVG(holding_time_minutes) as avg_holding_time
    FROM trade_reflections
    WHERE ${conditions.join(' AND ')}
  `;
  
  const stmt = d.prepare(sql);
  const result = stmt.get(...params) as {
    total: number;
    wins: number;
    losses: number;
    breakevens: number;
    avg_pnl: number | null;
    total_pnl: number | null;
    avg_holding_time: number | null;
  };
  
  return {
    totalTrades: result.total || 0,
    winningTrades: result.wins || 0,
    losingTrades: result.losses || 0,
    breakevenTrades: result.breakevens || 0,
    winRate: result.total > 0 ? (result.wins / result.total) * 100 : 0,
    avgPnl: result.avg_pnl || 0,
    totalPnl: result.total_pnl || 0,
    avgHoldingTime: result.avg_holding_time || 0
  };
}

// ==================== 提示词版本管理 ====================

export type PromptVersionRow = {
  id?: number;
  version: string;
  prompt_content: string;
  performance_metrics?: string;
  win_rate?: number;
  avg_pnl?: number;
  total_trades?: number;
  is_active: boolean;
  created_at: number;
  updated_at?: number;
};

/**
 * 插入提示词版本
 */
export function insertPromptVersion(version: PromptVersionRow): void {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO prompt_versions (
      version, prompt_content, performance_metrics,
      win_rate, avg_pnl, total_trades, is_active,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    version.version,
    version.prompt_content,
    version.performance_metrics ?? null,
    version.win_rate ?? null,
    version.avg_pnl ?? null,
    version.total_trades ?? 0,
    version.is_active ? 1 : 0,
    version.created_at,
    version.updated_at ?? null
  );
}

/**
 * 更新提示词版本性能指标
 */
export function updatePromptVersionMetrics(version: string, metrics: {
  win_rate?: number;
  avg_pnl?: number;
  total_trades?: number;
  performance_metrics?: string;
}): void {
  const d = getDb();
  const stmt = d.prepare(`
    UPDATE prompt_versions 
    SET win_rate = ?, avg_pnl = ?, total_trades = ?, 
        performance_metrics = ?, updated_at = ?
    WHERE version = ?
  `);
  
  stmt.run(
    metrics.win_rate ?? null,
    metrics.avg_pnl ?? null,
    metrics.total_trades ?? null,
    metrics.performance_metrics ?? null,
    Date.now(),
    version
  );
}

/**
 * 设置活跃的提示词版本
 */
export function setActivePromptVersion(version: string): void {
  const d = getDb();
  
  // 先将所有版本设为非活跃
  d.prepare('UPDATE prompt_versions SET is_active = 0').run();
  
  // 再设置指定版本为活跃
  d.prepare('UPDATE prompt_versions SET is_active = 1 WHERE version = ?').run(version);
}

/**
 * 获取活跃的提示词版本
 */
export function getActivePromptVersion(): PromptVersionRow | null {
  const d = getDb();
  const stmt = d.prepare('SELECT * FROM prompt_versions WHERE is_active = 1 LIMIT 1');
  const row = stmt.get() as PromptVersionRow | undefined;
  return row ?? null;
}

/**
 * 查询所有提示词版本
 */
export function queryPromptVersions(limit?: number): PromptVersionRow[] {
  const d = getDb();
  let sql = 'SELECT * FROM prompt_versions ORDER BY created_at DESC';
  if (limit) {
    sql += ' LIMIT ?';
    const stmt = d.prepare(sql);
    return stmt.all(limit) as PromptVersionRow[];
  }
  const stmt = d.prepare(sql);
  return stmt.all() as PromptVersionRow[];
}