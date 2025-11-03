/**
 * 交易反思系统初始化脚本
 * 
 * 功能：
 * 1. 检查数据库表是否已创建
 * 2. 创建初始提示词版本（v1.0）
 * 3. 验证系统功能
 */

import { getDb, insertPromptVersion, getActivePromptVersion } from '../src/lib/db';
import { composePrompt } from '../src/lib/ai-trading-prompt';

async function initReflectionSystem() {
  console.log('🚀 开始初始化交易反思系统...\n');

  try {
    // 1. 检查数据库连接
    console.log('📦 步骤1：检查数据库连接...');
    const db = getDb();
    console.log('✅ 数据库连接成功\n');

    // 2. 验证表结构
    console.log('📋 步骤2：验证表结构...');
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name IN ('trade_reflections', 'prompt_versions')
    `).all() as { name: string }[];
    
    console.log(`✅ 找到${tables.length}个必需的表:`);
    tables.forEach(t => console.log(`   - ${t.name}`));
    
    if (tables.length !== 2) {
      console.error('❌ 表结构不完整，请重启应用以自动创建表');
      process.exit(1);
    }
    console.log();

    // 3. 创建初始提示词版本
    console.log('📝 步骤3：创建初始提示词版本...');
    const existingVersion = getActivePromptVersion();
    
    if (existingVersion) {
      console.log(`⚠️  已存在活跃版本: ${existingVersion.version}`);
      console.log(`   创建时间: ${new Date(existingVersion.created_at).toLocaleString()}`);
      console.log(`   总交易数: ${existingVersion.total_trades || 0}`);
      console.log(`   胜率: ${existingVersion.win_rate ? existingVersion.win_rate.toFixed(2) + '%' : 'N/A'}`);
    } else {
      console.log('创建v1.0基础版本...');
      
      // 生成示例提示词内容
      const samplePrompt = composePrompt(
        '示例市场数据',
        1,
        0
      );
      
      insertPromptVersion({
        version: 'v1.0',
        prompt_content: samplePrompt,
        performance_metrics: JSON.stringify({
          description: '基础提示词版本',
          features: [
            '单币种分析模式',
            '技术指标集成（EMA、MACD、RSI、ATR）',
            '情绪数据分析（资金费率、持仓量）',
            '强制止盈止损规则',
            '资金管理和风险控制'
          ]
        }),
        is_active: true,
        created_at: Date.now()
      });
      
      console.log('✅ 版本v1.0已创建并设为活跃');
    }
    console.log();

    // 4. 显示统计信息
    console.log('📊 步骤4：查询当前统计...');
    const reflectionCount = db.prepare('SELECT COUNT(*) as count FROM trade_reflections').get() as { count: number };
    const pendingCount = db.prepare("SELECT COUNT(*) as count FROM trade_reflections WHERE outcome = 'pending'").get() as { count: number };
    const completedCount = db.prepare("SELECT COUNT(*) as count FROM trade_reflections WHERE outcome != 'pending'").get() as { count: number };
    
    console.log(`   总反思记录: ${reflectionCount.count}`);
    console.log(`   待定交易: ${pendingCount.count}`);
    console.log(`   已完成交易: ${completedCount.count}`);
    console.log();

    // 5. 验证API接口
    console.log('🔌 步骤5：验证核心模块...');
    try {
      const { generateReflectionSummary } = await import('../src/lib/trade-reflection');
      const summary = generateReflectionSummary({ days: 7 });
      console.log('✅ 反思模块加载成功');
      console.log(`   最近7天交易: ${summary.stats.totalTrades}笔`);
      console.log(`   胜率: ${summary.stats.winRate.toFixed(2)}%`);
      console.log(`   总盈亏: $${summary.stats.totalPnl.toFixed(2)}`);
    } catch (error) {
      console.error('❌ 反思模块加载失败:', error);
      process.exit(1);
    }
    console.log();

    // 6. 完成
    console.log('🎉 初始化完成！\n');
    console.log('📖 使用指南:');
    console.log('   1. 访问 http://localhost:3000/reflections 查看反思报告');
    console.log('   2. API文档: docs/REFLECTION_SYSTEM_GUIDE.md');
    console.log('   3. 开始交易后，系统会自动记录和分析\n');

    console.log('🔧 推荐设置:');
    console.log('   - 添加定时任务：每5分钟自动更新交易结果');
    console.log('   - 每日查看反思报告，关注常见错误');
    console.log('   - 根据反思数据优化提示词\n');

  } catch (error) {
    console.error('❌ 初始化失败:', error);
    process.exit(1);
  }
}

// 运行初始化
initReflectionSystem().then(() => {
  console.log('✨ 反思学习系统已就绪！');
  process.exit(0);
}).catch((error) => {
  console.error('💥 严重错误:', error);
  process.exit(1);
});

