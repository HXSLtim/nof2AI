"use client";

import { useState } from 'react';
import { Typography, List, Tag, Space, Button } from 'antd';

const { Text } = Typography;

/**
 * AI 决策面板（占位实现）
 * @description 展示 AI 做出的交易/风控决策列表；后续可从 `/api/ai/decisions` 拉取。
 * @remarks 布局使用列式 flex，容器高度 100%，列表区域可滚动。
 */
export default function AIDecisions() {
  type Decision = { id: string; title: string; desc: string; ts: number; status: 'pending' | 'approved' | 'rejected' };
  const [items, setItems] = useState<Decision[]>([]);

  const mock = () => {
    const now = Date.now();
    const next: Decision = {
      id: String(now),
      title: '开仓建议：BTC 多头',
      desc: '信号：动量突破 + 资金流入；建议 2% 仓位，止损 1.5%。',
      ts: now,
      status: 'pending'
    };
    setItems((arr) => [next, ...arr]);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Space>
        <Button type="primary" onClick={mock}>生成一个示例决策</Button>
      </Space>
      <div style={{ flex: 1, overflow: 'auto', border: '1px solid #1a1d26', borderRadius: 6, padding: 8, background: '#0f1116' }}>
        {items.length === 0 ? (
          <Text style={{ color: '#a1a9b7' }}>暂无决策，点击上方按钮生成示例</Text>
        ) : (
          <List
            dataSource={items}
            renderItem={(d) => (
              <List.Item style={{ borderBlockEnd: '1px solid #1a1d26' }}>
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  <Space align="center" style={{ justifyContent: 'space-between' }}>
                    <Text style={{ color: '#00e676' }}>{d.title}</Text>
                    <Tag color={d.status === 'approved' ? 'green' : d.status === 'rejected' ? 'red' : 'default'}>
                      {d.status === 'approved' ? '已通过' : d.status === 'rejected' ? '已拒绝' : '待处理'}
                    </Tag>
                  </Space>
                  <Text style={{ color: '#a1a9b7' }}>{d.desc}</Text>
                  <Text style={{ color: '#6b7280', fontSize: 12 }}>{new Date(d.ts).toLocaleString()}</Text>
                </Space>
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  );
}