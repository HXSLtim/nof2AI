import { insertEquity, getDb } from '@/lib/db';
import { fetchAccountTotal } from '@/lib/okx';
import { collectAllData, cleanupOldData } from '@/lib/data-collector';
import { SCHEDULER_CONFIG } from './constants';

declare global {
  // eslint-disable-next-line no-var
  var __equitySchedulerStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __equitySchedulerTimer: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __dataCollectorStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __dataCollectorTimer: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __cleanupSchedulerStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __aiDecisionSchedulerStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __aiDecisionTimer: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __reflectionSchedulerStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __reflectionTimer: NodeJS.Timeout | undefined;
}

/**
 * 启动账户总金额自动采集调度器
 * - 默认每 1 分钟采集一次：读取 OKX `totalEq` 并写入 SQLite
 * - 仅在服务端启动，一次进程只启动一个定时器（借助 global 标记）
 * - 可通过环境变量 `EQUITY_SCHEDULER_ENABLED=false` 禁用
 * - 可通过环境变量 `EQUITY_SCHEDULER_MS` 自定义采集间隔（毫秒）
 */
export function startEquityScheduler() {
  if (global.__equitySchedulerStarted) return;
  if (process.env.EQUITY_SCHEDULER_ENABLED === 'false') return;
  global.__equitySchedulerStarted = true;

  /**
   * 采集间隔（毫秒）
   * @remarks 默认从 SCHEDULER_CONFIG 读取；可通过环境变量 `EQUITY_SCHEDULER_MS` 覆盖
   */
  const intervalMs = Number(process.env.EQUITY_SCHEDULER_MS || SCHEDULER_CONFIG.EQUITY_INTERVAL);

  /**
   * 执行一次采集并计划下一次，避免并发与时间漂移。
   * 下次触发时间 = intervalMs - 本次执行耗时（至少 100ms）。
   */
  const loop = async () => {
    const started = Date.now();
    try {
      const total = await fetchAccountTotal();
      insertEquity(Date.now(), total);
      // console.log('[equity-scheduler] snapshot', new Date().toISOString(), total); // ✅ 屏蔽
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[equity-scheduler] failed', e);
    } finally {
      const elapsed = Date.now() - started;
      const wait = Math.max(100, intervalMs - elapsed);
      global.__equitySchedulerTimer = setTimeout(loop, wait);
    }
  };

  // 立即执行一次，然后进入自调度循环
  loop();
}

/**
 * 启动市场数据采集调度器
 * - 默认每 3 分钟采集一次：获取价格、K线、计算指标并存入数据库
 * - 仅在服务端启动，一次进程只启动一个定时器
 * - 可通过环境变量 `DATA_COLLECTOR_ENABLED=false` 禁用
 * - 可通过环境变量 `DATA_COLLECTOR_MS` 自定义采集间隔（毫秒，默认180000）
 */
export function startDataCollector() {
  if (global.__dataCollectorStarted) return;
  if (process.env.DATA_COLLECTOR_ENABLED === 'false') return;
  global.__dataCollectorStarted = true;

  // 采集间隔（默认从配置读取）
  const intervalMs = Number(process.env.DATA_COLLECTOR_MS || SCHEDULER_CONFIG.DATA_COLLECTOR_INTERVAL);

  const loop = async () => {
    const started = Date.now();
    try {
      await collectAllData();
    } catch (e) {
      console.error('[data-collector] failed', e);
    } finally {
      const elapsed = Date.now() - started;
      const wait = Math.max(1000, intervalMs - elapsed);
      global.__dataCollectorTimer = setTimeout(loop, wait);
    }
  };

  // 立即执行一次
  loop();
  console.log('[data-collector] 已启动，间隔:', intervalMs, 'ms');
}

/**
 * 启动数据清理调度器
 * - 默认每天清理一次旧数据（保留最近7天）
 */
export function startCleanupScheduler() {
  if (global.__cleanupSchedulerStarted) return;
  global.__cleanupSchedulerStarted = true;

  const daysToKeep = Number(process.env.DATA_CLEANUP_DAYS || SCHEDULER_CONFIG.DATA_RETENTION_DAYS);
  const intervalMs = 24 * 3600 * 1000; // 每天一次

  const loop = () => {
    try {
      cleanupOldData(daysToKeep);
    } catch (e) {
      console.error('[cleanup-scheduler] failed', e);
    } finally {
      setTimeout(loop, intervalMs);
    }
  };

  // 延迟1小时后首次执行（避免启动时负载过高）
  setTimeout(loop, 3600 * 1000);
  console.log('[cleanup-scheduler] 已启动，保留天数:', daysToKeep);
}

