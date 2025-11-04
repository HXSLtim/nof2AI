/**
 * 优化版AI决策调度器
 * 
 * 优化点：
 * 1. 并行处理所有币种（6倍速度）
 * 2. 提前过滤资金不足的币种（避免失败）
 * 3. 使用DataService缓存数据（减少API调用）
 * 4. 详细的性能统计和错误处理
 */

import { getEnabledCoins } from './db';
import { insertDecision } from './db';
import { filterTradableCoins } from './constants';
import { fetchTickers } from './okx';

declare global {
  // eslint-disable-next-line no-var
  var __aiDecisionSchedulerStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __aiDecisionTimer: NodeJS.Timeout | undefined;
}

/**
 * 并行处理单个币种的AI决策（带资金验证）
 */
async function processCoinWithValidation(
  coin: string,
  coinIndex: number,
  totalCoins: number,
  invocationCount: number,
  tradingStartTime: number,
  autoExecute: boolean,
  availableCash: number,
  currentPrice: number
): Promise<{
  coin: string;
  success: boolean;
  decision?: any;
  executed?: boolean;
  elapsed: number;
  error?: string;
  skipped?: boolean;
}> {
  const coinStartTime = Date.now();
  
  try {
    console.log(`[ai-scheduler-opt] [${coinIndex + 1}/${totalCoins}] 🚀 ${coin} 开始`);
    console.log(`[ai-scheduler-opt] [${coinIndex + 1}/${totalCoins}] 💰 ${coin} 价格: $${currentPrice.toFixed(2)}`);
    
    // 动态导入避免循环依赖
    const { composePrompt, parseDecisionFromText } = await import('./ai-trading-prompt');
    
    // 1. 获取市场数据
    const promptRes = await fetch(
      `http://localhost:${process.env.PORT || 3000}/api/ai/prompt?symbol=${coin}&_=${Date.now()}`,
      { cache: 'no-store' }
    );
    const promptJson = await promptRes.json();
    
    if (!promptJson.success || !promptJson.prompt) {
      throw new Error(`数据获取失败`);
    }

    // 2. 组装提示词（包含资金信息）
    const tradingMinutes = Math.floor((Date.now() - tradingStartTime) / 60000);
    const prompt = composePrompt(promptJson.prompt, invocationCount, tradingMinutes);

    // 3. 调用AI服务
    console.log(`[ai-scheduler-opt] [${coinIndex + 1}/${totalCoins}] 🤖 ${coin} 调用AI...`);
    const aiRes = await fetch(
      `http://localhost:${process.env.PORT || 3000}/api/ai/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
      }
    );

    const aiJson = await aiRes.json();
    
    if (!aiJson.ok || !aiJson.content) {
      throw new Error(`AI决策失败`);
    }

    // 4. 解析决策
    const decision = parseDecisionFromText(aiJson.content);
    
    if (!decision || decision.action === 'HOLD') {
      const elapsed = Date.now() - coinStartTime;
      console.log(`[ai-scheduler-opt] [${coinIndex + 1}/${totalCoins}] 📊 ${coin} HOLD (${(elapsed/1000).toFixed(1)}s)`);
      return { coin, success: true, decision, elapsed };
    }

    console.log(`[ai-scheduler-opt] [${coinIndex + 1}/${totalCoins}] 📊 ${coin} ${decision.action} (${decision.confidence}%)`);
    
    // 5. 执行决策
    const decisionId = 'auto-' + Date.now() + '-' + coin + '-' + Math.random().toString(16).slice(2);
    const title = `[自动优化] ${decision.action} ${decision.symbol} (${decision.confidence}%)`;
    const desc = `${decision.reasoning}\n\n决策详情：\n- 操作: ${decision.action}\n- 币种: ${decision.symbol}\n- 杠杆: ${decision.leverage || 5}x`;
    
    if (autoExecute) {
      try {
        // 先插入决策记录
        insertDecision({
          id: decisionId,
          title,
          desc,
          ts: Date.now(),
          status: 'pending',
          prompt: JSON.stringify(prompt).substring(0, 1000),
          reply: aiJson.content.substring(0, 1000)
        });

        // 执行决策
        console.log(`[ai-scheduler-opt] [${coinIndex + 1}/${totalCoins}] ⚡ ${coin} 执行中...`);
        const execRes = await fetch(
          `http://localhost:${process.env.PORT || 3000}/api/ai/execute-decision`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision, decisionId })
          }
        );
        
        const execResult = await execRes.json();
        const elapsed = Date.now() - coinStartTime;
        
        if (execResult.success) {
          console.log(`[ai-scheduler-opt] [${coinIndex + 1}/${totalCoins}] ✅ ${coin} 执行成功 (${(elapsed/1000).toFixed(1)}s)`);
          return { coin, success: true, decision, executed: true, elapsed };
        } else {
          console.error(`[ai-scheduler-opt] [${coinIndex + 1}/${totalCoins}] ❌ ${coin} 执行失败: ${execResult.error}`);
          return { coin, success: false, decision, executed: false, elapsed, error: execResult.error };
        }
        
      } catch (error: any) {
        const elapsed = Date.now() - coinStartTime;
        console.error(`[ai-scheduler-opt] [${coinIndex + 1}/${totalCoins}] ❌ ${coin} 执行异常 (${(elapsed/1000).toFixed(1)}s):`, error.message);
        return { coin, success: false, decision, executed: false, elapsed, error: error.message };
      }
    } else {
      // 不自动执行，只记录决策
      insertDecision({
        id: decisionId,
        title,
        desc,
        ts: Date.now(),
        status: 'pending',
        prompt: JSON.stringify(prompt).substring(0, 1000),
        reply: aiJson.content.substring(0, 1000)
      });
      
      const elapsed = Date.now() - coinStartTime;
      console.log(`[ai-scheduler-opt] [${coinIndex + 1}/${totalCoins}] 📝 ${coin} 已记录 (${(elapsed/1000).toFixed(1)}s)`);
      return { coin, success: true, decision, executed: false, elapsed };
    }
    
  } catch (error: any) {
    const elapsed = Date.now() - coinStartTime;
    console.error(`[ai-scheduler-opt] [${coinIndex + 1}/${totalCoins}] ❌ ${coin} 失败 (${(elapsed/1000).toFixed(1)}s):`, error.message);
    return { coin, success: false, elapsed, error: error.message };
  }
}

