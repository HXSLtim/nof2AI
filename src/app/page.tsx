'use client';

import { useState } from 'react';
import {
  Layout, Typography, Space, Form, Input, Switch, Button, Modal, Divider, App, Card, Row, Col, Grid, Select, Tabs
} from 'antd';
import { SettingOutlined, SaveOutlined, ThunderboltOutlined, RobotOutlined, ApiOutlined } from '@ant-design/icons';
import Positions from './components/Positions';
import EquityChart from './components/EquityChart';
import AIChat from './components/AIChat';
import AIDecisions from './components/AIDecisions';

const { Header, Content, Footer } = Layout;
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
    // TODO: 实际保存逻辑（localStorage / 后端）
    message.success('AI 配置已保存');
  };

  const testExchange = async () => {
    const res = await fetch('/api/orders/test', { method: 'POST' });
    if (res.ok) {
      message.success('交易所连接成功');
    } else {
      const { error } = await res.json();
      message.error('连接失败：' + error);
    }
  };

  const testAI = async () => {
    try {
      const values = await aiForm.validateFields();
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      if (res.ok) {
        message.success('AI 服务连接成功');
      } else {
        const { error } = await res.json();
        message.error('连接失败：' + error);
      }
    } catch {
      message.error('请先填写完整信息');
    }
  };

  /**
   * 右栏标签页配置：仓位 / AI 聊天 / AI 决策
   * @remarks Tabs 使用高度 100%，每个子面板容器采用高度 100% 的列式布局。
   */
  const tabItems = [
    {
      key: 'positions',
      label: '仓位',
      children: <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}><Positions /></div>
    },
    {
      key: 'ai-chat',
      label: 'AI 聊天',
      children: <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}><AIChat /></div>
    },
    {
      key: 'ai-decisions',
      label: 'AI 决策',
      children: <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}><AIDecisions /></div>
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#0f1116' }}>
      <Header style={{ background: 'transparent', borderBottom: '1px solid #1a1d26', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
       * @description 取消 maxWidth 上限（原 1200），让页面宽度完全自适应父容器，避免固定宽度导致在某些布局下看起来“被限制为 600/1200”。
       */}
      <Content
        /**
         * 主体区域填满剩余视口高度，确保子容器可使用 height: 100%。
         */
        style={{ padding: screens.md ? '6vh 24px' : '3vh 16px', margin: '0 auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <Row gutter={[screens.md ? 24 : 12, screens.md ? 24 : 12]} style={{ height: '100%' }}>
          <Col xs={24} md={16} style={{ height: '100%' }}>
            {/**
             * 左侧容器改为列式 flex，让子卡片可用 flex:1 撑满高度。
             */}
            <Space direction="vertical" size="large" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <EquityChart />
            </Space>
          </Col>
          <Col xs={24} md={8} style={{ height: '100%' }}>
            <Card
              /**
               * 右侧卡片改为标签页容器：仓位 / AI 聊天 / AI 决策
               */
              style={{ background: '#0f1116', border: '1px solid #1a1d26', height: '100%', display: 'flex', flexDirection: 'column' }}
              styles={{ header: { borderBottom: '1px solid #1a1d26' }, body: { flex: 1, display: 'flex', flexDirection: 'column' } }}
              title={<span style={{ color: '#00e676' }}>面板</span>}
            >
              <Tabs defaultActiveKey="positions" items={tabItems} style={{ height: '100%' }} />
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
              <Form.Item label="启用 SSE 实时推送" name="enableSSE" valuePropName="checked" initialValue>
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
              <Space>
                <Button type="primary" icon={<SaveOutlined />} onClick={saveAI}>保存</Button>
                <Button icon={<ThunderboltOutlined />} onClick={testAI}>测试 AI</Button>
              </Space>
            </Form>
          </div>

          <Divider style={{ borderColor: '#303030' }} />

          {/* 交易所状态 */}
          <div>
            <Title level={5} style={{ color: '#00e676' }}><ApiOutlined /> 交易所 API</Title>
            <div style={{ color: '#a1a9b7', marginTop: 8 }}>
              <p>✅ 已配置（读取自 .env.local）</p>
              <p style={{ fontSize: 12 }}>如需修改，请直接编辑 .env.local 并重启。</p>
              <Button icon={<ThunderboltOutlined />} onClick={testExchange} style={{ marginTop: 12 }}>测试连接</Button>
            </div>
          </div>

          <Divider style={{ borderColor: '#303030' }} />

          {/**
           * 平台说明（原 A Better Benchmark 文案）
           * 搬迁到设置弹窗，避免与右侧仓位卡片内容冲突。
           */}
          <div>
            <Title level={5} style={{ color: '#00e676' }}>平台说明</Title>
            <Paragraph style={{ color: '#a1a9b7' }}>
              Alpha Arena 是一个用于衡量 AI 投资能力的公开基准，每个模型获得相同资金与市场数据，在真实市场中竞争。
            </Paragraph>
            <Paragraph style={{ color: '#a1a9b7' }}>
              我们的目标是使基准更贴近真实世界，并让市场成为终极智能测试。Quant AI 将以可复现的方式记录策略与表现。
            </Paragraph>
            <Paragraph style={{ color: '#a1a9b7' }}>
              右上角齿轮可打开设置，完成 API 与 AI 服务配置后，即可开始运行。
            </Paragraph>
          </div>


        </div>
      </Modal>

      <Footer style={{ textAlign: 'center', background: 'transparent', color: '#6b7280', fontSize: 12 }}>
        ©{new Date().getFullYear()} Quant AI
      </Footer>
    </Layout>
  );
}