/**
 * 启动AI决策自动调度器（服务端）
 * - 默认每5分钟自动请求一次AI决策
 * - 完全在服务端运行，不依赖前端
 * - 可通过环境变量 AI_DECISION_ENABLED=false 禁用
 * - 可通过环境变量 AI_DECISION_INTERVAL_MS 配置间隔（默认300000=5分钟）
 * - 可通过环境变量 AI_AUTO_EXECUTE=true 启用自动执行
 */
export function startAIDecisionScheduler() {
  if (global.__aiDecisionSchedulerStarted) return;
  if (process.env.AI_DECISION_ENABLED === 'false') return;
  global.__aiDecisionSchedulerStarted = true;

  const intervalMs = Number(process.env.AI_DECISION_INTERVAL_MS || SCHEDULER_CONFIG.AI_DECISION_INTERVAL);
  const autoExecute = process.env.AI_AUTO_EXECUTE === 'true';

  console.log('[ai-decision-scheduler] 已启动');
  console.log('[ai-decision-scheduler] 间隔:', intervalMs / 1000, '秒');
  console.log('[ai-decision-scheduler] 自动执行:', autoExecute ? '开启 ⚠️' : '关闭');

  let invocationCount = 0;
  const tradingStartTime = Date.now();

  const loop = async () => {
    const started = Date.now();
    try {
      invocationCount++;
      console.log(`[ai-decision-scheduler] 🔄 第 ${invocationCount} 次调用，单币种模式`);

      // 动态导入避免循环依赖
      const { composePrompt, parseDecisionFromText } = await import('./ai-trading-prompt');
      const { insertDecision, getEnabledCoins } = await import('./db');

      // 从数据库读取启用的币种（前后端同步）
      const enabledCoins = getEnabledCoins();
      console.log(`[ai-decision-scheduler] 启用的币种: ${enabledCoins.join(', ')}`);
      
      const allDecisions: any[] = [];
      const tradingMinutes = Math.floor((started - tradingStartTime) / 60000);
      
      // 🔧 单币种模式：只分析启用的币种
      for (let i = 0; i < enabledCoins.length; i++) {
        const coin = enabledCoins[i];
        
        // 🔧 每次分析前重新获取总资产（反映之前交易的影响）
        let currentTotal = 0;
        try {
          const equityRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/equity?hours=1&_=${Date.now()}`, { cache: 'no-store' });
          const equityData = await equityRes.json();
          if (equityData.success && equityData.data && equityData.data.length > 0) {
            currentTotal = equityData.data[equityData.data.length - 1].total;
          }
        } catch {
          console.warn(`[ai-decision-scheduler] 无法获取总资产`);
        }
        
        console.log(`[ai-decision-scheduler] [${i + 1}/${enabledCoins.length}] ${coin} (总资产: $${currentTotal.toFixed(2)})`);
        
        try {
          // 1. 获取该币种的市场数据（包含最新的可用资金）
          const promptRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/ai/prompt?symbol=${coin}&_=${Date.now()}`, { cache: 'no-store' });
          const promptJson = await promptRes.json();
          
          if (!promptJson.success || !promptJson.prompt) {
            console.warn(`[ai-decision-scheduler] ${coin} 数据获取失败`);
            continue;
          }

          // 2. 组装提示词
          const prompt = composePrompt(promptJson.prompt, invocationCount, tradingMinutes);

          // 3. 调用AI服务
          const aiRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
          });

          const aiJson = await aiRes.json();
          
          if (!aiJson.ok || !aiJson.content) {
            console.warn(`[ai-decision-scheduler] ${coin} AI决策失败`);
            continue;
          }

          const aiReply = aiJson.content;

          // 4. 解析并立即处理决策
          const decision = parseDecisionFromText(aiReply);
          if (decision) {
            console.log(`[ai-decision-scheduler] ${coin}: ${decision.action} (${decision.confidence}%)`);
            
            // 🔧 立即处理决策（不等其他币种）
            const decisionId = 'auto-' + Date.now() + '-' + coin + '-' + Math.random().toString(16).slice(2);
            
            if (decision.action !== 'HOLD') {
              // 交易决策 - 立即执行
              const title = `[自动] ${decision.action} ${decision.symbol} (${decision.confidence}%)`;
              const desc = `${decision.reasoning}\n\n决策详情：\n- 操作: ${decision.action}\n- 币种: ${decision.symbol}\n- 杠杆: ${decision.leverage || 5}x`;
              
              if (autoExecute) {
                try {
                  // 🔧 先插入决策记录（反思需要依赖这个ID）
                  insertDecision({
                    id: decisionId,
                    title,
                    desc,
                    ts: Date.now(),
                    status: 'pending',
                    prompt,
                    reply: aiReply
                  });
                  
                  const execRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/ai/execute-decision`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      decision,
                      decisionId  // 🔧 传递decisionId用于反思记录
                    })
                  });

                  const execResult = await execRes.json();

                  if (execResult.success) {
                    // 更新决策状态为已批准
                    const updateStmt = getDb().prepare('UPDATE decisions SET status = ?, desc = ? WHERE id = ?');
                    updateStmt.run('approved', desc + `\n\n已执行 - ID: ${execResult.order?.orderId}`, decisionId);
                    console.log(`[执行成功] ${coin} ${decision.action} - ID: ${execResult.order?.orderId}`);
                  } else {
                    // 更新决策状态为拒绝
                    const updateStmt = getDb().prepare('UPDATE decisions SET status = ?, title = ?, desc = ? WHERE id = ?');
                    updateStmt.run('rejected', title + ' (失败)', desc + `\n\n执行失败: ${execResult.error}`, decisionId);
                    console.error(`[执行失败] ${coin} - ${execResult.error}`);
                  }
                } catch (error) {
                  console.error(`[执行异常] ${coin}:`, error);
                  // 更新决策状态为拒绝
                  try {
                    const updateStmt = getDb().prepare('UPDATE decisions SET status = ?, title = ? WHERE id = ?');
                    updateStmt.run('rejected', title + ' (异常)', decisionId);
                  } catch {}
                }
              } else {
                insertDecision({
                  id: decisionId,
                  title,
                  desc,
                  ts: Date.now(),
                  status: 'pending',
                  prompt,
                  reply: aiReply
                });
              }
            } else {
              // HOLD决策 - 记录
              insertDecision({
                id: decisionId,
                title: `[自动] HOLD - ${coin}`,
                desc: decision.reasoning,
                ts: Date.now(),
                status: 'approved',
                prompt,
                reply: aiReply
              });
            }
            
            // 延迟避免数据库冲突
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // 延迟避免API限流（分析下一个币种前）
          if (i < enabledCoins.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          console.error(`[ai-decision-scheduler] ${coin} 处理失败:`, error);
        }
      }

      console.log('[ai-decision-scheduler] 所有币种处理完成');

    } catch (e) {
      console.error('[ai-decision-scheduler] failed', e);
    } finally {
      const elapsed = Date.now() - started;
      const wait = Math.max(1000, intervalMs - elapsed);
      global.__aiDecisionTimer = setTimeout(loop, wait);
    }
  };

  // 延迟30秒后首次执行（等待服务启动完成）
  setTimeout(loop, 30000);
}

/**
 * 启动交易反思自动更新调度器
 * - 默认每5分钟检查一次是否有被止损/止盈的仓位需要记录
 * - 自动从OKX获取历史盈亏数据并更新反思记录
 * - 可通过环境变量 REFLECTION_SCHEDULER_ENABLED=false 禁用
 * - 可通过环境变量 REFLECTION_SCHEDULER_MS 自定义间隔（默认300000=5分钟）
 */
export function startReflectionScheduler() {
  if (global.__reflectionSchedulerStarted) return;
  if (process.env.REFLECTION_SCHEDULER_ENABLED === 'false') return;
  global.__reflectionSchedulerStarted = true;

  const intervalMs = Number(process.env.REFLECTION_SCHEDULER_MS || SCHEDULER_CONFIG.AI_DECISION_INTERVAL); // 默认5分钟

  console.log('[reflection-scheduler] 已启动');
  console.log('[reflection-scheduler] 间隔:', intervalMs / 1000, '秒');

  const loop = async () => {
    const started = Date.now();
    try {
      // 动态导入避免循环依赖
      const { autoUpdateTradeOutcomes } = await import('./trade-reflection');
      await autoUpdateTradeOutcomes();
    } catch (e) {
      console.error('[reflection-scheduler] failed', e);
    } finally {
      const elapsed = Date.now() - started;
      const wait = Math.max(1000, intervalMs - elapsed);
      global.__reflectionTimer = setTimeout(loop, wait);
    }
  };

  // 延迟1分钟后首次执行（等待服务启动完成）
  setTimeout(loop, 60000);
}