import { insertEquity } from '@/lib/db';
import { fetchAccountTotal } from '@/lib/okx';
import { collectAllData, cleanupOldData } from '@/lib/data-collector';

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
   * @remarks 默认 60000ms（1分钟）；可通过环境变量 `EQUITY_SCHEDULER_MS` 覆盖
   */
  const intervalMs = Number(process.env.EQUITY_SCHEDULER_MS || 60000); // 60000ms = 1分钟

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

  // 采集间隔（默认3分钟）
  const intervalMs = Number(process.env.DATA_COLLECTOR_MS || 180000);

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

  const daysToKeep = Number(process.env.DATA_CLEANUP_DAYS || 7);
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

  const intervalMs = Number(process.env.AI_DECISION_INTERVAL_MS || 300000); // 默认5分钟
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
      console.log(`[ai-decision-scheduler] 第 ${invocationCount} 次调用，交易时长: ${Math.floor((started - tradingStartTime) / 60000)} 分钟`);

      // 动态导入避免循环依赖
      const { composePrompt, parseDecisionsFromText } = await import('./ai-trading-prompt');
      const { insertDecision, updateDecisionStatusInDb } = await import('./db');

      // 1. 获取市场数据
      const promptRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/ai/prompt`, { cache: 'no-store' });
      const promptJson = await promptRes.json();
      
      if (!promptJson.success || !promptJson.prompt) {
        throw new Error('获取市场数据失败');
      }

      // 2. 组装提示词
      const tradingMinutes = Math.floor((started - tradingStartTime) / 60000);
      const prompt = composePrompt(promptJson.prompt, invocationCount, tradingMinutes);

      // 3. 调用AI服务
      const aiRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
      });

      const aiJson = await aiRes.json();
      
      if (!aiJson.ok || !aiJson.content) {
        throw new Error(aiJson.error || 'AI决策失败');
      }

      const aiReply = aiJson.content;

      // 4. 解析决策
      const decisions = parseDecisionsFromText(aiReply);
      console.log('[ai-decision-scheduler] 解析到', decisions.length, '个决策');

      // 5. 处理每个决策
      for (const decision of decisions) {
        const decisionId = 'auto-' + Date.now() + Math.random().toString(16).slice(2);
        
        if (decision.action !== 'HOLD') {
          console.log(`[ai-decision-scheduler] 交易决策: ${decision.symbol} ${decision.action}`);
          
          const title = `🤖 自动 - ${decision.action} ${decision.symbol} (置信度: ${decision.confidence}%)`;
          const desc = `${decision.reasoning}\n\n决策详情：\n- 币种: ${decision.symbol}\n- 杠杆: ${decision.leverage || 5}x\n- 止盈: ${decision.takeProfit || 'N/A'}\n- 止损: ${decision.stopLoss || 'N/A'}`;
          
          // 如果启用自动执行
          if (autoExecute) {
            try {
              const execRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/ai/execute-decision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision })
              });

              const execResult = await execRes.json();

              if (execResult.success) {
                insertDecision({
                  id: decisionId,
                  title,
                  desc: desc + `\n\n✅ 已自动执行 - 订单ID: ${execResult.order?.orderId}`,
                  ts: Date.now(),
                  status: 'approved',
                  prompt,
                  reply: aiReply
                });
                console.log(`✅ [ai-decision-scheduler] 已执行: ${title}`);
              } else {
                insertDecision({
                  id: decisionId,
                  title: title + ' (执行失败)',
                  desc: desc + `\n\n❌ 执行失败：${execResult.error}`,
                  ts: Date.now(),
                  status: 'rejected',
                  prompt,
                  reply: aiReply
                });
                console.error(`❌ [ai-decision-scheduler] 执行失败: ${execResult.error}`);
              }
            } catch (error) {
              console.error('[ai-decision-scheduler] 执行异常:', error);
            }
          } else {
            // 不自动执行，保存为待处理
            insertDecision({
              id: decisionId,
              title,
              desc,
              ts: Date.now(),
              status: 'pending',
              prompt,
              reply: aiReply
            });
            console.log(`[ai-decision-scheduler] 已保存待处理: ${title}`);
          }
        } else {
          // HOLD决策
          insertDecision({
            id: decisionId,
            title: `🤖 自动 - HOLD - ${decision.symbol}`,
            desc: decision.reasoning,
            ts: Date.now(),
            status: 'approved',
            prompt,
            reply: aiReply
          });
        }
        
        // 延迟避免冲突
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('[ai-decision-scheduler] 决策处理完成');

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