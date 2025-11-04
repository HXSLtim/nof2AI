"use client";

import { useEffect, useState } from 'react';
import { Grid, Modal, Button, Popconfirm, Input, Space, App } from 'antd';
import { usePositions, usePrices } from '@/contexts/DataContext';

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
 * 计算真实浮盈（扣除手续费）
 * @param unrealizedPnl 未实现盈亏
 * @param notional 名义价值
 * @returns 净盈亏
 */
function calculateNetPnl(unrealizedPnl: number, notional: number): number {
  // OKX手续费：
  // - Maker: 0.02% (挂单)
  // - Taker: 0.05% (吃单)
  // 市价单平仓使用taker费率
  // 开仓 + 平仓 = 两次手续费
  const takerFeeRate = 0.0005; // 0.05%
  const totalFeeRate = takerFeeRate * 2; // 开仓+平仓
  
  // 手续费 = 名义价值 * 费率
  const totalFees = notional * totalFeeRate;
  
  // 净盈亏 = 未实现盈亏 - 手续费
  return unrealizedPnl - totalFees;
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
  const { message } = App.useApp();
  
  // 使用新的数据服务Hook
  const { positions: rawPositions, loading: positionsLoading, error: positionsError, refresh: refreshPositions } = usePositions();
  const { prices } = usePrices();
  
  const [list, setList] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingPositions, setClosingPositions] = useState<Set<string>>(new Set());
  const [closingAll, setClosingAll] = useState(false);
  const [limitCloseModal, setLimitCloseModal] = useState<Position | null>(null);
  const [limitPrice, setLimitPrice] = useState<string>('');
  const [submittingLimit, setSubmittingLimit] = useState(false);
  const screens = Grid.useBreakpoint();
  const compact = !screens.md;
  /** 字体更紧凑，避免列内容换行过多 */
  const fontSize = compact ? 12 : 13;
  /** 收紧单元格内边距，减少整体占用宽度 */
  const cellPad = compact ? 4 : 4;
  const [planFor, setPlanFor] = useState<Position | null>(null);

  // 处理仓位数据变化
  useEffect(() => {
    setLoading(positionsLoading);
    
    if (positionsError) {
      setError(positionsError.message || '获取仓位失败');
      return;
    }
    
    if (rawPositions && Array.isArray(rawPositions)) {
      // 字段映射：接口返回 symbol 为 'BTC-USDT-SWAP'
      const mapped: Position[] = rawPositions.map((p: any) => {
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
      setError(null);
    } else {
      setList([]);
    }
  }, [rawPositions, positionsLoading, positionsError]);

  /**
   * 手动平仓单个仓位
   */
  const handleClosePosition = async (position: Position) => {
    const key = `${position.coin}-${position.side}`;
    setClosingPositions(prev => new Set(prev).add(key));
    
    try {
      message.loading({ content: `正在平仓 ${position.coin} ${position.side === 'long' ? '多头' : '空头'}...`, key, duration: 0 });
      
      // 构造平仓决策
      const action = position.side === 'long' ? 'CLOSE_LONG' : 'CLOSE_SHORT';
      const decision = {
        symbol: position.coin,
        action,
        confidence: 100,
        reasoning: '手动平仓',
      };
      
      const res = await fetch('/api/ai/execute-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          decision,
          decisionId: `manual-market-close-${position.coin}-${position.side}-${Date.now()}`  // 🔧 传递decisionId
        }),
      });
      
      const result = await res.json();
      
      if (result.success) {
        message.success({
          content: `${position.coin} ${position.side === 'long' ? '多头' : '空头'} 平仓成功`,
          key,
          duration: 3,
        });
        // 立即刷新仓位数据
        await refreshPositions();
      } else {
        throw new Error(result.error || '平仓失败');
      }
    } catch (err: any) {
      message.error({
        content: `平仓失败: ${err.message}`,
        key,
        duration: 5,
      });
      console.error('[Positions] Close position error:', err);
    } finally {
      setClosingPositions(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  /**
   * 限价平仓
   */
  const handleLimitClose = async () => {
    if (!limitCloseModal || !limitPrice) {
      message.error('请输入平仓价格');
      return;
    }
    
    const price = parseFloat(limitPrice);
    if (isNaN(price) || price <= 0) {
      message.error('请输入有效的价格');
      return;
    }
    
    setSubmittingLimit(true);
    
    try {
      const position = limitCloseModal;
      const action = position.side === 'long' ? 'CLOSE_LONG' : 'CLOSE_SHORT';
      
      // 调用限价平仓API
      const decision = {
        symbol: position.coin,
        action,
        confidence: 100,
        reasoning: `限价平仓 @ $${price}`,
        entryPrice: price, // 使用限价
      };
      
      message.loading({ content: `提交限价平仓订单...`, key: 'limitClose', duration: 0 });
      
      const res = await fetch('/api/ai/execute-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          decision,
          decisionId: `manual-limit-close-${position.coin}-${position.side}-${Date.now()}`  // 🔧 传递decisionId
        }),
      });
      
      const result = await res.json();
      
      if (result.success) {
        message.success({
          content: `限价平仓订单已提交 @ $${price}`,
          key: 'limitClose',
          duration: 3,
        });
        setLimitCloseModal(null);
        setLimitPrice('');
        await refreshPositions();
      } else {
        throw new Error(result.error || '提交失败');
      }
    } catch (err: any) {
      message.error({
        content: `限价平仓失败: ${err.message}`,
        key: 'limitClose',
        duration: 5,
      });
      console.error('[Positions] Limit close error:', err);
    } finally {
      setSubmittingLimit(false);
    }
  };

  /**
   * 一键平仓所有仓位 - 直接调用OKX API
   */
  const handleCloseAll = async () => {
    if (list.length === 0) {
      message.warning('当前没有仓位');
      return;
    }
    
    setClosingAll(true);
    
    try {
      message.loading({ content: `正在平仓 ${list.length} 个仓位...`, key: 'closeAll', duration: 0 });
      
      // 🔧 改为调用专用的批量平仓API（直接调用OKX）
      const res = await fetch('/api/positions/close-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await res.json();
      
      // 显示结果
      if (result.success) {
        message.success({
          content: result.message,
          key: 'closeAll',
          duration: 3,
        });
      } else {
        message.error({
          content: result.message || result.error,
          key: 'closeAll',
          duration: 5,
        });
      }
      
      // 刷新仓位数据
      await refreshPositions();
      
    } catch (err: any) {
      message.error({
        content: `一键平仓失败: ${err.message}`,
        key: 'closeAll',
        duration: 5,
      });
      console.error('[Positions] Close all error:', err);
    } finally {
      setClosingAll(false);
    }
  };

  if (loading && list.length === 0 && !error) {
    return <div style={{ padding: 16, color: '#a1a9b7' }}>加载中…</div>;
  }
  
  if (error) {
    return (
      <div style={{ padding: 16, color: '#ff4d4f' }}>
        <div style={{ marginBottom: 8, fontWeight: 'bold' }}>获取仓位失败</div>
        <div style={{ fontSize: 12, color: '#a1a9b7' }}>{error}</div>
        <div style={{ marginTop: 12 }}>
          <Button size="small" onClick={refreshPositions}>重试</Button>
        </div>
      </div>
    );
  }
  
  if (!loading && list.length === 0) {
    return <div style={{ padding: 16, color: '#a1a9b7' }}>暂无仓位</div>;
  }

  // 计算总净盈亏
  const totalGrossPnl = list.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const totalNetPnl = list.reduce((sum, p) => sum + calculateNetPnl(p.unrealizedPnl, p.notional), 0);
  const totalFees = totalGrossPnl - totalNetPnl;
  const totalNotional = list.reduce((sum, p) => sum + p.notional, 0);
  const pnlPercentage = totalNotional > 0 ? (totalNetPnl / totalNotional) * 100 : 0;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 12 }}>
      {/* 顶部汇总卡片 */}
      <div style={{ 
        marginBottom: 16, 
        padding: 16, 
        background: 'linear-gradient(135deg, #1a1d26 0%, #0f1116 100%)',
        border: '1px solid #2a2d36',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap'
        }}>
          {/* 左侧：盈亏汇总 */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
              持仓汇总 ({list.length}个)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>总名义价值</div>
                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ffffff' }}>
                  ${totalNotional.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>浮动盈亏</div>
                <div style={{ fontSize: 14, fontWeight: 'bold', color: totalGrossPnl >= 0 ? '#00e676' : '#ff4d4f' }}>
                  ${totalGrossPnl.toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>预计手续费</div>
                <div style={{ fontSize: 13, color: '#ff9800' }}>
                  ${totalFees.toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>净盈亏</div>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: totalNetPnl >= 0 ? '#00e676' : '#ff4d4f' }}>
                  ${totalNetPnl.toFixed(2)}
                  <span style={{ fontSize: 12, marginLeft: 4 }}>
                    ({pnlPercentage >= 0 ? '+' : ''}{pnlPercentage.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* 右侧：一键平仓按钮 */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Popconfirm
              title="确认一键平仓？"
              description={
                <div>
                  <div>将平掉 {list.length} 个仓位</div>
                  <div>总名义价值: ${totalNotional.toFixed(0)}</div>
                  <div>预计净盈亏: <span style={{ color: totalNetPnl >= 0 ? '#00e676' : '#ff4d4f', fontWeight: 'bold' }}>
                    ${totalNetPnl.toFixed(2)}
                  </span></div>
                </div>
              }
              onConfirm={handleCloseAll}
              okText="确认平仓"
              cancelText="取消"
            >
              <Button 
                danger 
                loading={closingAll}
                disabled={closingAll}
                style={{ 
                  height: 40,
                  paddingLeft: 20,
                  paddingRight: 20,
                  fontWeight: 'bold'
                }}
              >
                一键平仓 ({list.length})
              </Button>
            </Popconfirm>
          </div>
        </div>
      </div>

      {compact ? (
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse', 
          fontSize: 12, 
          background: '#1a1d26',
          borderRadius: 8,
          overflow: 'hidden'
        }}>
          <thead>
            <tr style={{ background: '#0f1116', borderBottom: '1px solid #2a2d36' }}>
              <th style={{ textAlign: 'left', padding: 10, width: '22%', color: '#9ca3af', fontWeight: 'normal', fontSize: 11 }}>币种</th>
              <th style={{ textAlign: 'left', padding: 10, width: '18%', color: '#9ca3af', fontWeight: 'normal', fontSize: 11 }}>方向</th>
              <th style={{ textAlign: 'left', padding: 10, width: '28%', color: '#9ca3af', fontWeight: 'normal', fontSize: 11 }}>净盈亏</th>
              <th style={{ textAlign: 'right', padding: 10, width: '32%', color: '#9ca3af', fontWeight: 'normal', fontSize: 11 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const netPnl = calculateNetPnl(p.unrealizedPnl, p.notional);
              const key = `${p.coin}-${p.side}`;
              const isClosing = closingPositions.has(key);
              
              return (
                <tr key={key} style={{ borderBottom: '1px solid #2a2d36' }}>
                  <td style={{ padding: 10, fontWeight: 'bold', color: '#ffffff' }}>
                    {p.coin}
                  </td>
                  <td style={{ padding: 10 }}>
                    <span style={{ 
                      color: p.side === 'long' ? '#00e676' : '#ff4d4f',
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: p.side === 'long' ? 'rgba(0,230,118,0.1)' : 'rgba(255,77,79,0.1)',
                      fontSize: 11
                    }}>
                      {p.side === 'long' ? '多' : '空'}
                    </span>
                  </td>
                  <td style={{ padding: 10 }}>
                    <div style={{ color: netPnl >= 0 ? '#00e676' : '#ff4d4f', fontWeight: 'bold' }}>
                      ${netPnl.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 9, color: '#6b7280' }}>
                      费${(p.notional * 0.001).toFixed(2)}
                    </div>
                  </td>
                  <td style={{ padding: 10, textAlign: 'right' }}>
                    <Space size={4}>
                      <Popconfirm
                        title="确认平仓？"
                        description={`${p.coin} ${p.side === 'long' ? '多头' : '空头'} 预计净盈亏: $${netPnl.toFixed(2)}`}
                        onConfirm={() => handleClosePosition(p)}
                        okText="确认"
                        cancelText="取消"
                      >
                        <Button 
                          size="small" 
                          danger 
                          loading={isClosing}
                          disabled={isClosing || closingAll}
                        >
                          市价
                        </Button>
                      </Popconfirm>
                      <Button
                        size="small"
                        onClick={() => {
                          setLimitCloseModal(p);
                          setLimitPrice(p.markPrice.toFixed(4));
                        }}
                        disabled={isClosing || closingAll}
                      >
                        限价
                      </Button>
                    </Space>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse', 
          fontSize: 13,
          background: '#1a1d26',
          borderRadius: 8,
          overflow: 'hidden'
        }}>
          <thead>
            <tr style={{ background: '#0f1116', borderBottom: '1px solid #2a2d36' }}>
              <th style={{ textAlign: 'left', padding: 12, width: '8%', color: '#9ca3af', fontWeight: 'normal', fontSize: 11 }}>方向</th>
              <th style={{ textAlign: 'left', padding: 12, width: '10%', color: '#9ca3af', fontWeight: 'normal', fontSize: 11 }}>币种</th>
              <th style={{ textAlign: 'left', padding: 12, width: '8%', color: '#9ca3af', fontWeight: 'normal', fontSize: 11 }}>杠杆</th>
              <th style={{ textAlign: 'right', padding: 12, width: '14%', color: '#9ca3af', fontWeight: 'normal', fontSize: 11 }}>名义价值</th>
              <th style={{ textAlign: 'right', padding: 12, width: '14%', color: '#9ca3af', fontWeight: 'normal', fontSize: 11 }}>浮盈</th>
              <th style={{ textAlign: 'right', padding: 12, width: '12%', color: '#9ca3af', fontWeight: 'normal', fontSize: 11 }}>手续费</th>
              <th style={{ textAlign: 'right', padding: 12, width: '14%', color: '#9ca3af', fontWeight: 'normal', fontSize: 11 }}>净盈亏</th>
              <th style={{ textAlign: 'center', padding: 12, width: '8%', color: '#9ca3af', fontWeight: 'normal', fontSize: 11 }}>详情</th>
              <th style={{ textAlign: 'center', padding: 12, width: '12%', color: '#9ca3af', fontWeight: 'normal', fontSize: 11 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const netPnl = calculateNetPnl(p.unrealizedPnl, p.notional);
              const fees = p.notional * 0.001;
              const key = `${p.coin}-${p.side}`;
              const isClosing = closingPositions.has(key);
              
              return (
                <tr key={key} style={{ 
                  borderBottom: '1px solid #2a2d36',
                  transition: 'background 0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: 12 }}>
                    <span style={{ 
                      color: p.side === 'long' ? '#00e676' : '#ff4d4f',
                      padding: '4px 10px',
                      borderRadius: 4,
                      background: p.side === 'long' ? 'rgba(0,230,118,0.1)' : 'rgba(255,77,79,0.1)',
                      fontSize: 12,
                      fontWeight: 500
                    }}>
                      {p.side === 'long' ? '做多' : '做空'}
                    </span>
                  </td>
                  <td style={{ padding: 12, fontWeight: 'bold', fontSize: 14, color: '#ffffff' }}>
                    {p.coin}
                  </td>
                  <td style={{ padding: 12, color: '#a1a9b7' }}>
                    {p.leverage ? `${p.leverage}x` : '-'}
                  </td>
                  <td style={{ padding: 12, textAlign: 'right', color: '#ffffff' }}>
                    ${p.notional.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </td>
                  <td style={{ padding: 12, textAlign: 'right' }}>
                    <div style={{ 
                      color: p.unrealizedPnl >= 0 ? '#00e676' : '#ff4d4f',
                      fontWeight: 500
                    }}>
                      ${p.unrealizedPnl.toFixed(2)}
                    </div>
                  </td>
                  <td style={{ padding: 12, textAlign: 'right', color: '#ff9800', fontSize: 12 }}>
                    ${fees.toFixed(2)}
                  </td>
                  <td style={{ padding: 12, textAlign: 'right' }}>
                    <div style={{ 
                      color: netPnl >= 0 ? '#00e676' : '#ff4d4f',
                      fontWeight: 'bold',
                      fontSize: 14
                    }}>
                      ${netPnl.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>
                      {((netPnl / p.notional) * 100).toFixed(2)}%
                    </div>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <Button 
                      size="small" 
                      onClick={() => setPlanFor(p)}
                      style={{ fontSize: 11 }}
                    >
                      查看
                    </Button>
                  </td>
                  <td style={{ padding: 12, textAlign: 'center' }}>
                    <Space size={6}>
                      <Popconfirm
                        title="确认市价平仓？"
                        description={
                          <div>
                            <div>{p.coin} {p.side === 'long' ? '多头' : '空头'}</div>
                            <div>名义价值: ${p.notional.toFixed(0)}</div>
                            <div>浮盈: ${p.unrealizedPnl.toFixed(2)}</div>
                            <div style={{ color: '#ff9800' }}>手续费: ${fees.toFixed(2)}</div>
                            <div style={{ fontWeight: 'bold' }}>净盈亏: ${netPnl.toFixed(2)}</div>
                          </div>
                        }
                        onConfirm={() => handleClosePosition(p)}
                        okText="确认平仓"
                        cancelText="取消"
                      >
                        <Button 
                          size="small" 
                          danger 
                          loading={isClosing}
                          disabled={isClosing || closingAll}
                          style={{ fontSize: 11 }}
                        >
                          市价
                        </Button>
                      </Popconfirm>
                      <Button
                        size="small"
                        onClick={() => {
                          setLimitCloseModal(p);
                          setLimitPrice(p.markPrice.toFixed(4));
                        }}
                        disabled={isClosing || closingAll}
                        style={{ fontSize: 11 }}
                      >
                        限价
                      </Button>
                    </Space>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {/* 限价平仓Modal */}
      <Modal
        title={`限价平仓 - ${limitCloseModal?.coin || ''} ${limitCloseModal?.side === 'long' ? '多头' : '空头'}`}
        open={!!limitCloseModal}
        onCancel={() => {
          setLimitCloseModal(null);
          setLimitPrice('');
        }}
        onOk={handleLimitClose}
        okText="提交订单"
        cancelText="取消"
        confirmLoading={submittingLimit}
      >
        {limitCloseModal && (
          <div style={{ lineHeight: 2 }}>
            <div style={{ marginBottom: 16 }}>
              <div>当前价格: ${limitCloseModal.markPrice.toFixed(4)}</div>
              <div>入场价格: ${limitCloseModal.entryPrice.toFixed(4)}</div>
              <div>未实现盈亏: <span style={{ color: limitCloseModal.unrealizedPnl >= 0 ? '#00e676' : '#ff4d4f' }}>
                ${limitCloseModal.unrealizedPnl.toFixed(2)}
              </span></div>
            </div>
            
            <div style={{ marginBottom: 8 }}>
              <div style={{ marginBottom: 4, color: '#a1a9b7' }}>平仓价格 (USDT):</div>
              <Input
                type="number"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder="输入平仓价格"
                step="0.0001"
                prefix="$"
                style={{ width: '100%' }}
              />
            </div>
            
            {limitPrice && !isNaN(parseFloat(limitPrice)) && (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                <div style={{ fontSize: 12, color: '#a1a9b7', marginBottom: 8 }}>预计平仓结果:</div>
                {(() => {
                  const price = parseFloat(limitPrice);
                  const entryPrice = limitCloseModal.entryPrice;
                  const contracts = limitCloseModal.contracts;
                  const priceDiff = limitCloseModal.side === 'long' 
                    ? (price - entryPrice) 
                    : (entryPrice - price);
                  const estimatedPnl = (priceDiff / entryPrice) * limitCloseModal.notional;
                  const fees = limitCloseModal.notional * 0.001;
                  const netPnl = estimatedPnl - fees;
                  
                  return (
                    <div>
                      <div>价格差: ${priceDiff.toFixed(4)} ({((priceDiff / entryPrice) * 100).toFixed(2)}%)</div>
                      <div>预计浮盈: <span style={{ color: estimatedPnl >= 0 ? '#00e676' : '#ff4d4f' }}>
                        ${estimatedPnl.toFixed(2)}
                      </span></div>
                      <div>预计手续费: <span style={{ color: '#ff9800' }}>${fees.toFixed(2)}</span></div>
                      <div style={{ fontWeight: 'bold' }}>
                        预计净盈亏: <span style={{ color: netPnl >= 0 ? '#00e676' : '#ff4d4f' }}>
                          ${netPnl.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            
            <div style={{ marginTop: 12, fontSize: 11, color: '#6b7280' }}>
              提示: 限价单在价格达到设定值时自动成交
            </div>
          </div>
        )}
      </Modal>

      {/* 仓位详情Modal */}
      <Modal
        title={`仓位详情 - ${planFor?.coin || ''}`}
        open={!!planFor}
        onCancel={() => setPlanFor(null)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <Button onClick={() => setPlanFor(null)}>关闭</Button>
            {planFor && (
              <Space>
                <Button
                  onClick={() => {
                    setLimitCloseModal(planFor);
                    setLimitPrice(planFor.markPrice.toFixed(4));
                    setPlanFor(null);
                  }}
                >
                  限价平仓
                </Button>
                <Popconfirm
                  title="确认市价平仓？"
                  description={`${planFor.coin} ${planFor.side === 'long' ? '多头' : '空头'} 预计净盈亏: $${calculateNetPnl(planFor.unrealizedPnl, planFor.notional).toFixed(2)}`}
                  onConfirm={() => {
                    handleClosePosition(planFor);
                    setPlanFor(null);
                  }}
                  okText="确认平仓"
                  cancelText="取消"
                >
                  <Button type="primary" danger>市价平仓</Button>
                </Popconfirm>
              </Space>
            )}
          </div>
        }
      >
        {planFor ? (
          <div style={{ lineHeight: 2 }}>
            <div><strong>基本信息</strong></div>
            <div>方向：<span style={{ color: planFor.side === 'long' ? '#00e676' : '#ff4d4f' }}>{planFor.side === 'long' ? '做多' : '做空'}</span></div>
            <div>币种：{planFor.coin}</div>
            <div>杠杆：{planFor.leverage ? `${planFor.leverage}倍` : '-'}</div>
            <div>合约张数：{planFor.contracts.toFixed(4)}</div>
            <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />
            
            <div><strong>价格信息</strong></div>
            <div>开仓价：${planFor.entryPrice.toFixed(4)}</div>
            <div>标记价：${planFor.markPrice.toFixed(4)}</div>
            <div>价差：<span style={{ color: planFor.markPrice > planFor.entryPrice ? '#00e676' : '#ff4d4f' }}>
              ${(planFor.markPrice - planFor.entryPrice).toFixed(4)} ({(((planFor.markPrice - planFor.entryPrice) / planFor.entryPrice) * 100).toFixed(2)}%)
            </span></div>
            <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />
            
            <div><strong>盈亏分析</strong></div>
            <div>名义价值：${planFor.notional.toFixed(2)}</div>
            <div>未实现盈亏：<span style={{ color: planFor.unrealizedPnl >= 0 ? '#00e676' : '#ff4d4f' }}>
              ${planFor.unrealizedPnl.toFixed(2)}
            </span></div>
            <div>预计手续费：<span style={{ color: '#ff9800' }}>
              ${(planFor.notional * 0.001).toFixed(2)}
            </span></div>
            <div style={{ fontSize: 16, fontWeight: 'bold' }}>
              净盈亏：<span style={{ color: calculateNetPnl(planFor.unrealizedPnl, planFor.notional) >= 0 ? '#00e676' : '#ff4d4f' }}>
                ${calculateNetPnl(planFor.unrealizedPnl, planFor.notional).toFixed(2)}
              </span>
            </div>
            <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />
            
            <div style={{ fontSize: 12, color: '#a1a9b7' }}>
              * 手续费按开仓+平仓总计0.1%估算（Taker费率）<br/>
              * 实际手续费可能因账户等级而异<br/>
              * 净盈亏 = 未实现盈亏 - 预计手续费
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}