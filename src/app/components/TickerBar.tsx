"use client";

import { useEffect, useState } from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

/**
 * 顶部价格滚动条（主流币永续合约）
 * 每 3 秒从 `/api/prices` 拉取最新价，并在顶栏水平展示。
 */
export default function TickerBar() {
  const [prices, setPrices] = useState<Record<string, number>>({});

  /** 拉取价格 */
  const pull = async () => {
    try {
      const res = await fetch('/api/prices');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'fetch failed');
      setPrices(json || {});
    } catch (e) {
      // 忽略错误，保留上一次价格
      console.error(e);
    }
  };

  useEffect(() => {
    pull();
    const t = setInterval(pull, 3000);
    return () => clearInterval(t);
  }, []);

  const order = ['BNB-USDT-SWAP', 'BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP', 'XRP-USDT-SWAP', 'DOGE-USDT-SWAP'];

  return (
    <div
      style={{
        display: 'flex',
        gap: 24,
        alignItems: 'center',
        overflowX: 'auto',
        padding: '8px 16px',
        borderBottom: '1px solid #1a1d26',
        background: '#0f1116',
      }}
    >
      {order.map((key) => {
        const name = key.replace('-USDT-SWAP', '');
        const price = prices[key];
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: '#a1a9b7' }}>{name}</Text>
            <Text strong style={{ color: '#ffffff' }}>{
              price ? price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '-'
            }</Text>
          </div>
        );
      })}
    </div>
  );
}