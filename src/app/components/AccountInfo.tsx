"use client";

import { useEffect, useState } from 'react';
import { Typography, Space, Card, Statistic, Row, Col } from 'antd';

const { Text } = Typography;

/**
 * 账户和价格信息面板
 * @description 显示账户总金额和主流币种价格信息
 */
export default function AccountInfo() {
  const [accountTotal, setAccountTotal] = useState<number>(0);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // 主流币种映射
  const coinNames: Record<string, string> = {
    'BTC': 'Bitcoin',
    'ETH': 'Ethereum',
    'SOL': 'Solana',
    'BNB': 'BNB',
    'XRP': 'Ripple',
    'DOGE': 'Dogecoin'
  };

  // 获取账户总金额（从数据库读取最新记录，不调用OKX API）
  const fetchAccountTotal = async () => {
    try {
      const res = await fetch('/api/equity?hours=1&_=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data && data.data.length > 0) {
          // 获取最新的一条记录
          const latest = data.data[data.data.length - 1];
          setAccountTotal(latest.total);
        }
      }
    } catch (error) {
      console.error('Failed to fetch account total:', error);
    }
  };

  // 获取价格信息
  const fetchPrices = async () => {
    try {
      const res = await fetch('/api/prices', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        // 数据格式是 Record<string, number>，不是 {last, change}
        setPrices(data || {});
      } else {
        console.error('Failed to fetch prices:', res.status);
        setPrices({});
      }
    } catch (error) {
      console.error('Failed to fetch prices:', error);
      setPrices({});
    }
  };

  // 初始化数据
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchAccountTotal(),
        fetchPrices()
      ]);
      setLoading(false);
    };

    loadData();

    // 每1分钟更新一次（与后端scheduler同步）
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateRows: '1fr 1fr', gap: 12, minHeight: '400px' }}>
      {/* 账户总金额 - 同步高度 */}
      <Card
        size="small"
        style={{
          background: 'linear-gradient(135deg, #0f1116 0%, #1a1d26 100%)',
          border: '1px solid #1a1d26',
          boxShadow: '0 2px 8px rgba(0, 230, 118, 0.1)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
        styles={{ body: { padding: 16, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' } }}
      >
        <Statistic
          title={
            <Space>
              <Text style={{ color: '#00e676', fontSize: 12, fontWeight: 'bold' }}>
                账户总金额
              </Text>
              <Text style={{ color: '#a1a9b7', fontSize: 11 }}>(USDT)</Text>
            </Space>
          }
          value={accountTotal}
          precision={2}
          valueStyle={{
            color: '#ffffff',
            fontSize: 22,
            fontWeight: 'bold',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.3)'
          }}
          loading={loading}
        />
      </Card>

      {/* 主流币种价格 - 同步高度 */}
      <Card
        size="small"
        style={{
          background: '#0f1116',
          border: '1px solid #1a1d26',
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
        styles={{ body: { padding: 12, flex: 1, overflow: 'auto' } }}
        title={<Text style={{ color: '#00e676', fontSize: 12 }}>主流币种价格</Text>}
      >
        <Row gutter={[12, 12]} style={{ height: 'auto' }}>
          {Object.entries(coinNames).map(([symbol, name]) => {
            const priceKey = `${symbol}-USDT-SWAP`;
            const price = prices[priceKey];
            const isLoading = loading || price === undefined;
            const displayPrice = isLoading ? 0 : price;

            return (
              <Col xs={24} sm={12} md={12} lg={12} xl={12} key={symbol}>
                <Card
                  size="small"
                  style={{
                    background: '#0a0c10',
                    border: '1px solid #1a1d26',
                    borderRadius: 6,
                    minHeight: '80px',
                    opacity: isLoading ? 0.7 : 1
                  }}
                  styles={{ body: { padding: '12px 8px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' } }}
                >
                  <Statistic
                    title={
                      <Text style={{ color: '#00e676', fontSize: 11, fontWeight: 'bold' }}>
                        {symbol}
                      </Text>
                    }
                    value={displayPrice}
                    precision={displayPrice > 1000 ? 0 : 2}
                    prefix="$"
                    valueStyle={{
                      color: '#ffffff',
                      fontSize: 14,
                      fontWeight: 'bold',
                      wordBreak: 'break-all'
                    }}
                    loading={isLoading}
                  />
                </Card>
              </Col>
            );
          })}
      </Row>
      </Card>
    </div>
  );
}