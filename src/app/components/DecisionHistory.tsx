"use client";

import { useEffect, useState, useRef } from 'react';
import { Typography, List, Tag, Space, Button, Modal, Empty, App, Switch, Alert, InputNumber } from 'antd';
import { getDecisions, subscribeDecisions, Decision, updateDecisionStatus, publishDecision } from '@/lib/decisions';
import { composePrompt, parseDecisionFromText, parseDecisionsFromText } from '@/lib/ai-trading-prompt';

const { Text, Paragraph } = Typography;

/**
 * AI 决策历史面板
 * @description 显示AI生成的交易决策历史记录，支持状态管理和详情查看
 */
export default function DecisionHistory() {
  const { message, modal } = App.useApp();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  
  // 使用 null 作为初始值，useEffect 中再从 localStorage 读取（避免 hydration 错误）
  const [autoRequest, setAutoRequest] = useState(true);
  const [autoExecute, setAutoExecute] = useState(true);
  const [intervalSeconds, setIntervalSeconds] = useState(180);
  const [invocationCount, setInvocationCount] = useState(0);
  const [tradingStartTime, setTradingStartTime] = useState(Date.now());
  
  // 客户端挂载后从 localStorage 读取
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedAutoRequest = localStorage.getItem('ai_decision_auto_request');
      if (savedAutoRequest !== null) setAutoRequest(savedAutoRequest === 'true');
      
      const savedAutoExecute = localStorage.getItem('ai_decision_auto_execute');
      if (savedAutoExecute !== null) setAutoExecute(savedAutoExecute === 'true');
      
      const savedInterval = localStorage.getItem('ai_decision_interval_seconds');
      if (savedInterval) setIntervalSeconds(Number(savedInterval));
      
      const savedCount = localStorage.getItem('ai_decision_invocation_count');
      if (savedCount) setInvocationCount(Number(savedCount));
      
      const savedStartTime = localStorage.getItem('ai_trading_start_time');
      if (savedStartTime) {
        setTradingStartTime(Number(savedStartTime));
      } else {
        const now = Date.now();
        localStorage.setItem('ai_trading_start_time', String(now));
        setTradingStartTime(now);
      }
    }
  }, []);
  
  // 定时器引用
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeDecisions((newDecisions) => {
      setDecisions(newDecisions);
    });
    
    // 首次加载时检查并提示开关状态
    if (typeof window !== 'undefined') {
      const hasSetBefore = localStorage.getItem('ai_decision_auto_execute') !== null;
      if (!hasSetBefore && autoExecute) {
        // 首次访问且默认开启，提示用户
        setTimeout(() => {
          message.info('⚠️ 自动执行已默认开启，AI决策将自动下单。可在面板中关闭。', 8);
        }, 2000);
      }
    }
    
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 自动请求AI决策的定时器
   * @remarks 根据用户设置的时间间隔自动请求
   */
  useEffect(() => {
    // 清除旧定时器
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // 如果开启自动请求
    if (autoRequest) {
      const intervalMs = intervalSeconds * 1000; // 转换为毫秒
      
      console.log('[DecisionHistory] 自动AI决策已启动，间隔:', intervalSeconds, '秒');
      
      timerRef.current = setInterval(() => {
        console.log('[DecisionHistory] 自动触发AI决策生成');
        generateAIDecision(false); // false = 自动触发，不显示详细消息
      }, intervalMs);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRequest, intervalSeconds, invocationCount]);

  /**
   * 切换自动请求开关
   */
  const toggleAutoRequest = (checked: boolean) => {
    setAutoRequest(checked);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ai_decision_auto_request', String(checked));
    }
  };

  /**
   * 切换自动执行开关
   */
  const toggleAutoExecute = (checked: boolean) => {
    setAutoExecute(checked);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ai_decision_auto_execute', String(checked));
    }
    
    if (checked) {
      message.warning('⚠️ 自动执行已开启！AI决策将自动下单，请谨慎使用', 5);
    } else {
      message.info('自动执行已关闭');
    }
  };

  /**
   * 更改时间间隔
   */
  const handleIntervalChange = (value: number | null) => {
    if (!value || value < 10) return; // 最小10秒
    setIntervalSeconds(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ai_decision_interval_seconds', String(value));
    }
    message.success(`时间间隔已设置为 ${value} 秒`);
  };

  /**
   * 生成AI决策（手动或自动触发）
   */
  const generateAIDecision = async (isManual = true) => {
    if (isManual) setTesting(true);
    
    try {
      if (isManual) message.info('正在获取市场数据...');
      
      // 1. 获取市场数据提示词
      const res1 = await fetch('/api/ai/prompt', { cache: 'no-store' });
      const json1 = await res1.json();
      if (!json1.success || !json1.prompt) {
        throw new Error('获取市场数据失败');
      }
      
      if (isManual) message.info('正在请求AI决策...');
      
      // 2. 组装完整提示词
      const marketData = json1.prompt;
      const newCount = invocationCount + 1;
      const tradingMinutes = Math.floor((Date.now() - tradingStartTime) / 60000);
      const prompt = composePrompt(marketData, newCount, tradingMinutes);
      
      // 3. 调用AI服务
      const res2 = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: [{ role: 'user', content: prompt }] 
        })
      });
      
      const json2 = await res2.json();
      if (!json2.ok || !json2.content) {
        throw new Error(json2.error || 'AI决策失败');
      }
      
      const aiReply = json2.content;
      if (isManual) message.success('AI回复已生成，正在解析决策...');
      
      // 调试：输出AI回复
      console.log('[DecisionHistory] AI回复:', aiReply.substring(0, 500));
      
      // 4. 解析决策（支持多个）
      const parsedDecisions = parseDecisionsFromText(aiReply);
      console.log('[DecisionHistory] 解析结果:', parsedDecisions.length, '个决策');
      console.log('[DecisionHistory] 决策详情:', parsedDecisions.map(d => `${d.symbol}-${d.action}`).join(', '));
      
      if (!parsedDecisions || parsedDecisions.length === 0) {
        console.error('[DecisionHistory] 解析失败，这不应该发生');
        if (isManual) message.error('决策解析失败');
        return;
      }
      
      const prefix = isManual ? '🧪 测试' : '🤖 自动';
      let tradingCount = 0; // 交易决策计数
      let holdCount = 0;    // HOLD决策计数
      
      // 处理每个决策
      for (let i = 0; i < parsedDecisions.length; i++) {
        const parsedDecision = parsedDecisions[i];
        const decisionId = (isManual ? 'test-' : 'auto-') + Date.now() + '-' + i + '-' + Math.random().toString(16).slice(2);
        
        console.log(`[DecisionHistory] 处理决策 ${i + 1}/${parsedDecisions.length}: ${parsedDecision.symbol} ${parsedDecision.action}`);
      
      if (parsedDecision.action !== 'HOLD') {
        tradingCount++;
        // 发布交易决策
        const title = `${prefix} - ${parsedDecision.action} ${parsedDecision.symbol} (置信度: ${parsedDecision.confidence}%)`;
        const desc = `
${parsedDecision.reasoning}

决策详情：
- 操作: ${parsedDecision.action}
- 币种: ${parsedDecision.symbol}
- 入场价: ${parsedDecision.entryPrice || '市价'}
- 止盈: ${parsedDecision.takeProfit || 'N/A'}
- 止损: ${parsedDecision.stopLoss || 'N/A'}
- 杠杆: ${parsedDecision.leverage || 5}x
- 仓位大小: ${parsedDecision.sizeUSDT ? `$${parsedDecision.sizeUSDT} USDT` : parsedDecision.sizePercent ? `${parsedDecision.sizePercent}%` : '系统自动计算'}
- 时间框架: ${parsedDecision.timeframe || 'SHORT'}
        `.trim();
        
        console.log(`[DecisionHistory] 交易决策 #${tradingCount}:`, title);
        
        // 如果开启了自动执行，立即执行交易（无论手动还是自动触发）
        if (autoExecute) {
          console.log('[DecisionHistory] 自动执行交易:', title);
          if (isManual) message.info('🤖 自动执行模式已开启，正在执行交易...');
          
          try {
            const res = await fetch('/api/ai/execute-decision', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ decision: parsedDecision })
            });

            const result = await res.json();

            if (result.success) {
              // 执行成功，发布为已通过状态
              const executionInfo = `\n\n✅ 已自动执行
- 订单ID: ${result.order?.orderId}
- 实际数量: ${result.order?.quantity}张
- 杠杆: ${parsedDecision.leverage || 5}x
- 止盈止损: ${result.riskManagement?.note || '已设置'}`;
              
              await publishDecision({ 
                id: decisionId, 
                title, 
                desc: desc + executionInfo, 
                ts: Date.now(), 
                status: 'approved', // 直接标记为已通过
                prompt, 
                reply: aiReply 
              });
              console.log(`✅ [自动执行] ${title} - 订单ID: ${result.order?.orderId}`);
              if (isManual) message.success(`✅ 交易已自动执行！订单ID: ${result.order?.orderId}`);
            } else {
              // 执行失败，发布为待处理（让用户查看失败原因）
              await publishDecision({ 
                id: decisionId, 
                title: title + ' (执行失败)', 
                desc: desc + `\n\n❌ 执行失败：${result.error}`, 
                ts: Date.now(), 
                status: 'rejected',
                prompt, 
                reply: aiReply 
              });
              console.error(`❌ [自动执行] ${title} - 失败:`, result.error);
            }
          } catch (error) {
            // 执行异常，发布为待处理
            const err = error as Error;
            await publishDecision({ 
              id: decisionId, 
              title: title + ' (执行异常)', 
              desc: desc + `\n\n❌ 执行异常：${err.message}`, 
              ts: Date.now(), 
              status: 'rejected',
              prompt, 
              reply: aiReply 
            });
            console.error(`❌ [自动执行] ${title} - 异常:`, error);
          }
        } else {
          // 手动模式或手动测试：发布为待处理
          await publishDecision({ 
            id: decisionId, 
            title, 
            desc, 
            ts: Date.now(), 
            status: 'pending', 
            prompt, 
            reply: aiReply 
          });
          
          if (isManual) message.success('✅ 决策已生成！');
          console.log('[DecisionHistory] 已发布交易决策:', title);
        }
      } else {
        holdCount++;
        // HOLD 决策 - 只记录不同币种的第一个HOLD
        const symbolName = parsedDecision.symbol === 'GENERAL' ? '暂无交易机会' : parsedDecision.symbol;
        
        await publishDecision({
          id: decisionId,
          title: `${prefix} - HOLD - ${symbolName}`,
          desc: parsedDecision.reasoning,
          ts: Date.now(),
          status: 'approved', // HOLD自动标记为已查看
          prompt,
          reply: aiReply
        });
        
        console.log(`[DecisionHistory] HOLD决策 #${holdCount}: ${symbolName}`);
      }
      
      // 延迟100ms避免决策ID冲突
      if (i < parsedDecisions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } // for循环结束
      
      console.log(`[DecisionHistory] 决策处理完成: 交易=${tradingCount}, HOLD=${holdCount}, 总计=${parsedDecisions.length}`);
      
      // 所有决策处理完后，更新调用计数
      setInvocationCount(newCount);
      if (typeof window !== 'undefined') {
        localStorage.setItem('ai_decision_invocation_count', String(newCount));
      }
      
      if (isManual) {
        if (tradingCount > 0) {
          message.success(`✅ 已生成 ${tradingCount} 个交易决策，${holdCount} 个HOLD`);
        } else {
          message.info(`所有币种均建议HOLD（${holdCount}个）`);
        }
      }
      
    } catch (error) {
      const err = error as Error;
      if (isManual) message.error('生成失败: ' + err.message);
      console.error('[generateAIDecision]', error);
    } finally {
      if (isManual) setTesting(false);
    }
  };

  const handleDecisionClick = (decision: Decision) => {
    setSelectedDecision(decision);
    setModalOpen(true);
  };

  /**
   * 通过决策并执行交易（根据自动执行开关决定是否需要确认）
   */
  const handleApproveAndExecute = async (decision: Decision) => {
    try {
      // 1. 解析决策以获取交易参数
      const parsedDecision = parseDecisionFromText(decision.reply || '');
      
      if (!parsedDecision || parsedDecision.action === 'HOLD') {
        // HOLD决策直接标记为通过，不执行交易
        await updateDecisionStatus(decision.id, 'approved');
        message.info('HOLD决策已通过（无需执行交易）');
        return;
      }

      // 执行交易的函数
      const executeNow = async () => {
        message.loading('正在执行交易...', 0);
        
        try {
          const res = await fetch('/api/ai/execute-decision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision: parsedDecision })
          });

          const result = await res.json();
          message.destroy(); // 清除loading消息

          if (result.success) {
            await updateDecisionStatus(decision.id, 'approved');
            message.success(`✅ 订单已执行！订单ID: ${result.order?.orderId}`);
            console.log('[执行结果]', result);
          } else {
            message.error(`执行失败: ${result.error}`);
          }
        } catch (error) {
          message.destroy();
          const err = error as Error;
          message.error('执行失败: ' + err.message);
          console.error('[执行交易失败]', error);
        }
      };

      // 2. 根据自动执行开关决定是否需要确认
      if (autoExecute) {
        // 自动执行模式：直接执行，不需要确认
        console.log('[handleApproveAndExecute] 自动执行模式，直接执行');
        await executeNow();
      } else {
        // 手动模式：需要确认
        modal.confirm({
          title: '确认执行交易',
          content: (
            <div>
              <p>即将执行以下交易：</p>
              <ul>
                <li>币种: {parsedDecision.symbol}</li>
                <li>操作: {parsedDecision.action}</li>
                <li>入场价: {parsedDecision.entryPrice || '市价'}</li>
                <li>止盈: {parsedDecision.takeProfit || 'N/A'}</li>
                <li>止损: {parsedDecision.stopLoss || 'N/A'}</li>
                <li>杠杆: {parsedDecision.leverage || 5}x</li>
              </ul>
              <Alert 
                message="这将在OKX沙盒环境执行真实订单" 
                type="warning" 
                showIcon 
                style={{ marginTop: 8 }}
              />
            </div>
          ),
          onOk: executeNow
        });
      }

    } catch (error) {
      const err = error as Error;
      message.error('处理失败: ' + err.message);
      console.error('[handleApproveAndExecute]', error);
    }
  };

  /**
   * 仅标记为通过，不执行交易
   */
  const handleStatusChange = async (decisionId: string, newStatus: 'approved' | 'rejected') => {
    try {
      await updateDecisionStatus(decisionId, newStatus);
    } catch (error) {
      console.error('[handleStatusChange] 失败:', error);
      message.error('更新状态失败');
    }
  };

  /**
   * 批量执行所有待处理决策
   */
  const executeAllPending = async () => {
    const pending = decisions.filter(d => d.status === 'pending');
    
    if (pending.length === 0) {
      message.info('没有待处理的决策');
      return;
    }

    message.loading(`正在执行 ${pending.length} 个待处理决策...`, 0);
    
    let successCount = 0;
    let failCount = 0;

    for (const decision of pending) {
      try {
        const parsedDecision = parseDecisionFromText(decision.reply || '');
        
        if (!parsedDecision || parsedDecision.action === 'HOLD') {
          await updateDecisionStatus(decision.id, 'approved');
          successCount++;
          continue;
        }

        // 执行交易
        const res = await fetch('/api/ai/execute-decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: parsedDecision })
        });

        const result = await res.json();

        if (result.success) {
          await updateDecisionStatus(decision.id, 'approved');
          successCount++;
          console.log(`✅ [批量执行] ${decision.title}`);
        } else {
          // 执行失败，标记为拒绝
          await updateDecisionStatus(decision.id, 'rejected');
          failCount++;
          console.error(`❌ [批量执行] ${decision.title} - ${result.error}`);
        }

        // 延迟1秒避免API限流
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        failCount++;
        console.error('[批量执行] 异常:', error);
      }
    }

    message.destroy();
    message.success(`批量执行完成：成功 ${successCount} 个，失败 ${failCount} 个`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'green';
      case 'rejected': return 'red';
      default: return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved': return '已通过';
      case 'rejected': return '已拒绝';
      default: return '待处理';
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
      {/* 控制面板 */}
      <div style={{
        background: '#0f1116',
        border: '1px solid #1a1d26',
        borderRadius: 6,
        padding: 12,
        flexShrink: 0
      }}>
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {/* 状态统计 */}
          <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Text style={{ color: '#00e676', fontSize: 12, fontWeight: 'bold' }}>
              决策历史 ({decisions.length})
            </Text>
            <Space size={4}>
              <Tag color="default" style={{ fontSize: 11 }}>
                待处理: {decisions.filter(d => d.status === 'pending').length}
              </Tag>
              <Tag color="green" style={{ fontSize: 11 }}>
                已通过: {decisions.filter(d => d.status === 'approved').length}
              </Tag>
              <Tag color="red" style={{ fontSize: 11 }}>
                已拒绝: {decisions.filter(d => d.status === 'rejected').length}
              </Tag>
            </Space>
          </Space>
          
          {/* 自动请求开关和时间间隔 */}
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            <Space style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space size={8}>
                <Switch 
                  checked={autoRequest} 
                  onChange={toggleAutoRequest}
                  size="small"
                />
                <Text style={{ color: '#a1a9b7', fontSize: 12 }}>
                  自动请求
                </Text>
              </Space>
              <Text style={{ color: '#6b7280', fontSize: 11 }}>
                已调用 {invocationCount} 次
              </Text>
            </Space>
            
            {/* 时间间隔设置 */}
            {autoRequest && (
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                <Space style={{ width: '100%', alignItems: 'center' }} size={8}>
                  <Text style={{ color: '#6b7280', fontSize: 11 }}>间隔:</Text>
                  <InputNumber
                    value={intervalSeconds}
                    onChange={handleIntervalChange}
                    min={10}
                    max={86400}
                    step={10}
                    size="small"
                    style={{ width: 80 }}
                  />
                  <Text style={{ color: '#6b7280', fontSize: 11 }}>秒</Text>
                  <Text style={{ color: '#6b7280', fontSize: 11 }}>
                    ({
                      intervalSeconds >= 3600 
                        ? `${Math.floor(intervalSeconds / 3600)}小时${Math.floor((intervalSeconds % 3600) / 60) > 0 ? Math.floor((intervalSeconds % 3600) / 60) + '分' : ''}`
                        : intervalSeconds >= 60
                          ? `${Math.floor(intervalSeconds / 60)}分${intervalSeconds % 60 > 0 ? intervalSeconds % 60 + '秒' : ''}`
                          : `${intervalSeconds}秒`
                    })
                  </Text>
                </Space>
                {/* 快捷设置按钮 */}
                <Space size={4} wrap>
                  <Button size="small" type="text" onClick={() => handleIntervalChange(60)}>1分钟</Button>
                  <Button size="small" type="text" onClick={() => handleIntervalChange(300)}>5分钟</Button>
                  <Button size="small" type="text" onClick={() => handleIntervalChange(900)}>15分钟</Button>
                  <Button size="small" type="text" onClick={() => handleIntervalChange(3600)}>1小时</Button>
                  <Button size="small" type="text" onClick={() => handleIntervalChange(14400)}>4小时</Button>
                  <Button size="small" type="text" onClick={() => handleIntervalChange(86400)}>1天</Button>
                </Space>
              </Space>
            )}
          </Space>
          
          {/* 自动执行开关 */}
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            <Space style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space size={8}>
                <Switch 
                  checked={autoExecute} 
                  onChange={toggleAutoExecute}
                  size="small"
                />
                <Text style={{ color: autoExecute ? '#ff4d4f' : '#a1a9b7', fontSize: 12, fontWeight: autoExecute ? 'bold' : 'normal' }}>
                  {autoExecute ? '⚠️ 自动执行：已开启' : '自动执行：已关闭'}
                </Text>
              </Space>
              {autoExecute && (
                <Text style={{ color: '#ff4d4f', fontSize: 11 }}>
                  ⚠️ 谨慎
                </Text>
              )}
            </Space>
            
            {!autoExecute && (
              <Alert
                message="提示：自动执行已关闭，新决策将显示为待处理，需手动点击执行"
                type="info"
                showIcon
                style={{ fontSize: 11, padding: '4px 8px' }}
                banner
              />
            )}
          </Space>
          
          {/* 操作按钮 */}
          <Space style={{ width: '100%' }} size={4}>
            <Button 
              type="primary" 
              size="small" 
              onClick={() => generateAIDecision(true)}
              loading={testing}
              style={{ flex: 1 }}
            >
              {testing ? '生成中...' : '🧪 立即生成'}
            </Button>
            
            {/* 批量执行待处理决策 */}
            {decisions.filter(d => d.status === 'pending').length > 0 && (
              <Button 
                size="small" 
                danger
                onClick={executeAllPending}
                style={{ flex: 1 }}
              >
                执行全部待处理({decisions.filter(d => d.status === 'pending').length})
              </Button>
            )}
          </Space>
        </Space>
      </div>

      {/* 决策列表 */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        border: '1px solid #1a1d26',
        borderRadius: 6,
        padding: 8,
        background: '#0f1116'
      }}>
        {decisions.length === 0 ? (
          <Empty
            description={
              <Text style={{ color: '#a1a9b7' }}>
                暂无决策记录，等待AI分析市场数据后生成决策
              </Text>
            }
          />
        ) : (
          <List
            dataSource={decisions}
            renderItem={(decision) => (
              <List.Item
                style={{
                  borderBlockEnd: '1px solid #1a1d26',
                  cursor: 'pointer',
                  padding: '12px 8px'
                }}
                onClick={() => handleDecisionClick(decision)}
              >
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  <Space align="center" style={{ justifyContent: 'space-between' }}>
                    <Text style={{ color: '#00e676', fontSize: 14, fontWeight: 'bold' }}>
                      {decision.title}
                    </Text>
                    <Tag color={getStatusColor(decision.status)}>
                      {getStatusText(decision.status)}
                    </Tag>
                  </Space>
                  <Text style={{ color: '#a1a9b7', fontSize: 12 }}>
                    {decision.desc.length > 100
                      ? decision.desc.slice(0, 100) + '...'
                      : decision.desc
                    }
                  </Text>
                  <Text style={{ color: '#6b7280', fontSize: 11 }}>
                    {new Date(decision.ts).toLocaleString()}
                  </Text>

                  {/* 状态操作按钮 - 仅对待处理的决策显示 */}
                  {decision.status === 'pending' && (
                    <Space style={{ marginTop: 4 }}>
                      {autoExecute ? (
                        // 自动执行模式：提供立即执行按钮
                        <>
                          <Button
                            size="small"
                            type="primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApproveAndExecute(decision);
                            }}
                          >
                            ⚡ 立即执行
                          </Button>
                          <Button
                            size="small"
                            danger
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusChange(decision.id, 'rejected');
                            }}
                          >
                            拒绝
                          </Button>
                        </>
                      ) : (
                        // 手动模式：显示完整按钮
                        <>
                          <Button
                            size="small"
                            type="primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApproveAndExecute(decision);
                            }}
                          >
                            通过并执行
                          </Button>
                          <Button
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusChange(decision.id, 'approved');
                            }}
                          >
                            仅通过
                          </Button>
                          <Button
                            size="small"
                            danger
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusChange(decision.id, 'rejected');
                            }}
                          >
                            拒绝
                          </Button>
                        </>
                      )}
                    </Space>
                  )}
                </Space>
              </List.Item>
            )}
          />
        )}
      </div>

      {/* 决策详情弹窗 */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={selectedDecision?.status === 'pending' ? (
          <Space>
            <Button
              type="primary"
              onClick={() => {
                if (selectedDecision) {
                  handleApproveAndExecute(selectedDecision);
                  setModalOpen(false);
                }
              }}
            >
              通过并执行交易
            </Button>
            <Button
              onClick={() => {
                if (selectedDecision) {
                  handleStatusChange(selectedDecision.id, 'approved');
                  setModalOpen(false);
                }
              }}
            >
              仅通过
            </Button>
            <Button
              danger
              onClick={() => {
                if (selectedDecision) {
                  handleStatusChange(selectedDecision.id, 'rejected');
                  setModalOpen(false);
                }
              }}
            >
              拒绝
            </Button>
          </Space>
        ) : null}
        width={800}
        styles={{ mask: { backdropFilter: 'blur(4px)' } }}
        title={
          <Space>
            <Text style={{ color: '#00e676' }}>决策详情</Text>
            {selectedDecision && (
              <Tag color={getStatusColor(selectedDecision.status)}>
                {getStatusText(selectedDecision.status)}
              </Tag>
            )}
          </Space>
        }
      >
        {selectedDecision ? (
          <div style={{ color: '#ffffff' }}>
            <Typography.Title level={4} style={{ color: '#00e676', marginBottom: 16 }}>
              {selectedDecision.title}
            </Typography.Title>

            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <div>
                <Text style={{ color: '#a1a9b7', fontSize: 12, fontWeight: 'bold' }}>决策描述</Text>
                <Paragraph style={{ color: '#a1a9b7', whiteSpace: 'pre-wrap', margin: '4px 0' }}>
                  {selectedDecision.desc}
                </Paragraph>
              </div>

              <div>
                <Text style={{ color: '#a1a9b7', fontSize: 12, fontWeight: 'bold' }}>AI提示词</Text>
                <div style={{
                  background: '#0a0c10',
                  border: '1px solid #1a1d26',
                  borderRadius: 4,
                  padding: 12,
                  marginTop: 4,
                  maxHeight: 200,
                  overflowY: 'auto'
                }}>
                  <Text style={{ color: '#6b7280', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                    {selectedDecision.prompt || '（无提示词信息）'}
                  </Text>
                </div>
              </div>

              <div>
                <Text style={{ color: '#a1a9b7', fontSize: 12, fontWeight: 'bold' }}>AI完整回复</Text>
                <div style={{
                  background: '#0a0c10',
                  border: '1px solid #1a1d26',
                  borderRadius: 4,
                  padding: 12,
                  marginTop: 4,
                  maxHeight: 300,
                  overflowY: 'auto'
                }}>
                  <Text style={{ color: '#a1a9b7', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                    {selectedDecision.reply || '（无回复信息）'}
                  </Text>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <Text style={{ color: '#6b7280', fontSize: 11 }}>
                  生成时间：{new Date(selectedDecision.ts).toLocaleString()}
                </Text>
              </div>
            </Space>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}