"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Typography, Input, Button, List, Space, Switch } from 'antd';
import { publishDecision } from '@/lib/decisions';
import { composePrompt, parseDecisionFromText } from '@/lib/ai-trading-prompt';

const { Text } = Typography;

/**
 * AI 聊天面板（含自动模板询问）
 * @description 提供消息列表与输入框，并每三分钟自动向 AI 发送模板提示；后续可接入后端 `/api/ai/chat`。
 * @remarks 布局使用列式 flex，容器高度 100%，列表区域可滚动；自动询问可开关。
 */
export default function AIChat() {
  /**
   * 消息结构
   * @property role 角色：'user' | 'assistant'
   * @property content 文本内容
   * @property ts 时间戳（毫秒）
   * @property isPrompt 是否为“用户提示词”（自动/手动生成的长提示词）
   */
  /**
   * 消息结构
   * @property role 角色：'user' | 'assistant'
   * @property content 文本内容
   * @property ts 时间戳（毫秒）
   * @property isPrompt 是否为“用户提示词”（自动/手动生成的长提示词）
   * @property collapsed 单条提示词折叠状态（仅对 isPrompt 生效）；未设置时跟随全局开关
   */
  type Msg = { role: 'user' | 'assistant'; content: string; ts: number; isPrompt?: boolean; collapsed?: boolean };
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  /** 自动询问开关（默认开启） */
  const [auto, setAuto] = useState(true);
  /** 首次加载：从数据库拉取历史消息 */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/chat/history?limit=200', { cache: 'no-store' });
        const json = await res.json();
        if (json?.ok && Array.isArray(json?.data)) {
          interface HistoryRow {
            role: string;
            content: string;
            ts: number;
          }
          const hist: Msg[] = (json.data as HistoryRow[])
            .filter((r) => r && (r.role === 'user' || r.role === 'assistant') && r.content)
            .map((r) => ({ role: r.role as 'user' | 'assistant', content: String(r.content), ts: Number(r.ts), isPrompt: false }));
          setMessages(hist);
        }
      } catch {}
    })();
  }, []);
  /**
   * 展开/收起聊天区域
   * @remarks 展开时显示消息列表与输入框；收起时仅保留控制条，便于腾出空间。
   */
  const [expanded, setExpanded] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ai_chat_expanded') : null;
    return saved ? saved === 'true' : true;
  });
  /**
   * 提示词展开/收起（针对用户提示词内容）
   * @remarks 收起时仅显示提示词的首行摘要，避免长文本影响浏览；展开显示完整提示词。
   */
  const [promptExpanded, setPromptExpanded] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ai_chat_prompt_expanded') : null;
    // 默认折叠
    const def = false;
    return saved != null ? saved === 'true' : def;
  });
  /** 自动模板触发次数（本地持久化） */
  const [invocations, setInvocations] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const saved = localStorage.getItem('ai_chat_auto_invocations');
    return saved ? Number(saved) : 0;
  });
  /** 定时器引用，避免多次注册 */
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  /** AI 请求的并发控制（避免重复发送） */
  const aiAbortRef = useRef<AbortController | null>(null);

  
  /**
   * 模板后缀（静态说明与占位数据）
   * @remarks 真实价格/信号/仓位数据可在后续接入后端 API 后替换。
   */
  const STATIC_TEMPLATE_SUFFIX = useMemo(() => `
ALL OF THE PRICE OR SIGNAL DATA BELOW IS ORDERED: OLDEST → NEWEST

Timeframes note: Unless stated otherwise in a section title, intraday series are provided at 3‑minute intervals. If a coin uses a different interval, it is explicitly stated in that coin’s section.

CURRENT MARKET STATE FOR ALL COINS
ALL BTC DATA
current_price = 110034.5, current_ema20 = 110018.721, current_macd = -29.507, current_rsi (7 period) = 58.368

In addition, here is the latest BTC open interest and funding rate for perps (the instrument you are trading):

Open Interest: Latest: 30627.64 Average: 30632.08

Funding Rate: 1.25e-05

Intraday series (by minute, oldest → latest):

Mid prices: [109908.0, 109922.5, 109974.0, 109977.5, 109992.5, 110006.5, 110029.0, 110022.0, 110010.0, 110034.5]

EMA indicators (20‑period): [110035.374, 110024.1, 110019.234, 110015.211, 110014.239, 110013.359, 110015.896, 110015.335, 110017.112, 110018.721]

MACD indicators: [-75.656, -76.136, -71.178, -66.163, -59.246, -53.151, -44.979, -40.456, -34.537, -29.507]

RSI indicators (7‑Period): [37.116, 36.744, 48.08, 48.844, 54.331, 54.331, 61.38, 53.173, 58.368, 58.368]

RSI indicators (14‑Period): [38.069, 37.869, 43.82, 44.231, 47.145, 47.145, 50.867, 47.762, 50.372, 50.372]

Longer‑term context (4‑hour timeframe):

20‑Period EMA: 110389.719 vs. 50‑Period EMA: 111034.958

3‑Period ATR: 444.048 vs. 14‑Period ATR: 721.016

Current Volume: 53.457 vs. Average Volume: 4329.191

MACD indicators: [-1094.546, -1171.909, -1151.52, -1105.43, -991.709, -902.079, -853.405, -817.111, -723.125, -657.601]

RSI indicators (14‑Period): [26.525, 37.249, 41.628, 42.709, 46.773, 46.188, 44.422, 43.767, 47.798, 46.748]

ALL ETH DATA
current_price = 3873.85, current_ema20 = 3873.184, current_macd = 0.394, current_rsi (7 period) = 52.713

In addition, here is the latest ETH open interest and funding rate for perps:

Open Interest: Latest: 482077.21 Average: 482125.66

Funding Rate: 3.663e-06

Intraday series (3‑minute intervals, oldest → latest):

Mid prices: [3871.15, 3872.35, 3874.25, 3871.8, 3873.7, 3872.65, 3874.7, 3873.2, 3873.05, 3873.85]

EMA indicators (20‑period): [3872.803, 3872.698, 3872.803, 3872.717, 3872.906, 3872.915, 3873.094, 3873.047, 3873.119, 3873.184]

MACD indicators: [0.431, 0.296, 0.354, 0.244, 0.379, 0.344, 0.457, 0.364, 0.383, 0.394]

RSI indicators (7‑Period): [39.733, 43.214, 55.738, 45.212, 58.641, 49.966, 57.697, 47.28, 52.713, 52.713]

RSI indicators (14‑Period): [51.445, 52.555, 57.002, 52.232, 57.832, 53.715, 57.19, 52.046, 54.453, 54.453]

Longer‑term context (4‑hour timeframe):

20‑Period EMA: 3888.478 vs. 50‑Period EMA: 3936.065

3‑Period ATR: 19.211 vs. 14‑Period ATR: 36.373

Current Volume: 228.715 vs. Average Volume: 88378.746

MACD indicators: [-60.608, -63.757, -63.231, -62.131, -57.298, -53.943, -48.674, -46.727, -43.561, -40.751]

RSI indicators (14‑Period): [23.663, 37.513, 40.394, 40.366, 44.627, 43.514, 46.213, 43.21, 44.776, 44.576]

ALL SOL DATA
current_price = 185.755, current_ema20 = 185.716, current_macd = -0.087, current_rsi (7 period) = 56.147

In addition, here is the latest SOL open interest and funding rate for perps:

Open Interest: Latest: 4932678.6 Average: 4932630.98

Funding Rate: 2.8451e-06

Intraday series (3‑minute intervals, oldest → latest):

SOL mid prices: [185.415, 185.47, 185.575, 185.48, 185.585, 185.675, 185.855, 185.71, 185.645, 185.755]

EMA indicators (20‑period): [185.777, 185.745, 185.726, 185.703, 185.698, 185.696, 185.712, 185.707, 185.711, 185.716]

MACD indicators: [-0.215, -0.216, -0.206, -0.201, -0.181, -0.161, -0.129, -0.119, -0.102, -0.087]

RSI indicators (7‑Period): [38.362, 37.936, 45.672, 41.803, 53.066, 54.865, 64.411, 50.551, 55.57, 56.147]

RSI indicators (14‑Period): [40.415, 40.191, 43.882, 42.101, 47.656, 48.593, 53.924, 47.972, 50.614, 50.912]

Longer‑term context (4‑hour timeframe):

20‑Period EMA: 189.461 vs. 50‑Period EMA: 191.735

3‑Period ATR: 1.207 vs. 14‑Period ATR: 2.142

Current Volume: 901.49 vs. Average Volume: 716339.836

MACD indicators: [-2.278, -2.683, -2.906, -3.036, -2.83, -2.701, -2.534, -2.464, -2.389, -2.421]

RSI indicators (14‑Period): [28.133, 37.703, 39.06, 39.327, 45.22, 44.127, 44.906, 43.238, 43.101, 40.807]

ALL BNB DATA
current_price = 1086.9, current_ema20 = 1087.243, current_macd = 0.076, current_rsi (7 period) = 41.214

In addition, here is the latest BNB open interest and funding rate for perps:

Open Interest: Latest: 61949.92 Average: 61956.3

Funding Rate: -6.0366e-06

Intraday series (3‑minute intervals, oldest → latest):

BNB mid prices: [1087.4, 1087.5, 1087.65, 1087.75, 1087.35, 1087.55, 1087.5, 1087.05, 1086.95, 1086.9]

EMA indicators (20‑period): [1087.266, 1087.27, 1087.292, 1087.331, 1087.318, 1087.345, 1087.35, 1087.298, 1087.279, 1087.243]

MACD indicators: [0.304, 0.275, 0.265, 0.27, 0.231, 0.23, 0.21, 0.145, 0.116, 0.076]

RSI indicators (7‑Period): [49.619, 47.631, 52.109, 56.452, 44.643, 53.686, 49.015, 37.574, 45.055, 41.214]

RSI indicators (14‑Period): [52.691, 51.824, 53.473, 55.126, 50.312, 53.789, 51.836, 46.394, 49.262, 47.44]

Longer‑term context (4‑hour timeframe):

20‑Period EMA: 1095.999 vs. 50‑Period EMA: 1107.442

3‑Period ATR: 4.538 vs. 14‑Period ATR: 9.703

Current Volume: 22.199 vs. Average Volume: 8620.981

MACD indicators: [-10.944, -11.931, -12.011, -10.851, -10.688, -10.718, -10.245, -9.828, -9.215, -8.925]

RSI indicators (14‑Period): [29.663, 40.151, 42.668, 47.305, 44.218, 43.242, 44.998, 44.712, 45.62]
`, []);


  /**
   * 从后端生成提示词
   * @returns README 模板风格的提示词；失败时返回静态占位模板
   * @remarks 调用 `/api/ai/prompt` 聚合真实数据与指标。
   */
  const generatePrompt = async (): Promise<string> => {
    try {
      const res = await fetch('/api/ai/prompt', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.prompt) return String(json.prompt);
      return STATIC_TEMPLATE_SUFFIX;
    } catch {
      return STATIC_TEMPLATE_SUFFIX;
    }
  };

  const send = () => {
    const t = text.trim();
    if (!t) return;
    const now = Date.now();
    const next: Msg[] = [...messages, { role: 'user', content: t, ts: now, isPrompt: false }];
    setMessages(next);
    // 真实调用 AI 服务获取回复
    (async () => {
      const reply = await callAI(next);
      setMessages((arr) => [...arr, { role: 'assistant', content: reply, ts: Date.now() + 1, isPrompt: false }]);
      // 尝试解析结构化决策（新生成的，显示日志）
      try {
        const parsedDecision = parseDecisionFromText(reply, false);
        if (parsedDecision && parsedDecision.action !== 'HOLD') {
          const title = `${parsedDecision.action} ${parsedDecision.symbol}`;
          const desc = parsedDecision.reasoning;
          publishDecision({ 
            id: String(Date.now()) + Math.random().toString(16).slice(2), 
            title, 
            desc, 
            ts: Date.now(), 
            status: 'pending', 
            prompt: t, 
            reply 
          });
        }
      } catch {
        // 解析失败时静默处理
      }
    })();
    setText('');
  };

  /**
   * 立即发送一次自动模板（手动触发）
   */
  const sendTemplateOnce = async () => {
    const now = Date.now();
    const invokes = invocations + 1;
    const marketData = await generatePrompt();
    
    // 计算交易时长
    let tradingStartTime = Date.now();
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ai_trading_start_time');
      tradingStartTime = saved ? Number(saved) : Date.now();
      if (!saved) localStorage.setItem('ai_trading_start_time', String(tradingStartTime));
    }
    const tradingMinutes = Math.floor((now - tradingStartTime) / 60000);
    
    // 使用原有的简洁提示词格式
    const prompt = composePrompt(marketData, invokes, tradingMinutes);
    
    setMessages((arr) => [
      ...arr,
      { role: 'user', content: prompt, ts: now, isPrompt: true, collapsed: true },
    ]);
    
    // 调用 AI 服务获取回复
    (async () => {
      const reply = await callAI([
        ...messages,
        { role: 'user', content: prompt, ts: now, isPrompt: true, collapsed: true }
      ]);
      setMessages((arr) => [...arr, { role: 'assistant', content: reply, ts: Date.now() + 1, isPrompt: false }]);
      
      // 使用改进的决策解析器（新生成的，显示日志）
      try {
        const parsedDecision = parseDecisionFromText(reply, false);
        if (parsedDecision && parsedDecision.action !== 'HOLD') {
          // 发布结构化决策
          const title = `${parsedDecision.action} ${parsedDecision.symbol} (置信度: ${parsedDecision.confidence}%)`;
          const desc = `
${parsedDecision.reasoning}

决策详情：
- 操作: ${parsedDecision.action}
- 币种: ${parsedDecision.symbol}
- 入场价: ${parsedDecision.entryPrice || 'N/A'}
- 止盈: ${parsedDecision.takeProfit || 'N/A'}
- 止损: ${parsedDecision.stopLoss || 'N/A'}
- 杠杆: ${parsedDecision.leverage || 'N/A'}x
- 仓位大小: ${parsedDecision.sizePercent || 'N/A'}%
- 时间框架: ${parsedDecision.timeframe || 'N/A'}
          `.trim();
          
          publishDecision({ 
            id: String(Date.now()) + Math.random().toString(16).slice(2), 
            title, 
            desc, 
            ts: Date.now(), 
            status: 'pending', 
            prompt, 
            reply 
          });
        } else if (parsedDecision && parsedDecision.action === 'HOLD') {
          // HOLD决策也记录
          publishDecision({
            id: String(Date.now()) + Math.random().toString(16).slice(2),
            title: 'HOLD - 暂无交易机会',
            desc: parsedDecision.reasoning,
            ts: Date.now(),
            status: 'approved',
            prompt,
            reply
          });
        }
      } catch {
        // 如果结构化解析失败，使用简单关键词提取作为备份
        console.log('[AIChat] 使用简单关键词提取');
      }
    })();
    
    setInvocations(invokes);
    if (typeof window !== 'undefined') localStorage.setItem('ai_chat_auto_invocations', String(invokes));
  };

  /**
   * 自动每三分钟发送一次模板
   * @remarks 间隔可通过环境变量 `NEXT_PUBLIC_AI_CHAT_INTERVAL_MS` 配置，默认 180000ms。
   */
  useEffect(() => {
    const intervalMs = Number(process.env.NEXT_PUBLIC_AI_CHAT_INTERVAL_MS || 180000);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  if (auto) {
      timerRef.current = setInterval(() => {
        (async () => {
          const now = Date.now();
          const invokes = invocations + 1;
          const marketData = await generatePrompt();
          
          // 计算交易时长
          let tradingStartTime = Date.now();
          if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('ai_trading_start_time');
            tradingStartTime = saved ? Number(saved) : Date.now();
            if (!saved) localStorage.setItem('ai_trading_start_time', String(tradingStartTime));
          }
          const tradingMinutes = Math.floor((now - tradingStartTime) / 60000);
          
          // 使用原有的简洁提示词格式
          const prompt = composePrompt(marketData, invokes, tradingMinutes);
          
          // 追加用户提示词并请求 AI 回复
          const nextUser: Msg = { role: 'user', content: prompt, ts: now, isPrompt: true, collapsed: true };
          setMessages((arr) => [...arr, nextUser]);
          const reply = await callAI([...messages, nextUser]);
          setMessages((arr) => [...arr, { role: 'assistant', content: reply, ts: Date.now() + 1, isPrompt: false }]);
          
          // 使用改进的决策解析器（新生成的，显示日志）
          try {
            const parsedDecision = parseDecisionFromText(reply, false);
            if (parsedDecision && parsedDecision.action !== 'HOLD') {
              const title = `${parsedDecision.action} ${parsedDecision.symbol} (置信度: ${parsedDecision.confidence}%)`;
              const desc = `
${parsedDecision.reasoning}

决策详情：
- 操作: ${parsedDecision.action}
- 币种: ${parsedDecision.symbol}
- 入场价: ${parsedDecision.entryPrice || 'N/A'}
- 止盈: ${parsedDecision.takeProfit || 'N/A'}
- 止损: ${parsedDecision.stopLoss || 'N/A'}
- 杠杆: ${parsedDecision.leverage || 'N/A'}x
- 仓位大小: ${parsedDecision.sizePercent || 'N/A'}%
- 时间框架: ${parsedDecision.timeframe || 'N/A'}
              `.trim();
              
              publishDecision({ 
                id: String(Date.now()) + Math.random().toString(16).slice(2), 
                title, 
                desc, 
                ts: Date.now(), 
                status: 'pending', 
                prompt, 
                reply 
              });
            } else if (parsedDecision && parsedDecision.action === 'HOLD') {
              publishDecision({
                id: String(Date.now()) + Math.random().toString(16).slice(2),
                title: 'HOLD - 暂无交易机会',
                desc: parsedDecision.reasoning,
                ts: Date.now(),
                status: 'approved',
                prompt,
                reply
              });
            }
          } catch {
            console.log('[AIChat] 自动决策解析失败，使用备用方案');
          }
          
          setInvocations(invokes);
          if (typeof window !== 'undefined') localStorage.setItem('ai_chat_auto_invocations', String(invokes));
        })();
      }, intervalMs);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, invocations]);

  /**
   * 切换展开状态并持久化
   */
  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    if (typeof window !== 'undefined') localStorage.setItem('ai_chat_expanded', String(next));
  };
  /**
   * 切换提示词展开状态并持久化
   */
  const togglePromptExpanded = () => {
    const next = !promptExpanded;
    setPromptExpanded(next);
    if (typeof window !== 'undefined') localStorage.setItem('ai_chat_prompt_expanded', String(next));
  };

  /**
   * 切换单条提示词的折叠状态
   * @param ts 消息时间戳（作为本地唯一键）
   * @remarks 若消息未设置 collapsed，则以当前全局折叠状态（!promptExpanded）为默认值后取反；保留全局开关以控制未单独设置的消息。
   */
  const toggleOnePrompt = (ts: number) => {
    setMessages((arr) => arr.map((m) => {
      if (m.ts !== ts || !(m.role === 'user' && m.isPrompt)) return m;
      const current = m.collapsed ?? !promptExpanded;
      return { ...m, collapsed: !current };
    }));
  };

  /**
   * 调用后端 AI 聊天接口，返回助手文本
   * @param conv 当前会话（含新加入的用户消息）
   * @returns 助手回复文本；失败时返回错误占位提示
   * @remarks 使用 AbortController 防止并发请求堆积；后端路由为 `/api/ai/chat`。
   */
  const callAI = async (conv: Msg[]): Promise<string> => {
    try {
      const payload = conv.map((m) => ({ role: m.role, content: m.content }));
      aiAbortRef.current?.abort();
      const ac = new AbortController();
      aiAbortRef.current = ac;
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }),
        signal: ac.signal,
      });
      const json = await res.json();
      if (res.ok && json?.ok && json?.content) return String(json.content);
      throw new Error(json?.error || 'AI 聊天失败');
    } catch (e) {
      const err = e as Error & { name?: string };
      if (err?.name === 'AbortError') return '（本次请求已取消）';
      return `（AI 回复失败：${err?.message || '未知错误'}）`;
    }
  };


  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
      {/* 控制栏 */}
      <Space align="center" style={{ justifyContent: 'space-between', flexWrap: 'wrap', flexShrink: 0 }}>
        <Space size={8}>
          <Switch checked={auto} onChange={setAuto} />
          <Text style={{ color: '#a1a9b7', fontSize: 12 }}>{auto ? '自动询问：每 3 分钟' : '自动询问：已关闭'}</Text>
        </Space>
        <Space size={4}>
          <Button size="small" onClick={toggleExpanded}>{expanded ? '收起' : '展开'}</Button>
          <Button size="small" onClick={togglePromptExpanded}>{promptExpanded ? '收起提示词' : '展开提示词'}</Button>
          <Button size="small" onClick={sendTemplateOnce}>立即询问一次</Button>
        </Space>
      </Space>

      {expanded ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', border: '1px solid #1a1d26', borderRadius: 6, padding: 8, background: '#0f1116' }}>
          {messages.length === 0 ? (
            <Text style={{ color: '#a1a9b7' }}>暂无消息，输入内容开始与 AI 对话</Text>
          ) : (
            <List
              dataSource={messages}
              renderItem={(m) => (
                <List.Item style={{ borderBlockEnd: '1px solid #1a1d26' }}>
                  <Space direction="vertical" style={{ width: '100%' }} size={4}>
                    {m.role === 'user' && m.isPrompt ? (
                      <>
                        {/**
                         * 单条提示词折叠优先：m.collapsed 未设置时跟随全局 !promptExpanded
                         * @remarks 提供"展开此提示词/折叠此提示词"单条开关，同时保留顶部的全局折叠开关。
                         */}
                        <Space align="center" style={{ justifyContent: 'space-between' }}>
                          {(m.collapsed ?? !promptExpanded) ? (
                            <Text style={{ color: '#00e676' }}>
                              我（提示词，已折叠）：{m.content.split('\n')[0]} ...
                            </Text>
                          ) : (
                            <Text style={{ color: '#00e676', whiteSpace: 'pre-wrap' }}>
                              我（提示词）：{m.content}
                            </Text>
                          )}
                          <Button size="small" type="link" onClick={() => toggleOnePrompt(m.ts)}>
                            {(m.collapsed ?? !promptExpanded) ? '展开此提示词' : '折叠此提示词'}
                          </Button>
                        </Space>
                      </>
                    ) : (
                      <Text style={{ color: m.role === 'user' ? '#00e676' : '#a1a9b7', whiteSpace: 'pre-wrap' }}>
                        {m.role === 'user' ? '我' : 'AI'}：{m.content}
                      </Text>
                    )}
                    <Text style={{ color: '#6b7280', fontSize: 12 }}>{new Date(m.ts).toLocaleString()}</Text>
                  </Space>
                </List.Item>
              )}
            />
          )}
        </div>
      ) : (
        <div style={{ border: '1px dashed #1a1d26', borderRadius: 6, padding: 12, background: '#0f1116', flexShrink: 0 }}>
          <Text style={{ color: '#a1a9b7', fontSize: 12 }}>
            聊天区域已收起。{messages.length ? `最近消息：${new Date(messages[messages.length - 1].ts).toLocaleString()}` : '暂无消息'}
          </Text>
        </div>
      )}

      {expanded && (
        <Space.Compact style={{ flexShrink: 0 }}>
          <Input.TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoSize={{ minRows: 1, maxRows: 3 }}
            placeholder="输入内容后点击发送"
          />
          <Button type="primary" onClick={send}>发送</Button>
        </Space.Compact>
      )}
    </div>
  );
}