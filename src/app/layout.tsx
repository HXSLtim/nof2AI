import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider, App } from 'antd';
import { DataProvider } from '@/contexts/DataContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quant AI',
  description: 'AI-powered quantitative trading assistant',
};

/**
 * 根布局：引入 Ant Design 注册表与深色主题配置
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 在 Node 运行时异步启动所有调度器（动态导入，避免 Edge 构建引入 Node 依赖）
  if (typeof window === 'undefined') {
    // 🚀 先初始化合约信息缓存
    import('@/lib/okx-instruments')
      .then(async (m) => {
        console.log('[layout] 🔄 初始化合约信息缓存...');
        await m.initInstrumentCache();
        console.log('[layout] ✅ 合约信息缓存初始化完成');
      })
      .catch((e) => {
        console.error('[layout] ⚠️ 合约信息初始化失败:', e);
      });
    
    // 然后启动调度器
    import('@/lib/scheduler')
      .then((m) => {
        // 启动账户总金额采集（每1分钟）
        m.startEquityScheduler();
        // 启动市场数据和指标采集（每3分钟）
        m.startDataCollector();
        // 启动数据清理（每天一次）
        m.startCleanupScheduler();
        // 启动AI决策自动调度器（每5分钟，可配置）
        m.startAIDecisionScheduler();
        // 启动交易反思自动更新调度器（每5分钟，检测止损/止盈）
        m.startReflectionScheduler();
      })
      .catch((e) => {
        console.error('[layout] failed to start schedulers', e);
      });
  }
  return (
    <html lang="zh">
      <body>
        <AntdRegistry>
          {/**
           * 主题配置
           * @description 将主色（Primary）调整为绿色，以符合全局绿色主题视觉。
           */}
          <ConfigProvider theme={{ token: { colorPrimary: '#00e676', colorBgBase: '#0f1116', colorTextBase: '#ffffff' } }}>
            <App>
              <DataProvider autoRefresh={true}>
                {children}
              </DataProvider>
            </App>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}

/**
 * 声明运行时为 Node（可选）
 * @remarks 布局不再直接依赖 Node 模块，但此处声明有助于统一服务端环境。
 */
export const runtime = 'nodejs';