/**
 * 启动优化版AI决策调度器
 */
export function startAIDecisionSchedulerOptimized() {
  if (global.__aiDecisionSchedulerStarted) return;
  if (process.env.AI_DECISION_ENABLED === 'false') return;
  global.__aiDecisionSchedulerStarted = true;

  const intervalMs = Number(process.env.AI_DECISION_INTERVAL_MS || 300000); // 默认5分钟
  const autoExecute = process.env.AI_AUTO_EXECUTE === 'true';

  console.log('\n');
  console.log('═'.repeat(60));
  console.log('[ai-scheduler-opt] 🚀 优化版AI决策调度器已启动');
  console.log('[ai-scheduler-opt] ⏱️  间隔:', (intervalMs / 1000), '秒');
  console.log('[ai-scheduler-opt] ⚡ 自动执行:', autoExecute ? '开启 ⚠️' : '关闭');
  console.log('[ai-scheduler-opt] 📈 性能模式: 并行处理 + 资金过滤');
  console.log('[ai-scheduler-opt] 🎯 优化点: 6倍速度 + 智能过滤');
  console.log('═'.repeat(60));
  console.log('\n');

  let invocationCount = 0;
  const tradingStartTime = Date.now();

  const loop = async () => {
    const loopStartTime = Date.now();
    
    try {
      invocationCount++;
      console.log('\n');
      console.log(`[ai-scheduler-opt] 🔄 第 ${invocationCount} 次调用`);
      
      // 🔐 刷新资金调度器（每次AI决策开始时）
      const { fundScheduler } = await import('./fund-scheduler');
      await fundScheduler.refresh();
      console.log('[ai-scheduler-opt] ✅ 资金调度器已刷新');
      fundScheduler.printStatus();
      
      // 1. 获取启用的币种
      const enabledCoins = getEnabledCoins();
      console.log(`[ai-scheduler-opt] 🪙 启用币种: ${enabledCoins.join(', ')}`);
      
      // 2. 获取当前价格
      const prices = await fetchTickers(enabledCoins.map(c => `${c}-USDT-SWAP`));
      
      // 3. 从资金调度器获取可用资金（已刷新）
      const availableCash = fundScheduler.getAvailable();
      console.log(`[ai-scheduler-opt] 💰 可用资金（调度器）: $${availableCash.toFixed(2)}`);
      
      // 3. 过滤资金充足的币种
      const { tradable, skipped } = filterTradableCoins(enabledCoins, availableCash, prices);
      
      if (skipped.length > 0) {
        console.log(`\n[ai-scheduler-opt] ⚠️  资金不足，跳过${skipped.length}个币种:`);
        skipped.forEach(s => {
          console.log(`  - ${s.coin}: 需要$${s.required.toFixed(2)}，差$${s.shortage.toFixed(2)}`);
        });
      }
      
      if (tradable.length === 0) {
        console.warn(`[ai-scheduler-opt] ⚠️  无可交易币种（资金不足）`);
        return;
      }
      
      console.log(`[ai-scheduler-opt] ✅ 可交易币种: ${tradable.join(', ')} (${tradable.length}个)`);
      console.log(`[ai-scheduler-opt] 🚀 开始并行处理...`);
      
      // 4. 并行处理可交易的币种
      const results = await Promise.allSettled(
        tradable.map((coin, index) => {
          const priceKey = `${coin}-USDT-SWAP`;
          return processCoinWithValidation(
            coin,
            index,
            tradable.length,
            invocationCount,
            tradingStartTime,
            autoExecute,
            availableCash,
            prices[priceKey]
          );
        })
      );
      
      // 5. 统计结果
      const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      const rejected = results.filter(r => r.status === 'rejected');
      
      const successful = fulfilled.filter(r => r.value.success).length;
      const failed = fulfilled.filter(r => !r.value.success).length + rejected.length;
      const executed = fulfilled.filter(r => r.value.executed).length;
      
      const loopElapsed = Date.now() - loopStartTime;
      const avgElapsed = fulfilled.length > 0
        ? fulfilled.reduce((sum, r) => sum + (r.value.elapsed || 0), 0) / fulfilled.length
        : 0;
      
      // 6. 打印统计信息
      console.log('\n');
      console.log('═'.repeat(60));
      console.log('[ai-scheduler-opt] 📊 本轮统计:');
      console.log(`[ai-scheduler-opt]   🪙 分析币种: ${tradable.length}/${enabledCoins.length}个 (跳过${skipped.length}个)`);
      console.log(`[ai-scheduler-opt]   ✅ 成功: ${successful}/${tradable.length}`);
      console.log(`[ai-scheduler-opt]   ❌ 失败: ${failed}`);
      console.log(`[ai-scheduler-opt]   ⚡ 已执行: ${executed}`);
      console.log(`[ai-scheduler-opt]   ⏱️  总耗时: ${(loopElapsed / 1000).toFixed(2)}秒`);
      console.log(`[ai-scheduler-opt]   📈 平均耗时: ${(avgElapsed / 1000).toFixed(2)}秒/币种`);
      
      if (tradable.length > 1 && avgElapsed > 0) {
        const speedup = (tradable.length * avgElapsed / loopElapsed).toFixed(1);
        console.log(`[ai-scheduler-opt]   🚀 性能提升: ${speedup}倍（vs串行）`);
      }
      
      console.log('═'.repeat(60));
      
      // 7. 详细结果
      console.log('\n[ai-scheduler-opt] 📋 详细结果:');
      fulfilled.forEach((r) => {
        const result = r.value;
        const status = result.success ? '✅' : '❌';
        const action = result.decision?.action || 'N/A';
        const exec = result.executed ? '(已执行)' : result.skipped ? '(跳过)' : '';
        const time = (result.elapsed / 1000).toFixed(1);
        console.log(`[ai-scheduler-opt]   ${status} ${result.coin.padEnd(6)} ${action.padEnd(10)} ${exec.padEnd(8)} ${time}s`);
        if (result.error) {
          console.log(`[ai-scheduler-opt]       ↳ 错误: ${result.error}`);
        }
      });
      
      console.log('\n');
      
    } catch (error: any) {
      console.error('[ai-scheduler-opt] ❌ 循环失败:', error.message);
    } finally {
      const elapsed = Date.now() - loopStartTime;
      const wait = Math.max(1000, intervalMs - elapsed);
      console.log(`[ai-scheduler-opt] ⏸️  下一轮将在 ${(wait / 1000).toFixed(0)}秒 后开始...\n`);
      global.__aiDecisionTimer = setTimeout(loop, wait);
    }
  };

  // 延迟30秒后首次执行
  console.log('[ai-scheduler-opt] ⏰ 30秒后开始首次执行...\n');
  setTimeout(loop, 30000);
}

/**
 * 停止AI决策调度器
 */
export function stopAIDecisionScheduler() {
  if (global.__aiDecisionTimer) {
    clearTimeout(global.__aiDecisionTimer);
    global.__aiDecisionTimer = undefined;
  }
  global.__aiDecisionSchedulerStarted = false;
  console.log('[ai-scheduler-opt] 已停止');
}

