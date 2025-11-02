import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

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
  `);
  return db;
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