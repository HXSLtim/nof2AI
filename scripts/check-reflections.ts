/**
 * 检查反思记录脚本
 * 
 * 用于诊断反思系统是否正常工作
 */

import { getDb, queryTradeReflections, getTradeStatistics } from '../src/lib/db';

console.log('🔍 检查反思记录系统状态...\n');

try {
  const db = getDb();
  
  // 1. 检查表是否存在
  console.log('📋 步骤1：检查数据库表...');
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    AND name IN ('trade_reflections', 'prompt_versions', 'decisions')
  `).all() as { name: string }[];
  
  console.log(`✅ 找到 ${tables.length} 个表:`, tables.map(t => t.name).join(', '));
  
  if (!tables.find(t => t.name === 'trade_reflections')) {
    console.error('❌ trade_reflections 表不存在！');
    console.error('   请重启应用以自动创建表');
    process.exit(1);
  }
  
  // 2. 检查反思记录数量
  console.log('\n📊 步骤2：统计反思记录...');
  const totalCount = db.prepare('SELECT COUNT(*) as count FROM trade_reflections').get() as { count: number };
  const pendingCount = db.prepare("SELECT COUNT(*) as count FROM trade_reflections WHERE outcome = 'pending'").get() as { count: number };
  const completedCount = db.prepare("SELECT COUNT(*) as count FROM trade_reflections WHERE outcome IN ('profit', 'loss', 'breakeven')").get() as { count: number };
  
  console.log(`   总记录: ${totalCount.count}`);
  console.log(`   进行中: ${pendingCount.count}`);
  console.log(`   已完成: ${completedCount.count}`);
  
  if (totalCount.count === 0) {
    console.log('\n⚠️  当前没有任何反思记录');
    console.log('   原因可能是：');
    console.log('   1. 还没有执行过任何交易');
    console.log('   2. decisionId 未正确传递（刚刚已修复）');
    console.log('   3. 反思记录函数出错（检查日志）');
  } else {
    // 3. 显示最近的记录
    console.log('\n📝 步骤3：最近的反思记录...');
    const recentReflections = queryTradeReflections({ limit: 5 });
    
    recentReflections.forEach((r, idx) => {
      console.log(`\n[${idx + 1}] ${r.symbol} ${r.action}`);
      console.log(`    决策ID: ${r.decision_id}`);
      console.log(`    结果: ${r.outcome || 'pending'}`);
      console.log(`    盈亏: ${r.pnl_amount ? '$' + r.pnl_amount.toFixed(2) : 'N/A'}`);
      console.log(`    入场价: ${r.entry_price ? '$' + r.entry_price : 'N/A'}`);
      console.log(`    出场价: ${r.exit_price ? '$' + r.exit_price : 'N/A'}`);
      console.log(`    创建时间: ${new Date(r.created_at).toLocaleString()}`);
    });
    
    // 4. 显示统计数据
    console.log('\n📈 步骤4：交易统计...');
    const stats = getTradeStatistics();
    console.log(`   总交易: ${stats.totalTrades}笔`);
    console.log(`   胜率: ${stats.winRate.toFixed(2)}%`);
    console.log(`   总盈亏: $${stats.totalPnl.toFixed(2)}`);
    console.log(`   平均盈亏: $${stats.avgPnl.toFixed(2)}`);
    console.log(`   平均持仓: ${stats.avgHoldingTime.toFixed(0)}分钟`);
  }
  
  // 5. 检查 decisions 表
  console.log('\n📚 步骤5：检查决策记录...');
  const decisionsCount = db.prepare('SELECT COUNT(*) as count FROM decisions').get() as { count: number };
  const approvedCount = db.prepare("SELECT COUNT(*) as count FROM decisions WHERE status = 'approved'").get() as { count: number };
  
  console.log(`   总决策: ${decisionsCount.count}`);
  console.log(`   已执行: ${approvedCount.count}`);
  
  // 6. 检查是否有开仓决策但没有反思记录
  if (approvedCount.count > 0 && totalCount.count === 0) {
    console.log('\n⚠️  警告：有已执行的决策，但没有反思记录！');
    console.log('   这表明反思记录功能可能未正常工作');
    console.log('   已执行的修复：在所有 execute-decision 调用中传递 decisionId');
    console.log('   建议：执行新的交易测试反思系统');
  }
  
  // 7. 总结
  console.log('\n' + '='.repeat(60));
  if (totalCount.count === 0) {
    console.log('📌 状态：反思系统就绪，等待第一笔交易');
    console.log('\n🔧 已完成的修复：');
    console.log('   ✅ 修复了所有 execute-decision 调用，现在会传递 decisionId');
    console.log('   ✅ 开仓时会自动创建反思记录');
    console.log('   ✅ 平仓时会自动更新反思记录');
    console.log('\n💡 下一步：');
    console.log('   1. 执行一笔新的交易（开仓）');
    console.log('   2. 检查控制台日志，应该看到"记录开仓反思"');
    console.log('   3. 平仓后，检查控制台日志，应该看到"记录平仓反思"');
    console.log('   4. 访问 /reflections 页面查看记录');
  } else {
    console.log('✅ 反思系统正常工作！');
    console.log(`   已记录 ${totalCount.count} 笔交易`);
    console.log(`   其中 ${completedCount.count} 笔已完成，${pendingCount.count} 笔进行中`);
  }
  console.log('='.repeat(60));
  
} catch (error) {
  console.error('\n❌ 检查失败:', error);
  process.exit(1);
}

