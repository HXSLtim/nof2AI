/**
 * 注册阶段钩子（占位，无副作用）
 * @remarks 为避免 Edge 运行时打包 Node 模块，调度器启动已迁移到 `app/layout.tsx`（Node 运行时）。
 * 此处保留空实现以兼容 Next.js 仪表钩子机制。
 */
export async function register() {
  // no-op
}