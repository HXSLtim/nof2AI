import { startEquityScheduler } from '@/lib/scheduler';

/**
 * 注册阶段钩子：在 Next.js 服务器启动时运行。
 *
 * 作用：确保金额曲线采集调度器在服务启动时即开启，
 * 避免仅在页面首次渲染时触发，提升稳定性。
 *
 * 环境控制：
 * - 关闭：设置 `EQUITY_SCHEDULER_ENABLED=false`
 * - 间隔：设置 `EQUITY_SCHEDULER_MS`（默认 3000ms）
 */
export async function register() {
  try {
    startEquityScheduler();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[instrumentation] failed to start equity scheduler', e);
  }
}