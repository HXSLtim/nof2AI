"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Typography, Input, Button, List, Space, Switch } from 'antd';

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
  type Msg = { role: 'user' | 'assistant'; content: string; ts: number; isPrompt?: boolean };
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  /** 自动询问开关（默认开启） */
  const [auto, setAuto] = useState(true);
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
    return saved ? saved === 'true' : true;
  });
  /** 交易开始时间（本地持久化），用于计算已交易分钟数 */
  const [startTs, setStartTs] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ai_chat_trading_start_ts') : null;
    const v = saved ? Number(saved) : Date.now();
    if (typeof window !== 'undefined' && !saved) localStorage.setItem('ai_chat_trading_start_ts', String(v));
    return v;
  });
  /** 自动模板触发次数（本地持久化） */
  const [invocations, setInvocations] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ai_chat_auto_invocations') : null;
    return saved ? Number(saved) : 0;
  });
  /** 定时器引用，避免多次注册 */
  const timerRef = useRef<any>(null);

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

  /** 组装当前时间字符串（yyyy-MM-dd HH:mm:ss.SSS） */
  const fmtNow = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = d.getFullYear();
    const M = pad(d.getMonth() + 1);
    const D = pad(d.getDate());
    const h = pad(d.getHours());
    const m = pad(d.getMinutes());
    const s = pad(d.getSeconds());
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${y}-${M}-${D} ${h}:${m}:${s}.${ms}`;
  };

  /**
   * 生成自动模板消息（拼接服务端提示词）
   * @param minutes 已交易分钟数
   * @param currentTime 当前时间字符串
   * @param invokes 自动触发次数
   * @param suffix 服务端聚合提示词（README 模板风格）
   * @returns 拼装后的完整提示词
   * @remarks 将动态头部与服务端生成的真实数据提示词进行拼接；服务端不可用时会退回静态占位模板。
   */
  const composeAutoPrompt = (minutes: number, currentTime: string, invokes: number, suffix: string) => {
    return `It has been ${minutes} minutes since you started trading. The current time is ${currentTime} and you've been invoked ${invokes} times. Below, we are providing you with a variety of state data, price data, and predictive signals so you can discover alpha. Below that is your current account information, value, performance, positions, etc.\n\n${suffix}`;
  };

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
    } catch (e) {
      return STATIC_TEMPLATE_SUFFIX;
    }
  };

  const send = () => {
    const t = text.trim();
    if (!t) return;
    const now = Date.now();
    const next: Msg[] = [...messages, { role: 'user', content: t, ts: now, isPrompt: false }];
    // 本地模拟助手回覆
    next.push({ role: 'assistant', content: '收到：' + t, ts: now + 1, isPrompt: false });
    setMessages(next);
    setText('');
  };

  /**
   * 立即发送一次自动模板（手动触发）
   */
  const sendTemplateOnce = async () => {
    const now = Date.now();
    const minutes = Math.max(0, Math.floor((now - startTs) / 60000));
    const currentTime = fmtNow();
    const invokes = invocations + 1;
    const suffix = await generatePrompt();
    const content = composeAutoPrompt(minutes, currentTime, invokes, suffix);
    setMessages((arr) => [...arr, { role: 'user', content, ts: now, isPrompt: true }, { role: 'assistant', content: '提示词已生成并发送（占位回复，待接入 AI 推理）。', ts: now + 1, isPrompt: false }]);
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
          const minutes = Math.max(0, Math.floor((now - startTs) / 60000));
          const currentTime = fmtNow();
          const invokes = invocations + 1;
          const suffix = await generatePrompt();
          const content = composeAutoPrompt(minutes, currentTime, invokes, suffix);
          setMessages((arr) => [...arr, { role: 'user', content, ts: now, isPrompt: true }, { role: 'assistant', content: '提示词已生成并发送（占位回复，待接入 AI 推理）。', ts: now + 1, isPrompt: false }]);
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
  }, [auto, startTs, invocations]);

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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Space align="center" style={{ justifyContent: 'space-between' }}>
        <Space>
          <Switch checked={auto} onChange={setAuto} />
          <Text style={{ color: '#a1a9b7' }}>{auto ? '自动询问：每 3 分钟' : '自动询问：已关闭'}</Text>
        </Space>
        <Space>
          <Button size="small" onClick={toggleExpanded}>{expanded ? '收起' : '展开'}</Button>
          <Button size="small" onClick={togglePromptExpanded}>{promptExpanded ? '收起提示词' : '展开提示词'}</Button>
          <Button size="small" onClick={sendTemplateOnce}>立即询问一次</Button>
        </Space>
      </Space>
      {expanded ? (
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #1a1d26', borderRadius: 6, padding: 8, background: '#0f1116' }}>
          {messages.length === 0 ? (
            <Text style={{ color: '#a1a9b7' }}>暂无消息，输入内容开始与 AI 对话</Text>
          ) : (
            <List
              dataSource={messages}
              renderItem={(m) => (
                <List.Item style={{ borderBlockEnd: '1px solid #1a1d26' }}>
                  <Space direction="vertical" style={{ width: '100%' }} size={4}>
                    {m.role === 'user' && m.isPrompt && !promptExpanded ? (
                      <Text style={{ color: '#00e676' }}>
                        我（提示词，已折叠）：{m.content.split('\n')[0]} ...
                      </Text>
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
        <div style={{ border: '1px dashed #1a1d26', borderRadius: 6, padding: 8, background: '#0f1116' }}>
          <Text style={{ color: '#a1a9b7' }}>
            聊天区域已收起。{messages.length ? `最近消息：${new Date(messages[messages.length - 1].ts).toLocaleString()}` : '暂无消息'}
          </Text>
        </div>
      )}
      {expanded && (
        <Space.Compact>
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