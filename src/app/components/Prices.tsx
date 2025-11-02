"use client";

import { useEffect, useState } from 'react';
import { Card, Table, Typography, Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

const { Title } = Typography;

/**
 * 价格表项
 */
interface PriceItem {
  pair: string;
  price: number;
}

/**
 * 主流币永续合约实时价格卡片
 * 每 3 秒从 `/api/prices` 拉取最新价并展示为表格。
 */
export default function Prices() {
  const [data, setData] = useState<PriceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPrices = async () => {
    try {
      const res = await fetch('/api/prices');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const list: PriceItem[] = Object.entries(json).map(([k, v]) => ({
        pair: k.replace('-SWAP', ''),
        price: v as number,
      }));
      setData(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    const t = setInterval(fetchPrices, 3000);
    return () => clearInterval(t);
  }, []);

  const columns = [
    { title: '合约', dataIndex: 'pair', key: 'pair' },
    {
      title: '最新价 (USDT)',
      dataIndex: 'price',
      key: 'price',
      render: (v: number) => v?.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '-',
    },
  ];

  return (
    <Card
      style={{ marginTop: 24, background: '#1a1d26', border: '1px solid #303030' }}
      styles={{ header: { borderBottom: '1px solid #303030' }, body: { padding: 16 } }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
{/**
 * 价格卡片标题颜色
 * @remarks 与全局主题主色一致（绿色）。
 */}
<Title level={5} style={{ margin: 0, color: '#00e676' }}>
            主流币永续合约实时价格
          </Title>
          <ReloadOutlined spin={loading} onClick={fetchPrices} style={{ color: '#a1a9b7', cursor: 'pointer' }} />
        </div>
      }
    >
      {loading && !data.length ? (
        <Spin style={{ display: 'block', textAlign: 'center' }} />
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          rowKey="pair"
          pagination={false}
          size="small"
          style={{ background: 'transparent' }}
          scroll={{ x: 'max-content' }}
        />
      )}
    </Card>
  );
}