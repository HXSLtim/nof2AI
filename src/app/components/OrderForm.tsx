"use client";

import { useEffect, useState } from 'react';
import { Form, InputNumber, Select, Radio, Button, Space, Typography, message, Switch } from 'antd';

const { Text } = Typography;

const SYMBOL_OPTIONS = [
  { label: 'BTC/USDT:USDT', value: 'BTC/USDT:USDT' },
  { label: 'ETH/USDT:USDT', value: 'ETH/USDT:USDT' },
  { label: 'SOL/USDT:USDT', value: 'SOL/USDT:USDT' },
  { label: 'BNB/USDT:USDT', value: 'BNB/USDT:USDT' },
];

export default function OrderForm() {
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<'market' | 'limit'>('market');
  const [tdMode, setTdMode] = useState<'cross' | 'isolated'>('cross');
  const [posSide, setPosSide] = useState<'long' | 'short'>('long');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    // 预加载账户余额（用于显示可用 USDT）
    (async () => {
      try {
        const res = await fetch('/api/equity', { cache: 'no-store' });
        const json = await res.json();
        const total = Number(json?.total);
        if (Number.isFinite(total)) setBalance(total);
      } catch {}
    })();
  }, []);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const payload: any = {
        symbol: values.symbol,
        side: values.side,
        type: values.type,
        amount: Number(values.amount),
        tdMode,
        posSide,
        reduceOnly,
      };
      if (values.type === 'limit') payload.price = Number(values.price);
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json?.ok) {
        message.success('下单成功');
      } else {
        message.error(`下单失败：${json?.message || json?.error || '未知错误'}`);
      }
    } catch (e: any) {
      message.error(`下单异常：${e?.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/orders/test', { method: 'POST' });
      const json = await res.json();
      if (res.ok && json?.ok) message.success('OKX 连接正常');
      else message.error(`连接失败：${json?.error || '未知错误'}`);
    } catch (e: any) {
      message.error(`连接异常：${e?.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Space align="center" style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: '#a1a9b7' }}>可用总额（USDT 折合）：{balance == null ? '加载中…' : balance}</Text>
        <Button size="small" onClick={testConnection} disabled={loading}>测试连接</Button>
      </Space>
      <Form layout="vertical" onFinish={onFinish} initialValues={{ symbol: SYMBOL_OPTIONS[0].value, side: 'buy', type: 'market', amount: 1 }}>
        <Form.Item label="交易对" name="symbol" rules={[{ required: true }]}> 
          <Select options={SYMBOL_OPTIONS} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="方向" name="side" rules={[{ required: true }]}> 
          <Radio.Group>
            <Radio.Button value="buy">买入</Radio.Button>
            <Radio.Button value="sell">卖出</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item label="持仓方向 (posSide)"> 
          <Radio.Group value={posSide} onChange={(e) => setPosSide(e.target.value)}>
            <Radio.Button value="long">做多</Radio.Button>
            <Radio.Button value="short">做空</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item label="保证金模式 (tdMode)"> 
          <Radio.Group value={tdMode} onChange={(e) => setTdMode(e.target.value)}>
            <Radio.Button value="cross">全仓</Radio.Button>
            <Radio.Button value="isolated">逐仓</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item label="类型" name="type" rules={[{ required: true }]}> 
          <Radio.Group onChange={(e) => setType(e.target.value)}>
            <Radio.Button value="market">市价</Radio.Button>
            <Radio.Button value="limit">限价</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item label={type === 'market' ? '数量/张数' : '数量'} name="amount" rules={[{ required: true }]}> 
          <InputNumber min={0.0001} step={0.0001} style={{ width: '100%' }} />
        </Form.Item>
        {type === 'limit' && (
          <Form.Item label="限价" name="price" rules={[{ required: true }]}> 
            <InputNumber min={0.0001} step={0.0001} style={{ width: '100%' }} />
          </Form.Item>
        )}
        <Form.Item label="仅平仓 (reduceOnly)"> 
          <Switch checked={reduceOnly} onChange={setReduceOnly} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>提交下单</Button>
        </Form.Item>
      </Form>
      <Text type="secondary" style={{ color: '#6b7280' }}>
        注意：对冲模式需提供 posSide（做多/做空）。若账户为净额模式，则无需设置 posSide。市价单的数量语义与账户设置相关，部分情况下以“张数/数量”计；若需精确下单请使用限价。
      </Text>
    </div>
  );
}