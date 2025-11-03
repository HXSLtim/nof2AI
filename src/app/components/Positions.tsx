"use client";

import { useEffect, useState } from 'react';
import { Grid, Modal, Button } from 'antd';

interface Position {
  symbol: string;
  side: 'long' | 'short';
  contracts: number;
  notional: number;
  unrealizedPnl: number;
  entryPrice: number;
  markPrice: number;
  /** 杠杆倍数 */
  leverage?: number;
  /** 币种（由 symbol 派生，如 BTC） */
  coin?: string;
}

/**
 * 仓位表（永续合约）
 * - 每 3 秒刷新一次
 * - 小屏仅展示「交易对 / 方向 / 未实现盈亏」三列
 * - 内容自动换行以避免滚动与遮挡，保证信息完整可读
 */
/**
 * 仓位表（永续合约 SWAP）
 * - 大屏列：SIDE / COIN / LEVERAGE / NOTIONAL / EXIT PLAN / UNREAL P&L
 * - 小屏列：交易对 / 方向 / 未实现盈亏
 * - 刷新：每 3 秒自动刷新一次
 */
export default function Positions() {
  const [list, setList] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const screens = Grid.useBreakpoint();
  const compact = !screens.md;
  /** 字体更紧凑，避免列内容换行过多 */
  const fontSize = compact ? 12 : 13;
  /** 收紧单元格内边距，减少整体占用宽度 */
  const cellPad = compact ? 4 : 4;
  const [planFor, setPlanFor] = useState<Position | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/positions');
      const json = await res.json();
      if (json.success) {
        // 字段映射：接口返回 symbol 为 'BTC-USDT-SWAP'
        const mapped: Position[] = json.data.map((p: any) => {
          const raw = String(p.symbol || '');
          const clean = raw.replace('-SWAP', ''); // BTC-USDT-SWAP → BTC-USDT
          const coin = clean.split('-')[0] || clean; // BTC-USDT → BTC
          return {
            symbol: clean,
            coin,
            side: p.side!,
            contracts: Number(p.contracts || 0),
            notional: Number(p.notional || 0),
            unrealizedPnl: Number(p.unrealizedPnl || 0),
            entryPrice: Number(p.entryPrice || 0),
            markPrice: Number(p.markPrice || 0),
            leverage: Number(p.leverage || 0),
          };
        });
        setList(mapped);
      } else {
        const errorMsg = json.error || '获取仓位失败';
        console.error('[Positions]', errorMsg, json.details);
        setError(errorMsg);
        setList([]);
      }
    } catch (err) {
      console.error('[Positions] Fetch error:', err);
      setError('网络请求失败，请稍后重试');
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 3000); // 3 秒刷新
    return () => clearInterval(id);
  }, []);

  if (loading && list.length === 0 && !error) {
    return <div style={{ padding: 16, color: '#a1a9b7' }}>加载中…</div>;
  }
  
  if (error) {
    return (
      <div style={{ padding: 16, color: '#ff4d4f' }}>
        <div style={{ marginBottom: 8, fontWeight: 'bold' }}>⚠️ 获取仓位失败</div>
        <div style={{ fontSize: 12, color: '#a1a9b7' }}>{error}</div>
        <div style={{ marginTop: 12 }}>
          <Button size="small" onClick={fetchData}>重试</Button>
        </div>
      </div>
    );
  }
  
  if (!loading && list.length === 0) {
    return <div style={{ padding: 16, color: '#a1a9b7' }}>暂无仓位</div>;
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 8 }}>
      {compact ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize, tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: cellPad, width: '34%' }}>交易对</th>
              <th style={{ textAlign: 'left', padding: cellPad, width: '33%' }}>方向</th>
              <th style={{ textAlign: 'left', padding: cellPad, width: '33%' }}>未实现盈亏</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.symbol}>
                <td style={{ padding: cellPad, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{p.symbol}</td>
                <td style={{ color: p.side === 'long' ? 'green' : 'red', padding: cellPad, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{p.side === 'long' ? '做多' : '做空'}</td>
                <td style={{ color: p.unrealizedPnl >= 0 ? 'green' : 'red', padding: cellPad, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  {p.unrealizedPnl.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize, tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {/* 列宽总和≈100%，避免过多空白与换行 */}
              <th style={{ textAlign: 'left', padding: cellPad, width: '16%' }}>方向</th>
              <th style={{ textAlign: 'left', padding: cellPad, width: '16%' }}>币种</th>
              <th style={{ textAlign: 'left', padding: cellPad, width: '12%' }}>杠杆</th>
              <th style={{ textAlign: 'left', padding: cellPad, width: '20%' }}>名义价值</th>
              <th style={{ textAlign: 'left', padding: cellPad, width: '12%' }}>退出计划</th>
              <th style={{ textAlign: 'left', padding: cellPad, width: '24%' }}>未实现盈亏</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.symbol}>
                <td style={{ color: p.side === 'long' ? '#00e676' : '#ff4d4f', padding: cellPad, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{p.side === 'long' ? '做多' : '做空'}</td>
                <td style={{ padding: cellPad, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{p.coin}</td>
                <td style={{ padding: cellPad, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{p.leverage ? `${p.leverage}倍` : '-'}</td>
                <td style={{ padding: cellPad, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{`$${p.notional.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}</td>
                <td style={{ padding: cellPad }}>
                  <Button size="small" onClick={() => setPlanFor(p)}>查看</Button>
                </td>
                <td style={{ color: p.unrealizedPnl >= 0 ? '#00e676' : '#ff4d4f', padding: cellPad, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  {`$${p.unrealizedPnl.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Modal
        title="退出计划"
        open={!!planFor}
        onCancel={() => setPlanFor(null)}
        footer={<Button onClick={() => setPlanFor(null)}>关闭</Button>}
      >
        {planFor ? (
          <div style={{ lineHeight: 1.8 }}>
            <div>方向：{planFor.side === 'long' ? '做多' : '做空'}</div>
            <div>币种：{planFor.coin}</div>
            <div>杠杆：{planFor.leverage ? `${planFor.leverage}倍` : '-'}</div>
            <div>名义价值：{`$${planFor.notional.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}</div>
            <div>开仓价：{planFor.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}</div>
            <div>标记价：{planFor.markPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}</div>
            <div>未实现盈亏：{`$${planFor.unrealizedPnl.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}</div>
            <div style={{ color: '#a1a9b7' }}>退出计划功能暂未实现，敬请期待。</div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}