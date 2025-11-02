import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider, App } from 'antd';
import './globals.css';
import { startEquityScheduler } from '@/lib/scheduler';

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
  // 启动服务器端自动采集调度器（仅初始化一次）
  startEquityScheduler();
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
