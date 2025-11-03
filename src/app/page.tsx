'use client';

import { useState, useEffect } from 'react';
import {
  Layout, Typography, Space, Form, Input, Switch, Button, Modal, Divider, App, Card, Row, Col, Grid, Select
} from 'antd';
import { SettingOutlined, SaveOutlined, RobotOutlined, ApiOutlined, BulbOutlined } from '@ant-design/icons';
import Link from 'next/link';
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
   * @remarks 先从环境变量读取默认配置，再用 localStorage 覆盖（如果有）
   */
  const loadConfig = async () => {
    // 1. 先从环境变量读取默认配置
    let envConfig: { baseUrl?: string; model?: string; hasKey?: boolean } = {};
    try {
      const res = await fetch('/api/ai/test', { method: 'GET', cache: 'no-store' });
      const json = await res.json();
      if (json?.ok && json?.info) {
        const { baseUrl, model, hasKey } = json.info;
        envConfig = { baseUrl, model };
        aiForm.setFieldsValue({ baseUrl, model });
        if (hasKey) {
          message.info('已检测到环境变量中的 API Key');
        }
      }
    } catch (error) {
      console.warn('[loadConfig] 读取环境配置失败:', error);
      // 使用默认值
      envConfig = {
        baseUrl: 'http://localhost:8000',
        model: 'gpt-5-high'
      };
      aiForm.setFieldsValue(envConfig);
    }

    // 2. 从 localStorage 读取用户自定义配置，覆盖环境变量
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ai_config');
      if (saved) {
        try {
          const userConfig = JSON.parse(saved);
          // 合并配置：用户配置覆盖环境配置
          const finalConfig = { ...envConfig, ...userConfig };
          aiForm.setFieldsValue(finalConfig);
          console.log('[loadConfig] 已加载用户自定义配置');
        } catch (error) {
          console.warn('[loadConfig] localStorage 解析失败:', error);
        }
      }
    }
  };

  /**
   * 打开设置弹窗时自动加载配置
   */
  useEffect(() => {
    if (open) loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
        <Space>
          <Link href="/reflections">
            <Button
              type="text"
              icon={<BulbOutlined style={{ fontSize: 20 }} />}
              style={{ color: '#00e676' }}
            >
              反思报告
            </Button>
          </Link>
          <Button
            type="text"
            icon={<SettingOutlined style={{ fontSize: 20 }} />}
            onClick={() => setOpen(true)}
            style={{ color: '#00e676' }}
          />
        </Space>
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
         * - 使用 flex 布局，上下分为两行
         * - 上方：左侧图表 + 右侧AI决策
         * - 下方：仓位面板（全宽）
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
          overflow: 'hidden',
          gap: '24px'
        }}
      >
        {/* 上半部分：图表 + AI决策 */}
        <Row 
          gutter={[24, 0]} 
          style={{ 
            height: screens.md ? '55%' : 'auto',
            minHeight: screens.md ? '55%' : 'calc(35vh)',
            flex: screens.md ? '0 0 55%' : 'none',
            overflow: 'hidden'
          }}
        >
          <Col xs={24} md={16} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/**
             * 左侧图表容器
             */}
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <EquityChart />
            </div>
          </Col>
          <Col xs={24} md={8} style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* AI 决策面板 */}
            <Card
              style={{ background: '#0f1116', border: '1px solid #1a1d26', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
              styles={{ header: { borderBottom: '1px solid #1a1d26', flexShrink: 0 }, body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 } }}
              title={<span style={{ color: '#00e676' }}>AI 决策</span>}
            >
              <DecisionHistory />
            </Card>
          </Col>
        </Row>

        {/* 下半部分：仓位面板（全宽） */}
        <Row 
          style={{ 
            height: screens.md ? 'calc(45% - 24px)' : 'auto',
            minHeight: screens.md ? 'calc(45% - 24px)' : 'calc(30vh)',
            flex: screens.md ? '1 1 auto' : 'none',
            overflow: 'hidden'
          }}
        >
          <Col xs={24} style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* 仓位面板 - 底部全宽 */}
            <Card
              style={{ background: '#0f1116', border: '1px solid #1a1d26', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
              styles={{ header: { borderBottom: '1px solid #1a1d26', flexShrink: 0 }, body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 } }}
              title={<span style={{ color: '#00e676' }}>仓位</span>}
            >
              <Positions />
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
