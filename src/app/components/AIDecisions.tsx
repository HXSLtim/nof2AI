"use client";

import { useEffect, useState } from 'react';
import { Typography, Space, Button } from 'antd';
import { subscribeDecisions, getDecisions, Decision } from '@/lib/decisions';

const { Text } = Typography;

/**
 * AI 决策面板（重定向到AI聊天）
 * @description AI决策功能已集成到AI聊天面板中，此组件仅作为引导。
 */
export default function AIDecisions() {
  const [items, setItems] = useState<Decision[]>(() => getDecisions());

  useEffect(() => {
    const off = subscribeDecisions((arr) => setItems(arr));
    return () => off();
  }, []);

  const handleGoToChat = () => {
    // 切换到AI聊天标签页
    const chatTab = document.querySelector('[data-key="ai-chat"]') as HTMLElement;
    if (chatTab) {
      chatTab.click();
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <div style={{ textAlign: 'center' }}>
        <Text style={{ color: '#00e676', fontSize: 16, fontWeight: 'bold' }}>
          AI 决策功能已迁移
        </Text>
        <br />
        <Text style={{ color: '#a1a9b7', fontSize: 14 }}>
          决策现在会自动显示在 AI 聊天面板中
        </Text>
        <br />
        <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>
          当前有 {items.length} 个决策
        </Text>
      </div>
      <Button type="primary" onClick={handleGoToChat}>
        前往 AI 聊天
      </Button>
    </div>
  );
}