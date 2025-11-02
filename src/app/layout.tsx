import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider, App } from 'antd';
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
  // 在 Node 运行时异步启动调度器（动态导入，避免 Edge 构建引入 Node 依赖）
  if (typeof window === 'undefined') {
    import('@/lib/scheduler')
      .then((m) => m.startEquityScheduler())
      .catch((e) => {
        console.error('[layout] failed to start equity scheduler', e);
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
            <App>{children}</App>
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
