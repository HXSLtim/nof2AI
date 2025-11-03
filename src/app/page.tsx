'use client';

import { useState, useEffect } from 'react';
import {
  Layout, Typography, Space, Form, Input, Switch, Button, Modal, Divider, App, Card, Row, Col, Grid, Select, Tabs
} from 'antd';
import { SettingOutlined, SaveOutlined, RobotOutlined, ApiOutlined } from '@ant-design/icons';
import Positions from './components/Positions';
import EquityChart from './components/EquityChart';
import DecisionHistory from './components/DecisionHistory';

/**
 * 页面布局使用 Header 与 Content，移除 Footer
 * @remarks 按需求去掉底部 fooster/footer 区域，避免多余占位。
 */
const { Header, Content } = Layout;
const { Title, Paragraph } = Typography;

/**
 * 可选推理模型列表
 * @remarks 以 `{ label, value }` 格式供 `Select` 使用
 */
const MODEL_OPTIONS: { label: string; value: string }[] = [
  { label: 'GPT-5 High', value: 'gpt-5-high' },
  { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
  { label: 'DeepSeek R1', value: 'deepseek-r1' },
  { label: 'Claude Sonnet', value: 'claude-sonnet' },
];

/**
 * 首页：AI + 交易所 API 一站式配置（弹窗版，极简暗色）
 */
export default function HomePage() {
  const { message } = App.useApp();
  const [aiForm] = Form.useForm();
  const [open, setOpen] = useState(false);
  const screens = Grid.useBreakpoint();

  const saveAI = () => {
    const values = aiForm.getFieldsValue();
    // 保存到 localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('ai_config', JSON.stringify(values));
    }
    message.success('AI 配置已保存');
  };

  /**
   * 读取配置并填充设置表单
   * @remarks 优先从 localStorage 读取，其次尝试从环境变量读取。
   */
  const loadConfig = async () => {
    // 优先从 localStorage 读取配置
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ai_config');
      if (saved) {
        try {
          const config = JSON.parse(saved);
          aiForm.setFieldsValue(config);
          return;
        } catch {
          // 解析失败，继续下面的逻辑
        }
      }
    }

    // 从环境变量读取默认配置
    try {
      const res = await fetch('/api/ai/test', { method: 'GET', cache: 'no-store' });
      const json = await res.json();
      if (json?.ok && json?.info) {
        const { baseUrl, model, hasKey } = json.info;
        aiForm.setFieldsValue({ baseUrl, model });
        if (hasKey) message.info('已检测到环境变量中的 API Key');
      }
    } catch {
      // 静默失败，不影响表单手动填写
    }
  };

  /**
   * 打开设置弹窗时自动加载配置
   */
  useEffect(() => {
    if (open) loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * 右栏标签页配置：仓位 / AI 决策
   * @remarks 只保留决策历史和仓位两个标签页
   */
  const tabItems = [
    {
      key: 'decision-history',
      label: 'AI 决策',
      /**
       * 决策历史面板：显示AI生成的交易决策历史记录
       * @remarks 使决策列表在内容超出时出现纵向滚动条。
       */
      children: <div style={{ height: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}><DecisionHistory /></div>
    },
    {
      key: 'positions',
      label: '仓位',
      /**
       * 面板容器：启用内容滚动
       * @remarks 关键点：flex: 1 + minHeight: 0，让内部 overflow 生效。
       */
      children: <div style={{ height: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}><Positions /></div>
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', maxHeight: '100vh', height: '100vh', background: '#0f1116', overflow: 'hidden' }}>
      <Header style={{ height: '64px', lineHeight: '64px', background: 'transparent', borderBottom: '1px solid #1a1d26', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        {/**
         * 页面主标题颜色
         * @remarks 与全局主题主色保持一致（绿色）。
         */}
        <Title level={3} style={{ color: '#00e676', margin: 0 }}>
          Quant AI
        </Title>
        <Button
          type="text"
          icon={<SettingOutlined style={{ fontSize: 20 }} />}
          onClick={() => setOpen(true)}
          style={{ color: '#00e676' }}
        />
      </Header>

      {/* 顶部价格滚动条已移除（避免重复价格展示） */}

      {/**
       * 页面主体容器
       * @description 精确计算高度 = 100vh - Header(64px)，确保不产生滚动条
       */}
      <Content
        /**
         * 主体区域精确高度计算，避免产生滚动条
         * @remarks 
         * - 高度 = 视口高度 - Header高度
         * - 最小高度和最大高度都设置为相同值，确保固定
         * - 大屏：overflow: hidden 防止整体滚动
         * - 小屏：overflow: hidden，Row内部可滚动
         */
        style={{ 
          height: 'calc(100vh - 64px)',
          minHeight: 'calc(100vh - 64px)',
          maxHeight: 'calc(100vh - 64px)',
          padding: screens.md ? '24px 24px' : '12px 12px', 
          margin: '0 auto', 
          width: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/**
         * 左右两列统一高度：精确计算以适配父容器
         * @remarks 
         * - 大屏高度 = Content高度 - 上下padding(48px)
         * - 小屏每列固定高度，避免溢出
         */}
        <Row 
          gutter={[24, screens.md ? 24 : 12]} 
          style={{ 
            height: screens.md ? 'calc(100vh - 64px - 48px)' : 'auto',
            minHeight: screens.md ? 'calc(100vh - 64px - 48px)' : 'auto',
            maxHeight: screens.md ? 'calc(100vh - 64px - 48px)' : 'auto',
            flex: 1,
            overflow: screens.md ? 'hidden' : 'auto'
          }}
        >
          <Col xs={24} md={16} style={{ height: screens.md ? '100%' : 'calc(50vh - 32px - 12px)', display: 'flex', flexDirection: 'column', marginBottom: screens.md ? 0 : 12 }}>
            {/**
             * 左侧图表容器：使用 100% 高度以匹配 Col
             */}
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <EquityChart />
            </div>
          </Col>
          <Col xs={24} md={8} style={{ height: screens.md ? '100%' : 'calc(50vh - 32px - 12px)', display: 'flex', flexDirection: 'column' }}>
            <Card
              /**
               * 右侧卡片改为标签页容器：仓位 / AI 聊天 / AI 决策
               * @remarks 使用 100% 高度与左侧图表保持一致
               */
              style={{ background: '#0f1116', border: '1px solid #1a1d26', height: '100%', display: 'flex', flexDirection: 'column' }}
              styles={{ header: { borderBottom: '1px solid #1a1d26' }, body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
              title={<span style={{ color: '#00e676' }}>面板</span>}
            >
              {/**
               * Tabs 内容区域滚动
               * @remarks 使用 flex: 1 + minHeight: 0，使内部 children 的 overflowY 能够生效显示滚动条。
               */}
              <Tabs defaultActiveKey="decision-history" items={tabItems} className="panel-tabs" style={{ height: '100%', flex: 1, display: 'flex', flexDirection: 'column' }} />
            </Card>
          </Col>
        </Row>
      </Content>

      {/* 配置弹窗 */}
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={screens.md ? 520 : '92%'}
        styles={{ mask: { backdropFilter: 'blur(4px)' } }}
        style={{ top: 120 }}
      >
        <div style={{ color: '#ffffff' }}>
          <Title level={3} style={{ marginBottom: 24 }}>基础配置</Title>

          <Divider style={{ borderColor: '#303030' }} />

          {/* AI 配置 */}
          <div style={{ marginBottom: 32 }}>
            <Title level={5} style={{ color: '#00e676' }}><RobotOutlined /> AI 配置</Title>
            <Form form={aiForm} layout="vertical" size="middle" style={{ marginTop: 12 }}>
              {/* 模型选择 */}
              <Form.Item label="模型" name="model" initialValue="gpt-5-high">
                <Select
                  options={MODEL_OPTIONS}
                  placeholder="请选择推理模型"
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
              <Form.Item label="Base URL" name="baseUrl" initialValue="http://localhost:8000">
                <Input placeholder="http://localhost:8000" />
              </Form.Item>
              <Form.Item label="API Key" name="apiKey">
                <Input.Password placeholder="可选" />
              </Form.Item>
              <Button type="primary" icon={<SaveOutlined />} onClick={saveAI}>保存配置</Button>
            </Form>
          </div>

          <Divider style={{ borderColor: '#303030' }} />

          {/* 交易所状态 */}
          <div>
            <Title level={5} style={{ color: '#00e676' }}><ApiOutlined /> 交易所 API</Title>
            <div style={{ color: '#a1a9b7', marginTop: 8 }}>
              <p>✅ 已配置（读取自环境变量）</p>
              <p style={{ fontSize: 12 }}>配置信息已从 .env.local 加载</p>
            </div>
          </div>

          <Divider style={{ borderColor: '#303030' }} />

          {/**
           * 使用说明
           */}
          <div>
            <Title level={5} style={{ color: '#00e676' }}>使用说明</Title>
            <Paragraph style={{ color: '#a1a9b7' }}>
              配置 AI 服务后，系统将自动分析市场数据并生成交易决策。AI 助手面板会显示聊天记录和解析出的决策信息。
            </Paragraph>
          </div>


        </div>
      </Modal>

      {/**
       * Footer 已移除
       * @remarks 如需恢复版权信息可在此处重新添加。
       */}
    </Layout>
  );
}
