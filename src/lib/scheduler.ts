import { insertEquity } from '@/lib/db';
import { fetchAccountTotal } from '@/lib/okx';

declare global {
  // eslint-disable-next-line no-var
  var __equitySchedulerStarted: boolean | undefined;
  // eslint-disable-next-line no-var
  var __equitySchedulerTimer: NodeJS.Timeout | undefined;
}

/**
 * 启动账户总金额自动采集调度器
 * - 默认每 3 秒采集一次：读取 OKX `totalEq` 并写入 SQLite
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
   * @remarks 默认 3000ms；可通过环境变量 `EQUITY_SCHEDULER_MS` 覆盖
   */
  const intervalMs = Number(process.env.EQUITY_SCHEDULER_MS || 3000);

  /**
   * 执行一次采集并计划下一次，避免并发与时间漂移。
   * 下次触发时间 = intervalMs - 本次执行耗时（至少 100ms）。
   */
  const loop = async () => {
    const started = Date.now();
    try {
      const total = await fetchAccountTotal();
      insertEquity(Date.now(), total);
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log('[equity-scheduler] snapshot', new Date().toISOString(), total);
      }
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