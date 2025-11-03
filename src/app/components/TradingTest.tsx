"use client";

import { useState } from 'react';
import { Card, Space, Button, Select, InputNumber, Radio, App, Descriptions, Alert } from 'antd';
import { Typography } from 'antd';

const { Text } = Typography;

/**
 * 交易测试面板
 * @description 用于测试各种交易操作：开多、开空、平仓等
 */
export default function TradingTest() {
  const { message, modal } = App.useApp();
  
  const [symbol, setSymbol] = useState('BTC');
  const [action, setAction] = useState<'OPEN_LONG' | 'OPEN_SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT'>('OPEN_LONG');
  const [sizeUSD, setSizeUSD] = useState(100);
  const [leverage, setLeverage] = useState(5);
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const symbols = [
    { label: 'BTC', value: 'BTC' },
    { label: 'ETH', value: 'ETH' },
    { label: 'SOL', value: 'SOL' },
    { label: 'BNB', value: 'BNB' },
    { label: 'XRP', value: 'XRP' },
    { label: 'DOGE', value: 'DOGE' }
  ];

  const actions = [
    { label: '开多（做多）', value: 'OPEN_LONG' },
    { label: '开空（做空）', value: 'OPEN_SHORT' },
    { label: '平多（多头平仓）', value: 'CLOSE_LONG' },
    { label: '平空（空头平仓）', value: 'CLOSE_SHORT' }
  ];

  /**
   * 执行测试下单
   */
  const executeTest = async () => {
    // 确认弹窗
    modal.confirm({
      title: '确认测试下单',
      content: (
        <div>
          <p>即将执行以下操作：</p>
          <ul>
            <li>币种: {symbol}</li>
            <li>操作: {actions.find(a => a.value === action)?.label}</li>
            <li>金额: ${sizeUSD} USDT</li>
            <li>杠杆: {leverage}x</li>
          </ul>
          <Alert 
            message="注意：这将在OKX沙盒环境执行真实下单（使用虚拟资金）" 
            type="warning" 
            showIcon 
            style={{ marginTop: 12 }}
          />
        </div>
      ),
      onOk: async () => {
        setTesting(true);
        setLastResult(null);
        
        try {
          message.info('正在获取市场价格...');
          
          // 1. 获取当前价格
          const priceRes = await fetch('/api/prices', { cache: 'no-store' });
          const prices = await priceRes.json();
          const instId = `${symbol}-USDT-SWAP`;
          const currentPrice = prices[instId];
          
          if (!currentPrice) {
            throw new Error(`无法获取 ${symbol} 价格`);
          }

          message.info(`当前价格: ${currentPrice}, 准备下单...`);

          // 2. 构造下单请求
          const orderSymbol = `${symbol}/USDT:USDT`;
          let side: 'buy' | 'sell';
          let posSide: 'long' | 'short';
          let reduceOnly = false;

          switch (action) {
            case 'OPEN_LONG':
              side = 'buy';
              posSide = 'long';
              break;
            case 'OPEN_SHORT':
              side = 'sell';
              posSide = 'short';
              break;
            case 'CLOSE_LONG':
              side = 'sell';
              posSide = 'long';
              reduceOnly = true;
              break;
            case 'CLOSE_SHORT':
              side = 'buy';
              posSide = 'short';
              reduceOnly = true;
              break;
          }

          // 计算数量
          const quantity = (sizeUSD * leverage) / currentPrice;

          const orderParams = {
            symbol: orderSymbol,
            side,
            posSide,
            quantity,
            leverage,
            reduceOnly,
            currentPrice
          };

          console.log('[TradingTest] 下单参数:', orderParams);

          // 3. 调用下单API
          const orderRes = await fetch('/api/orders/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderParams)
          });

          const orderResult = await orderRes.json();
          
          if (!orderResult.success) {
            throw new Error(orderResult.error || '下单失败');
          }

          setLastResult(orderResult);
          message.success('✅ 测试下单成功！');
          console.log('[TradingTest] 下单结果:', orderResult);

        } catch (error) {
          const err = error as Error;
          message.error('下单失败: ' + err.message);
          console.error('[TradingTest]', error);
          setLastResult({ success: false, error: err.message });
        } finally {
          setTesting(false);
        }
      }
    });
  };

  return (
    <Card
      style={{ background: '#0f1116', border: '1px solid #1a1d26' }}
      title={<Text style={{ color: '#00e676' }}>交易测试</Text>}
      size="small"
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        {/* 币种选择 */}
        <div>
          <Text style={{ color: '#a1a9b7', fontSize: 12, display: 'block', marginBottom: 4 }}>币种</Text>
          <Select
            value={symbol}
            onChange={setSymbol}
            options={symbols}
            style={{ width: '100%' }}
          />
        </div>

        {/* 操作类型 */}
        <div>
          <Text style={{ color: '#a1a9b7', fontSize: 12, display: 'block', marginBottom: 4 }}>操作</Text>
          <Radio.Group
            value={action}
            onChange={(e) => setAction(e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Radio value="OPEN_LONG" style={{ color: '#00e676' }}>开多（做多）</Radio>
              <Radio value="OPEN_SHORT" style={{ color: '#ff4d4f' }}>开空（做空）</Radio>
              <Radio value="CLOSE_LONG" style={{ color: '#a1a9b7' }}>平多（多头平仓）</Radio>
              <Radio value="CLOSE_SHORT" style={{ color: '#a1a9b7' }}>平空（空头平仓）</Radio>
            </Space>
          </Radio.Group>
        </div>

        {/* 金额 */}
        <div>
          <Text style={{ color: '#a1a9b7', fontSize: 12, display: 'block', marginBottom: 4 }}>金额（USDT）</Text>
          <InputNumber
            value={sizeUSD}
            onChange={(v) => setSizeUSD(v || 100)}
            min={10}
            max={10000}
            step={10}
            style={{ width: '100%' }}
            addonAfter="USDT"
          />
        </div>

        {/* 杠杆 */}
        <div>
          <Text style={{ color: '#a1a9b7', fontSize: 12, display: 'block', marginBottom: 4 }}>杠杆</Text>
          <Select
            value={leverage}
            onChange={setLeverage}
            style={{ width: '100%' }}
            options={[
              { label: '1x', value: 1 },
              { label: '2x', value: 2 },
              { label: '3x', value: 3 },
              { label: '5x', value: 5 },
              { label: '10x', value: 10 }
            ]}
          />
        </div>

        {/* 执行按钮 */}
        <Button
          type="primary"
          onClick={executeTest}
          loading={testing}
          style={{ width: '100%' }}
          disabled={testing}
        >
          {testing ? '下单中...' : '🧪 执行测试下单'}
        </Button>

        {/* 上次结果 */}
        {lastResult && (
          <div style={{
            background: '#0a0c10',
            border: '1px solid #1a1d26',
            borderRadius: 6,
            padding: 12
          }}>
            <Text style={{ color: '#00e676', fontSize: 12, fontWeight: 'bold', display: 'block', marginBottom: 8 }}>
              上次结果
            </Text>
            {lastResult.success ? (
              <Descriptions column={1} size="small" labelStyle={{ color: '#a1a9b7' }} contentStyle={{ color: '#ffffff' }}>
                <Descriptions.Item label="订单ID">{lastResult.order?.orderId || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="状态">{lastResult.order?.status || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="交易对">{lastResult.order?.symbol || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="方向">{lastResult.order?.side || 'N/A'}</Descriptions.Item>
                <Descriptions.Item label="数量">{lastResult.order?.quantity || 'N/A'}</Descriptions.Item>
              </Descriptions>
            ) : (
              <Text style={{ color: '#ff4d4f', fontSize: 12 }}>
                ❌ {lastResult.error}
              </Text>
            )}
          </div>
        )}

        {/* 说明 */}
        <Alert
          message="测试说明"
          description={
            <div style={{ fontSize: 11 }}>
              <p>• 沙盒环境使用虚拟资金，不影响真实账户</p>
              <p>• 开仓后可以在"仓位"面板查看</p>
              <p>• 平仓前需要先有对应的仓位</p>
              <p>• 建议先小金额测试（如$100）</p>
            </div>
          }
          type="info"
          showIcon
          style={{ fontSize: 11 }}
        />
      </Space>
    </Card>
  );
}

