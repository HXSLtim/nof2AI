/**
 * 修复trade_reflections表的外键约束问题
 * SQLite不支持直接删除外键，需要重建表
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'quant.db');
console.log('数据库路径:', dbPath);

try {
  const db = new Database(dbPath);
  
  console.log('\n========== 开始修复外键约束 ==========');
  
  // 1. 检查当前表结构
  console.log('\n1. 检查当前表结构...');
  const currentSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='trade_reflections'").get();
  console.log('当前表定义:\n', currentSchema.sql);
  
  // 2. 备份现有数据（如果有）
  console.log('\n2. 备份现有数据...');
  const existingData = db.prepare('SELECT * FROM trade_reflections').all();
  console.log(`找到 ${existingData.length} 条现有记录`);
  
  // 3. 删除旧表
  console.log('\n3. 删除旧表...');
  db.prepare('DROP TABLE IF EXISTS trade_reflections').run();
  console.log('✅ 旧表已删除');
  
  // 4. 创建新表（无外键约束）
  console.log('\n4. 创建新表（无外键约束）...');
  db.prepare(`
    CREATE TABLE trade_reflections (
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
    )
  `).run();
  console.log('✅ 新表已创建（无外键约束）');
  
  // 5. 重建索引
  console.log('\n5. 重建索引...');
  db.prepare('CREATE INDEX IF NOT EXISTS idx_reflections_decision ON trade_reflections(decision_id)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_reflections_symbol ON trade_reflections(symbol)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_reflections_outcome ON trade_reflections(outcome)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_reflections_created ON trade_reflections(created_at DESC)').run();
  console.log('✅ 索引已重建');
  
  // 6. 恢复数据（如果有）
  if (existingData.length > 0) {
    console.log('\n6. 恢复数据...');
    const insertStmt = db.prepare(`
      INSERT INTO trade_reflections (
        id, decision_id, symbol, action, outcome, reasoning, market_conditions,
        pnl_amount, pnl_percentage, holding_time_minutes,
        entry_price, exit_price, entry_ts, exit_ts,
        mistakes, insights, improvement,
        confidence, leverage, size_usdt, actual_vs_expected,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const row of existingData) {
      insertStmt.run(
        row.id, row.decision_id, row.symbol, row.action, row.outcome,
        row.reasoning, row.market_conditions, row.pnl_amount, row.pnl_percentage,
        row.holding_time_minutes, row.entry_price, row.exit_price,
        row.entry_ts, row.exit_ts, row.mistakes, row.insights, row.improvement,
        row.confidence, row.leverage, row.size_usdt, row.actual_vs_expected,
        row.created_at
      );
    }
    console.log(`✅ 已恢复 ${existingData.length} 条记录`);
  }
  
  // 7. 验证新表结构
  console.log('\n7. 验证新表结构...');
  const newSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='trade_reflections'").get();
  console.log('新表定义:\n', newSchema.sql);
  
  const fkInfo = db.prepare("PRAGMA foreign_key_list(trade_reflections)").all();
  console.log('\n外键约束:', fkInfo.length > 0 ? fkInfo : '无 ✅');
  
  // 8. 测试插入
  console.log('\n8. 测试插入...');
  const testRecord = {
    decision_id: 'test-' + Date.now(),
    symbol: 'BTC',
    action: 'OPEN_LONG',
    outcome: 'pending',
    reasoning: '测试记录',
    entry_price: 100000,
    entry_ts: Date.now(),
    confidence: 75,
    leverage: 5,
    size_usdt: 500,
    created_at: Date.now()
  };
  
  const testStmt = db.prepare(`
    INSERT INTO trade_reflections (
      decision_id, symbol, action, outcome, reasoning,
      entry_price, entry_ts, confidence, leverage, size_usdt, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  try {
    const result = testStmt.run(
      testRecord.decision_id,
      testRecord.symbol,
      testRecord.action,
      testRecord.outcome,
      testRecord.reasoning,
      testRecord.entry_price,
      testRecord.entry_ts,
      testRecord.confidence,
      testRecord.leverage,
      testRecord.size_usdt,
      testRecord.created_at
    );
    
    console.log('✅ 测试插入成功!');
    console.log('插入的ID:', result.lastInsertRowid);
    
    // 删除测试记录
    db.prepare('DELETE FROM trade_reflections WHERE decision_id = ?').run(testRecord.decision_id);
    console.log('✅ 测试记录已清理');
    
  } catch (error) {
    console.error('❌ 测试插入失败:', error);
  }
  
  console.log('\n========== 修复完成 ✅ ==========');
  console.log('trade_reflections表已重建，外键约束已移除');
  console.log('现在可以正常记录反思数据了！');
  
  db.close();
  
} catch (error) {
  console.error('修复失败:', error);
  process.exit(1);
}

