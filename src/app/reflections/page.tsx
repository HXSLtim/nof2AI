'use client';

import Link from 'next/link';
import { Layout, Typography, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import TradeReflections from '../components/TradeReflections';

const { Header, Content } = Layout;
const { Title } = Typography;

/**
 * 交易反思与学习报告页面
 */
export default function ReflectionsPage() {
  return (
    <Layout style={{ 
      minHeight: '100vh', 
      maxHeight: '100vh',
      height: '100vh',
      background: '#0f1116',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <Header style={{ 
        background: 'transparent',
        borderBottom: '1px solid #1a1d26',
        display: 'flex', 
        alignItems: 'center', 
        gap: '16px',
        height: '64px',
        flexShrink: 0
      }}>
        <Link href="/">
          <Button 
            type="text" 
            icon={<ArrowLeftOutlined />} 
            style={{ color: '#00e676' }}
          >
            返回首页
          </Button>
        </Link>
        <Title level={3} style={{ color: '#00e676', margin: 0 }}>
          交易反思与学习系统
        </Title>
      </Header>

      <Content style={{ 
        padding: '24px', 
        background: '#0f1116',
        flex: 1,
        overflow: 'auto',
        height: 'calc(100vh - 64px)'
      }}>
        <TradeReflections />
      </Content>
    </Layout>
  );
}

